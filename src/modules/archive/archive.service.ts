import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { Pool } from 'pg';

const databases = {
  v1: 'orzu_legacy_mysql',
  v2: 'orzu_legacy_feedback_v2',
  v21: null,
} as const;

@Injectable()
export class ArchiveService implements OnModuleDestroy {
  private readonly pools = new Map<string, Pool>();

  constructor(private readonly config: ConfigService) {}

  private pool(source: keyof typeof databases): Pool {
    const existing = this.pools.get(source);
    if (existing) return existing;
    const url = this.config.get<string>('DATABASE_URL');
    let connection: Record<string, unknown>;
    if (url) {
      const target = new URL(url);
      if (databases[source]) target.pathname = `/${databases[source]}`;
      connection = { connectionString: target.toString() };
    } else {
      connection = {
        host: this.config.get<string>('DB_HOST'),
        port: Number(this.config.get<string>('DB_PORT') || 5432),
        user: this.config.get<string>('DB_USERNAME'),
        password: this.config.get<string>('DB_PASSWORD'),
        database: databases[source] || this.config.get<string>('DB_NAME'),
      };
    }
    const pool = new Pool({
      ...connection,
      ssl:
        this.config.get<string>('DB_SSL') === 'false'
          ? false
          : { rejectUnauthorized: false },
      max: 2,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 15000,
      options: '-c default_transaction_read_only=on',
    });
    // Idle socket failures must not terminate the API process.
    pool.on('error', () => {});
    this.pools.set(source, pool);
    return pool;
  }

  async evidence(source: string, feedbackId: string, id: string, file = false) {
    if (
      !Object.prototype.hasOwnProperty.call(databases, source) ||
      !isUUID(feedbackId) ||
      !isUUID(id)
    ) {
      throw new NotFoundException('Archive attachment not found');
    }
    const sql =
      source === 'v21'
        ? `SELECT e.id, e."feedbackId", r."patientId", p.name AS "patientName",
                  r.branch, e.type AS "evidenceType", e."mimeType", octet_length(e."mediaData") AS bytes
                  ${file ? ', e."mediaData" AS data' : ''}
           FROM evidence_messages e
           JOIN feedbacks f ON f.id = e."feedbackId"
           JOIN patient_requests r ON r.id = f."requestId"
           JOIN patients p ON p.id = r."patientId"
           WHERE e.id = $1 AND f.id = $2 AND e."mediaData" IS NOT NULL
             AND r."deletedAt" IS NULL AND p."deletedAt" IS NULL`
        : source === 'v2'
          ? `SELECT e.id, e."feedbackId", f."patientId", p.name AS "patientName",
                  p.branch, e.type AS "evidenceType", e."mimeType", octet_length(e."mediaData") AS bytes
                  ${file ? ', e."mediaData" AS data' : ''}
           FROM evidence_messages e
           JOIN feedbacks f ON f.id = e."feedbackId"
           LEFT JOIN patients p ON p.id = f."patientId"
           WHERE e.id = $1 AND f.id = $2 AND e."mediaData" IS NOT NULL`
          : `SELECT e.id, e."feedbackId", f."patientId",
                  concat_ws(' ', p."firstName", p."lastName") AS "patientName",
                  p.branch, 'audio' AS "evidenceType", e."mimeType", octet_length(e."fileData") AS bytes
                  ${file ? ', e."fileData" AS data' : ''}
           FROM voice_messages e
           JOIN feedbacks f ON f.id = e."feedbackId"
           LEFT JOIN patients p ON p.id = f."patientId"
           WHERE e.id = $1 AND f.id = $2 AND e."fileData" IS NOT NULL`;
    let rows;
    try {
      ({ rows } = await this.pool(source as keyof typeof databases).query(sql, [
        id,
        feedbackId,
      ]));
    } catch {
      throw new ServiceUnavailableException('Archive temporarily unavailable');
    }
    if (rows.length !== 1) {
      throw new NotFoundException('Archive attachment not found');
    }
    return { ...rows[0], source };
  }

  async onModuleDestroy() {
    for (const pool of this.pools.values()) await pool.end();
  }
}
