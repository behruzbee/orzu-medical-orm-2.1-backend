const axios = require('axios');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const feedbackIdPattern = /FeedbackID:\s*([0-9a-f-]{36})/i;
const oldAudioPattern = /https?:\/\/[^\s)\]]+\/listen#t=([A-Za-z0-9_-]{43})/g;
const publicAudioPattern = /https?:\/\/[^\s)\]]+\/api\/public\/audio\/([A-Za-z0-9_-]{43})/g;
const legacyEvidencePattern = /https?:\/\/[^\s)\]]+\/api\/feedbacks\/evidence\/([0-9a-f-]{36})\/file/gi;
const cardLinkPattern = /^\ud83d\udd17 (?:Карточка пациента[^:]*|Карточка обращения[^:]*|Обращение и вложения): .*$/m;

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function publicFeedbackUrl(origin, secret, id, ttlDays) {
  const payload = Buffer.from(JSON.stringify({
    id,
    exp: Math.floor(Date.now() / 1000) + ttlDays * 86400,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${origin}/api/public/feedback/${payload}.${signature}`;
}

async function updateCard(id, desc, auth) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await axios.put(`https://api.trello.com/1/cards/${id}`, { desc }, { params: auth, timeout: 30000 });
      return true;
    } catch (error) {
      const status = error.response?.status;
      if ([404, 409].includes(status)) return false;
      const transient = !status || status === 429 || status >= 500;
      if (!transient || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = process.env;
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME',
    'TRELLO_API_KEY', 'TRELLO_API_TOKEN', 'UPLOAD_URL', 'JWT_SECRET']) {
    if (!env[key]) throw new Error(`${key} is required`);
  }
  const ttlDays = Math.min(365, Math.max(1, Number(env.PUBLIC_FEEDBACK_LINK_TTL_DAYS || 30)));
  const origin = new URL(env.UPLOAD_URL).origin;
  const auth = { key: env.TRELLO_API_KEY, token: env.TRELLO_API_TOKEN };
  const search = await axios.get('https://api.trello.com/1/search', {
    params: {
      ...auth,
      query: 'FeedbackID:',
      modelTypes: 'cards',
      card_fields: 'id,idBoard,shortLink,desc,closed',
      cards_limit: 1000,
      partial: true,
    },
    timeout: 30000,
  });
  const cards = (search.data.cards || []).filter((card) => feedbackIdPattern.test(card.desc || ''));
  const feedbackIds = [...new Set(cards.map((card) => card.desc.match(feedbackIdPattern)[1]))];

  const db = new Client({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await db.connect();
  try {
    const feedbackResult = await db.query(
      `SELECT f.id, f."operatorId", em.id AS "evidenceId", em.type,
              (em."mediaData" IS NOT NULL) AS "hasData"
       FROM feedbacks f
       LEFT JOIN evidence_messages em ON em."feedbackId" = f.id
       WHERE f.id = ANY($1::uuid[])`,
      [feedbackIds],
    );
    const feedbacks = new Map();
    const evidenceById = new Map();
    for (const row of feedbackResult.rows) {
      if (!feedbacks.has(row.id)) feedbacks.set(row.id, { operatorId: row.operatorId, audio: [] });
      if (row.evidenceId) {
        evidenceById.set(row.evidenceId, { feedbackId: row.id, type: row.type, hasData: row.hasData });
        if (row.type === 'audio' && row.hasData) feedbacks.get(row.id).audio.push(row.evidenceId);
      }
    }

    const oldTokens = new Set();
    for (const card of cards) {
      for (const pattern of [oldAudioPattern, publicAudioPattern]) {
        pattern.lastIndex = 0;
        for (const match of card.desc.matchAll(pattern)) oldTokens.add(hash(match[1]));
      }
    }
    const oldLinkResult = oldTokens.size
      ? await db.query(
        `SELECT token_hash, evidence_id FROM audio_guest_links WHERE token_hash = ANY($1::char(64)[])`,
        [[...oldTokens]],
      )
      : { rows: [] };
    const evidenceByTokenHash = new Map(oldLinkResult.rows.map((row) => [row.token_hash.trim(), row.evidence_id]));
    const plainTokenByHash = new Map();
    for (const card of cards) {
      publicAudioPattern.lastIndex = 0;
      for (const match of card.desc.matchAll(publicAudioPattern)) {
        plainTokenByHash.set(hash(match[1]), match[1]);
      }
    }

    const tokenByEvidence = new Map();
    for (const [tokenHash, evidenceId] of evidenceByTokenHash) {
      const token = plainTokenByHash.get(tokenHash);
      if (token) tokenByEvidence.set(evidenceId, token);
    }
    const pendingTokens = [];
    for (const [feedbackId, feedback] of feedbacks) {
      for (const evidenceId of feedback.audio) {
        if (tokenByEvidence.has(evidenceId)) continue;
        const token = crypto.randomBytes(32).toString('base64url');
        tokenByEvidence.set(evidenceId, token);
        pendingTokens.push({ token, feedbackId, evidenceId, operatorId: feedback.operatorId });
      }
    }

    const changes = [];
    let audioLinks = 0;
    for (const card of cards) {
      const feedbackId = card.desc.match(feedbackIdPattern)[1];
      const feedback = feedbacks.get(feedbackId);
      if (!feedback) continue;
      let desc = card.desc;
      const usedEvidence = new Set();
      let fallbackIndex = 0;
      oldAudioPattern.lastIndex = 0;
      desc = desc.replace(oldAudioPattern, (url, token) => {
        let evidenceId = evidenceByTokenHash.get(hash(token));
        if (!evidenceId || !tokenByEvidence.has(evidenceId)) {
          evidenceId = feedback.audio[fallbackIndex++];
        }
        if (!evidenceId || !tokenByEvidence.has(evidenceId)) return url;
        usedEvidence.add(evidenceId);
        audioLinks++;
        return `${origin}/api/public/audio/${tokenByEvidence.get(evidenceId)}`;
      });
      publicAudioPattern.lastIndex = 0;
      for (const match of desc.matchAll(publicAudioPattern)) {
        const evidenceId = evidenceByTokenHash.get(hash(match[1]));
        if (evidenceId) usedEvidence.add(evidenceId);
      }
      legacyEvidencePattern.lastIndex = 0;
      desc = desc.replace(legacyEvidencePattern, (url, evidenceId) => {
        const evidence = evidenceById.get(evidenceId);
        if (!evidence || evidence.feedbackId !== feedbackId || evidence.type !== 'audio' || !tokenByEvidence.has(evidenceId)) {
          return url;
        }
        usedEvidence.add(evidenceId);
        audioLinks++;
        return `${origin}/api/public/audio/${tokenByEvidence.get(evidenceId)}`;
      });

      const missingAudio = feedback.audio.filter((id) => !usedEvidence.has(id));
      if (missingAudio.length) {
        const lines = missingAudio.map((id, index) =>
          `\ud83c\udfa7 Голосовое сообщение ${index + 1} (без входа): ${origin}/api/public/audio/${tokenByEvidence.get(id)}`,
        );
        audioLinks += missingAudio.length;
        desc = desc.replace(/^\ud83c\udd94 FeedbackID:/m, `${lines.join('\n')}\n\n\ud83c\udd94 FeedbackID:`);
      }
      const cardLine = `\ud83d\udd17 Карточка обращения (без входа): ${publicFeedbackUrl(origin, env.JWT_SECRET, feedbackId, ttlDays)}`;
      if (!/\/api\/public\/feedback\//.test(desc)) {
        desc = cardLinkPattern.test(desc)
          ? desc.replace(cardLinkPattern, cardLine)
          : desc.replace(/^\ud83c\udd94 FeedbackID:/m, `${cardLine}\n\ud83c\udd94 FeedbackID:`);
      }
      if (desc !== card.desc) changes.push({ id: card.id, before: card.desc, after: desc });
    }

    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      cardsFound: cards.length,
      feedbacksFound: feedbacks.size,
      cardsToUpdate: changes.length,
      audioEvidenceLinks: audioLinks,
      audioTokensToCreate: pendingTokens.length,
    }));
    if (!apply) return;

    const backupDir = path.join(process.cwd(), 'uploads', 'trello-link-backups');
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const backupPath = path.join(backupDir, `public-access-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(changes.map(({ id, before }) => ({ id, before }))), { mode: 0o600 });

    await db.query('BEGIN');
    try {
      for (const item of pendingTokens) {
        await db.query(
          `INSERT INTO audio_guest_links (token_hash, created_by, source, feedback_id, evidence_id, expires_at)
           VALUES ($1, $2, 'v21', $3, $4, now() + make_interval(days => $5::int))`,
          [hash(item.token), item.operatorId, item.feedbackId, item.evidenceId, ttlDays],
        );
      }
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }

    let failed = 0;
    for (const [index, change] of changes.entries()) {
      try {
        const updated = await updateCard(change.id, change.after, auth);
        if (!updated) failed++;
      } catch (error) {
        throw error;
      }
      if ((index + 1) % 50 === 0 || index + 1 === changes.length) {
        console.log(`Updated ${index + 1}/${changes.length}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    console.log(`Failed/skipped: ${failed}`);
    console.log(`Backup: ${backupPath}`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.response?.data?.message || error.response?.status || error.message);
  process.exitCode = 1;
});
