import {
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { ArchiveService } from './archive.service';
import { audioMime } from './audio-policy';
import { ConfigService } from '@nestjs/config';
import { getJwtSecret } from '../../common/utils/jwt-secret.util';

@Injectable()
export class AudioPlaybackService {
  private readonly logger = new Logger(AudioPlaybackService.name);

  constructor(
    private readonly db: DataSource,
    private readonly archive: ArchiveService,
    private readonly config: ConfigService,
  ) {}

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async limit(actorId: string, operation: string, maximum: number) {
    const [row] = await this.db.query(
      `INSERT INTO audio_playback_limits (actor_id, operation, bucket, attempts)
       VALUES ($1, $2, floor(extract(epoch FROM now()) / 60)::bigint, 1)
       ON CONFLICT (actor_id, operation, bucket) DO UPDATE
       SET attempts = audio_playback_limits.attempts + 1 RETURNING attempts`,
      [actorId, operation],
    );
    if (row.attempts > maximum)
      throw new HttpException('Too many playback requests', 429);
  }

  async issue(
    actorId: string,
    source: string,
    feedbackId: string,
    id: string,
    requiresAdmin = true,
  ) {
    await this.limit(actorId, 'issue', 20);
    const record = await this.archive.evidence(source, feedbackId, id);
    audioMime(record);
    const token = randomBytes(32).toString('base64url');
    await this.db.transaction(async (db) => {
      await db.query(
        `INSERT INTO audio_playback_tickets
         (token_hash, actor_id, source, feedback_id, evidence_id, requires_admin, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, now() + interval '60 seconds')`,
        [this.hash(token), actorId, source, feedbackId, id, requiresAdmin],
      );
      await db.query(
        `INSERT INTO audio_playback_audit (actor_id, action, evidence_id) VALUES ($1, 'issued', $2)`,
        [actorId, id],
      );
    });
    return { token, expiresIn: 60 };
  }

  async play(actorId: string, token: string, isAdmin: boolean) {
    await this.limit(actorId, 'play', 30);
    // The atomic claim is shared by all API replicas; only the winner receives bytes.
    const rows = await this.db.query(
      `WITH claimed AS (
         UPDATE audio_playback_tickets SET consumed_at = now()
         WHERE token_hash = $1 AND actor_id = $2 AND expires_at > now()
           AND consumed_at IS NULL AND revoked_at IS NULL
           AND (NOT requires_admin OR $3)
         RETURNING source, feedback_id, evidence_id
       ), audited AS (
         INSERT INTO audio_playback_audit (actor_id, action, evidence_id)
         SELECT $2, 'claimed', evidence_id FROM claimed
       ) SELECT * FROM claimed`,
      [this.hash(token), actorId, isAdmin],
    );
    if (rows.length !== 1) {
      await this.db.query(
        `INSERT INTO audio_playback_audit (actor_id, action) VALUES ($1, 'denied')`,
        [actorId],
      );
      throw new ForbiddenException(
        'Playback permission expired or already used',
      );
    }
    const ticket = rows[0];
    // Reload through the normal binding and soft-delete checks, not a raw blob lookup.
    const record = await this.archive.evidence(
      ticket.source,
      ticket.feedback_id,
      ticket.evidence_id,
      true,
    );
    return { data: record.data, mimeType: audioMime(record) };
  }

  async revoke(actorId: string) {
    await this.db.transaction(async (db) => {
      await db.query(
        `UPDATE audio_playback_tickets SET revoked_at = now() WHERE actor_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL`,
        [actorId],
      );
      await db.query(
        `INSERT INTO audio_playback_audit (actor_id, action) VALUES ($1, 'revoked')`,
        [actorId],
      );
    });
    return { revoked: true };
  }

  async share(actorId: string, source: string, feedbackId: string, id: string) {
    await this.limit(actorId, 'share', 20);
    audioMime(await this.archive.evidence(source, feedbackId, id));
    const token = randomBytes(32).toString('base64url');
    const [row] = await this.db.transaction(async (db) => {
      const result = await db.query(
        `INSERT INTO audio_guest_links (token_hash, created_by, source, feedback_id, evidence_id, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '24 hours') RETURNING expires_at`,
        [this.hash(token), actorId, source, feedbackId, id],
      );
      await db.query(
        `INSERT INTO audio_playback_audit (actor_id, action, evidence_id) VALUES ($1, 'guest_link_issued', $2)`,
        [actorId, id],
      );
      return result;
    });
    const origin = new URL(this.config.getOrThrow<string>('FRONTEND_URL'))
      .origin;
    return { url: `${origin}/listen#t=${token}`, expiresAt: row.expires_at };
  }

  async guestLimit(address: string, token: string) {
    // Do not trust client-supplied forwarding headers. The peer limit also bounds
    // randomized-token attempts when the API is behind its private reverse proxy.
    for (const [key, max] of [
      [`peer:${address}`, 180],
      [`token:${token}`, 12],
    ] as const) {
      const hash = this.hash(`${getJwtSecret(this.config)}:${key}`);
      const [row] = await this.db.query(
        `INSERT INTO audio_guest_limits (key_hash, bucket, attempts)
         VALUES ($1, floor(extract(epoch FROM now()) / 60)::bigint, 1)
         ON CONFLICT (key_hash, bucket) DO UPDATE SET attempts = audio_guest_limits.attempts + 1 RETURNING attempts`,
        [hash],
      );
      if (row.attempts > max)
        throw new HttpException('Too many playback requests', 429);
    }
  }

  async guestStatus(token: string) {
    const [row] = await this.db.query(
      `SELECT source, feedback_id, evidence_id,
       (expires_at > now() AND consumed_at IS NULL AND revoked_at IS NULL) AS available
       FROM audio_guest_links WHERE token_hash = $1`,
      [this.hash(token)],
    );
    if (!row) throw new ForbiddenException('Audio link unavailable');
    return {
      available: row.available,
      path: `/archive/${row.source}/feedbacks/${row.feedback_id}/evidence/${row.evidence_id}`,
    };
  }

  async guestPlay(token: string) {
    const rows = await this.db.query(
      `WITH claimed AS (
         UPDATE audio_guest_links SET consumed_at = now()
         WHERE token_hash = $1 AND expires_at > now() AND consumed_at IS NULL AND revoked_at IS NULL
         RETURNING source, feedback_id, evidence_id
       ), audited AS (
         INSERT INTO audio_playback_audit (action, evidence_id)
         SELECT 'guest_claimed', evidence_id FROM claimed
       ) SELECT * FROM claimed`,
      [this.hash(token)],
    );
    if (rows.length !== 1)
      throw new ForbiddenException('Sign in to listen again');
    const ticket = rows[0];
    const record = await this.archive.evidence(
      ticket.source,
      ticket.feedback_id,
      ticket.evidence_id,
      true,
    );
    return { data: record.data, mimeType: audioMime(record) };
  }

  async revokeShare(actorId: string, token: string) {
    await this.db.transaction(async (db) => {
      await db.query(
        `UPDATE audio_guest_links SET revoked_at = now() WHERE token_hash = $1`,
        [this.hash(token)],
      );
      await db.query(
        `INSERT INTO audio_playback_audit (actor_id, action) VALUES ($1, 'guest_link_revoked')`,
        [actorId],
      );
    });
    return { revoked: true };
  }

  @Cron('17 * * * *')
  async cleanup() {
    try {
      await this.db.query(
        `DELETE FROM audio_playback_tickets WHERE expires_at < now() - interval '1 day'`,
      );
      await this.db.query(
        `DELETE FROM audio_playback_limits WHERE bucket < floor(extract(epoch FROM now()) / 60)::bigint - 2`,
      );
      await this.db.query(
        `DELETE FROM audio_guest_limits WHERE bucket < floor(extract(epoch FROM now()) / 60)::bigint - 2`,
      );
      await this.db.query(
        `DELETE FROM audio_playback_audit WHERE occurred_at < now() - interval '30 days'`,
      );
    } catch {
      this.logger.error('Audio playback retention cleanup failed');
    }
  }
}
