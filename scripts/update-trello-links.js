const axios = require('axios');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const legacyEvidenceUrl =
  /https:\/\/orzu-medical-orm-21-backend-production\.up\.railway\.app\/api\/feedbacks\/evidence\/([0-9a-f-]{36})\/file/gi;
const requestLinkLine = /^🔗 Обращение и вложения: .*$/m;

async function main() {
  const apply = process.argv.includes('--apply');
  const env = process.env;
  for (const key of ['FRONTEND_URL', 'TRELLO_BOARD_ID', 'TRELLO_API_KEY', 'TRELLO_API_TOKEN']) {
    if (!env[key]) throw new Error(`${key} is required`);
  }

  const db = new Client({
    ...(env.DATABASE_URL
      ? { connectionString: env.DATABASE_URL }
      : {
          host: env.DB_HOST,
          port: Number(env.DB_PORT || 5432),
          user: env.DB_USERNAME,
          password: env.DB_PASSWORD,
          database: env.DB_NAME,
        }),
    ssl: env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await db.connect();
  let feedbacks;
  let evidenceById;
  try {
    const result = await db.query(
      'SELECT id, "requestId", "trelloUrl" FROM feedbacks',
    );
    feedbacks = result.rows;
    const evidence = await db.query('SELECT id, "feedbackId" FROM evidence_messages');
    evidenceById = new Map(evidence.rows.map((row) => [row.id, row.feedbackId]));
  } finally {
    await db.end();
  }

  const auth = { key: env.TRELLO_API_KEY, token: env.TRELLO_API_TOKEN };
  const response = await axios.get(
    `https://api.trello.com/1/boards/${env.TRELLO_BOARD_ID}/cards/all`,
    { params: { ...auth, fields: 'id,shortLink,desc' }, timeout: 30000 },
  );
  const cards = new Map(response.data.map((card) => [card.shortLink, card]));
  const changes = [];
  let missingCards = 0;
  let mismatchedCards = 0;
  let replacedEvidenceLinks = 0;
  let unresolvedLegacyCards = 0;

  for (const feedback of feedbacks.filter((item) => item.trelloUrl)) {
    let shortLink;
    try {
      shortLink = new URL(feedback.trelloUrl).pathname.split('/')[2];
    } catch {
      missingCards++;
      continue;
    }
    const card = cards.get(shortLink);
    if (!card) {
      missingCards++;
      continue;
    }
    if (!card.desc?.includes(`FeedbackID: ${feedback.id}`)) {
      mismatchedCards++;
      continue;
    }

    const requestUrl = new URL(
      `/patients/${encodeURIComponent(feedback.requestId)}`,
      env.FRONTEND_URL,
    ).toString();
    const oldLinks = card.desc.match(legacyEvidenceUrl)?.length || 0;
    let desc = card.desc.replace(legacyEvidenceUrl, 'Вложение доступно в обращении');
    const line = `🔗 Обращение и вложения: ${requestUrl}`;
    desc = requestLinkLine.test(desc)
      ? desc.replace(requestLinkLine, line)
      : desc.replace(/^🆔 FeedbackID:/m, `${line}\n🆔 FeedbackID:`);
    if (desc === card.desc) continue;

    replacedEvidenceLinks += oldLinks;
    changes.push({ id: card.id, before: card.desc, after: desc });
  }

  const changedIds = new Set(changes.map((change) => change.id));
  const feedbackById = new Map(feedbacks.map((feedback) => [feedback.id, feedback]));
  for (const card of response.data) {
    if (changedIds.has(card.id) || !card.desc || /FeedbackID:\s*[0-9a-f-]{36}/i.test(card.desc)) continue;
    const matches = [...card.desc.matchAll(legacyEvidenceUrl)];
    if (matches.length === 0) continue;
    const ids = matches.map((match) => evidenceById.get(match[1]));
    const feedbackIds = new Set(ids.filter(Boolean));
    if (ids.some((id) => !id) || feedbackIds.size !== 1) {
      unresolvedLegacyCards++;
      continue;
    }
    const feedback = feedbackById.get([...feedbackIds][0]);
    if (!feedback) {
      unresolvedLegacyCards++;
      continue;
    }
    const requestUrl = new URL(
      `/patients/${encodeURIComponent(feedback.requestId)}`,
      env.FRONTEND_URL,
    ).toString();
    const line = `🔗 Обращение и вложения: ${requestUrl}`;
    let desc = card.desc.replace(legacyEvidenceUrl, 'Вложение доступно в обращении');
    desc = /^🆔 FeedbackID:.*$/m.test(desc)
      ? desc.replace(/^🆔 FeedbackID:.*$/m, `${line}\n🆔 FeedbackID: ${feedback.id}`)
      : `${desc.trimEnd()}\n\n${line}\n🆔 FeedbackID: ${feedback.id}`;
    replacedEvidenceLinks += matches.length;
    changes.push({ id: card.id, before: card.desc, after: desc });
  }

  console.log(
    JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      boardCards: cards.size,
      feedbacks: feedbacks.length,
      cardsToUpdate: changes.length,
      replacedEvidenceLinks,
      missingCards,
      mismatchedCards,
      unresolvedLegacyCards,
    }),
  );
  if (!apply || changes.length === 0) return;

  const backupDir = path.join(process.cwd(), 'uploads', 'trello-link-backups');
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backupPath = path.join(backupDir, `trello-links-${Date.now()}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(changes.map(({ id, before }) => ({ id, before }))),
    { mode: 0o600 },
  );
  console.log(`Original descriptions saved to ${backupPath}`);

  for (const [index, change] of changes.entries()) {
    await axios.put(`https://api.trello.com/1/cards/${change.id}`, { desc: change.after }, {
      params: auth,
      timeout: 30000,
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    if ((index + 1) % 25 === 0 || index + 1 === changes.length) {
      console.log(`Updated ${index + 1}/${changes.length} cards`);
    }
  }
}

main().catch((error) => {
  console.error(error.response?.status || error.message);
  process.exitCode = 1;
});
