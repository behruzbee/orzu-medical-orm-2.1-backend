// Run inside the current production API container, with its environment.
// Dry-run by default. --apply saves a resumable plan and verifies each write.
const fs = require('node:fs');
const crypto = require('node:crypto');
const axios = require('axios');
const { Client } = require('pg');
const { createPublicFeedbackToken } = require('../dist/modules/feedbacks/public-feedback-link');
const origin = 'https://feedback-api.orzumedical.uz';
const marker = /FeedbackID:\s*([0-9a-f-]{36})/ig;
const urls = /https?:\/\/[^\s<>"\)\]]+/g;
const delay = ms => new Promise(r => setTimeout(r, ms));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const planPath = process.env.PUBLIC_LINK_REPAIR_PLAN || '/app/uploads/public-link-repair-20261103.json';
let nextTrelloRequest = 0;
async function request(config) {
  for (let attempt = 0; ; attempt++) {
    if (config.url.startsWith('https://api.trello.com/')) {
      const start = Math.max(Date.now(), nextTrelloRequest);
      nextTrelloRequest = start + 150;
      await delay(Math.max(0, start - Date.now()));
    }
    try { return await axios({ timeout: 30000, ...config }); }
    catch (e) {
      if (attempt >= 3 || (e.response && e.response.status !== 429 && e.response.status < 500)) throw e;
      await delay((attempt + 1) * 1500);
    }
  }
}
async function connect(database) {
  const url = new URL(process.env.DATABASE_URL);
  if (database) url.pathname = '/' + database;
  const db = new Client({ connectionString: url.toString(), ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false } });
  await db.connect(); return db;
}
function rewrite(desc, cardUrl, audioLinks, evidenceIds, originalUrls = []) {
  const lines = desc.split('\n').filter(line => {
    if (/^\s*(?:Голосовые сообщения|🎧 Голосовое сообщение)/.test(line)) return false;
    const links = line.match(urls) || [];
    return !links.some(value => {
      const url = new URL(value);
      if (originalUrls.includes(value)) return true;
      if (!/orzumedical\.uz$|railway\.app$|vercel\.app$/.test(url.hostname)) return false;
      return /\/listen$|\/public\/audio\/|\/public\/feedback\/|\/patients\//.test(url.pathname)
        || /\/archive\/.*\/evidence\//.test(url.pathname)
        || evidenceIds.some(id => url.pathname.includes('/evidence/' + id + '/file'));
    });
  });
  const section = [
    `🔗 Карточка обращения (без входа): ${cardUrl}`,
    ...audioLinks.map((link, i) => `🎧 Голосовое сообщение ${i + 1} (без входа): ${link.url}`),
  ].join('\n');
  const clean = lines.join('\n');
  return /^.*FeedbackID:/m.test(clean)
    ? clean.replace(/^.*FeedbackID:/m, match => `${section}\n\n${match}`)
    : `${clean}\n\n${section}`;
}
async function main() {
  if (new URL(process.env.UPLOAD_URL).origin !== origin || !process.env.DATABASE_URL) throw Error('Run on the new production server');
  const apply = process.argv.includes('--apply');
  const auths = [{ key: process.env.TRELLO_API_KEY, token: process.env.TRELLO_API_TOKEN }];
  if (process.env.TRELLO_TARGET_API_KEY && process.env.TRELLO_TARGET_API_TOKEN) auths.push({ key: process.env.TRELLO_TARGET_API_KEY, token: process.env.TRELLO_TARGET_API_TOKEN });
  const db = await connect();
  try {
    let plan;
    if (fs.existsSync(planPath)) plan = JSON.parse(fs.readFileSync(planPath));
    else {
      const byId = new Map();
      for (const [authIndex, auth] of auths.entries()) {
        const { data } = await request({ url: 'https://api.trello.com/1/search', params: { ...auth, query: 'FeedbackID:', modelTypes: 'cards', card_fields: 'id,idBoard,desc', cards_limit: 1000, partial: true } });
        for (const card of data.cards || []) byId.set(card.id, { ...card, authIndex });
      }
      const { data: mainCards } = await request({ url: `https://api.trello.com/1/boards/${process.env.TRELLO_BOARD_ID}/cards/all`, params: { ...auths[0], fields: 'id,idBoard,desc' } });
      for (const card of mainCards) byId.set(card.id, { ...card, authIndex: 0 });
      const records = new Map();
      for (const [source, database] of [['v21', null], ['v2', 'orzu_legacy_feedback_v2'], ['v1', 'orzu_legacy_mysql']]) {
        const sourceDb = database ? await connect(database) : db;
        try {
          const sql = source === 'v21'
            ? `SELECT f.id, f."operatorId" FROM feedbacks f JOIN patient_requests r ON r.id=f."requestId" JOIN patients p ON p.id=r."patientId" WHERE r."deletedAt" IS NULL AND p."deletedAt" IS NULL`
            : 'SELECT id FROM feedbacks';
          const { rows: feedbacks } = await sourceDb.query(sql);
          const { rows: evidence } = await sourceDb.query(source === 'v1'
            ? `SELECT id, "feedbackId", "mimeType", "voiceUrl" AS "originalUrl", octet_length("fileData") AS bytes FROM voice_messages WHERE "fileData" IS NOT NULL`
            : `SELECT id, "feedbackId", "mimeType", "mediaUrl" AS "originalUrl", octet_length("mediaData") AS bytes FROM evidence_messages WHERE (type='audio' OR "mimeType" LIKE 'audio/%') AND "mediaData" IS NOT NULL`);
          for (const f of feedbacks) {
            if (records.has(f.id)) throw Error('Ambiguous feedback source');
            records.set(f.id, { ...f, source, audio: evidence.filter(e => e.feedbackId === f.id && e.bytes > 0).sort((a,b)=>a.id.localeCompare(b.id)) });
          }
        } finally { if (database) await sourceDb.end(); }
      }
      const { rows: actors } = await db.query('SELECT created_by FROM audio_guest_links LIMIT 1');
      const actor = actors[0]?.created_by;
      if (!actor) throw Error('No share issuer available');
      const evidenceFeedback = new Map();
      const originalFeedback = new Map();
      for (const f of records.values()) for (const audio of f.audio) {
        evidenceFeedback.set(audio.id, f.id);
        if (audio.originalUrl) {
          if (!originalFeedback.has(audio.originalUrl)) originalFeedback.set(audio.originalUrl, new Set());
          originalFeedback.get(audio.originalUrl).add(f.id);
        }
      }
      const { rows: guestLinks } = await db.query('SELECT token_hash, feedback_id FROM audio_guest_links');
      const guestFeedback = new Map(guestLinks.map(row => [row.token_hash.trim(), row.feedback_id]));
      const cards = [], skipped = [], targets = {};
      for (const card of byId.values()) {
        if (process.argv.includes('--legacy-only') && card.desc.includes(origin + '/api/public/feedback/')) continue;
        const references = [...card.desc.matchAll(marker)].map(m=>m[1]);
        if (!references.length) {
          for (const value of card.desc.match(urls) || []) {
            if (originalFeedback.has(value)) references.push(...originalFeedback.get(value));
            const url = new URL(value);
            const evidenceId = url.pathname.match(/\/evidence\/([0-9a-f-]{36})/)?.[1];
            if (evidenceFeedback.has(evidenceId)) references.push(evidenceFeedback.get(evidenceId));
            const guestToken = new URLSearchParams(url.hash.slice(1)).get('t');
            if (guestToken && guestFeedback.has(hash(guestToken))) references.push(guestFeedback.get(hash(guestToken)));
          }
        }
        const ids = [...new Set(references)];
        if (ids.length !== 1) continue;
        const f = records.get(ids[0]);
        if (!f) { skipped.push({ id: card.id, feedbackId: ids[0], reason: 'No active or archived feedback' }); continue; }
        if (!targets[f.id]) {
          const token = createPublicFeedbackToken(process.env.JWT_SECRET, f.id, 30, f.source);
          targets[f.id] = { source: f.source, cardUrl: `${origin}/api/public/feedback/${token}`, audio: f.audio.map(e => {
            const token = crypto.randomBytes(32).toString('base64url');
            return { id: e.id, bytes: e.bytes, token, url: `${origin}/api/public/audio/${token}`, actor: f.operatorId || actor };
          }) };
        }
        const target = targets[f.id];
        cards.push({ id: card.id, boardId: card.idBoard, authIndex: card.authIndex, feedbackId: f.id, before: card.desc, after: rewrite(card.desc, target.cardUrl, target.audio, f.audio.map(e=>e.id), f.audio.map(e=>e.originalUrl).filter(Boolean)), status: 'pending' });
      }
      plan = { targets, cards, skipped };
      console.log(JSON.stringify({ cards: cards.length, skipped: skipped.length, feedbacks: Object.keys(targets).length, audio: Object.values(targets).reduce((n,t)=>n+t.audio.length,0), sources: [...new Set(Object.values(targets).map(t=>t.source))] }));
      if (!apply) return;
      fs.writeFileSync(planPath, JSON.stringify(plan), { mode: 0o600 });
    }
    if (!apply) return console.log(JSON.stringify({ resume: true, pending: plan.cards.filter(c=>c.status==='pending').length }));
    const save = () => fs.writeFileSync(planPath, JSON.stringify(plan), { mode: 0o600 });
    for (const [feedbackId, target] of Object.entries(plan.targets)) {
      for (const audio of target.audio) {
        await db.query(`INSERT INTO audio_guest_links (token_hash,created_by,source,feedback_id,evidence_id,expires_at) VALUES ($1,$2,$3,$4,$5,now()+interval '30 days') ON CONFLICT (token_hash) DO NOTHING`, [hash(audio.token),audio.actor,target.source,feedbackId,audio.id]);
      }
      if (target.verified) continue;
      const card = await request({ url: target.cardUrl });
      if (card.status !== 200 || !card.data.includes('Карточка обращения')) throw Error('Public card check failed');
      // Check the exact signed-card audio route, including bytes and seek support.
      for (const audio of target.audio) {
        const res = await request({ url: `${target.cardUrl}/audio/${audio.id}`, headers: { Range: 'bytes=0-31' }, responseType: 'arraybuffer' });
        if (res.status !== 206 || !res.headers['content-type'].startsWith('audio/') || !res.headers['content-range'].endsWith('/'+audio.bytes)) throw Error('Audio identity/range check failed');
      }
      target.verified = true; save();
      const count = Object.values(plan.targets).filter(t=>t.verified).length;
      if (count % 30 === 0) console.log(`Verified ${count}/${Object.keys(plan.targets).length} feedbacks`);
    }
    const pending = plan.cards.filter(c => c.status === 'pending');
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
      const card = pending[cursor++];
      const auth = auths[card.authIndex];
      const url = `https://api.trello.com/1/cards/${card.id}`;
      const read = () => request({ url, params: { ...auth, fields: 'desc,idBoard' } }).then(r=>r.data);
      const current = await read();
      if (current.desc === card.after) card.status = 'verified';
      else if (current.desc !== card.before || current.idBoard !== card.boardId) card.status = 'concurrent-edit';
      else {
        try { await request({ url, method: 'PUT', params: auth, data: { desc: card.after } }); }
        catch (e) {
          if (e.response?.status !== 409) throw e;
          card.status = 'conflict'; card.reason = String(e.response.data).slice(0,200); save(); continue;
        }
        if ((await read()).desc !== card.after) throw Error('Trello reread mismatch');
        card.status = 'verified';
      }
      save();
      const completed = plan.cards.filter(c => c.status !== 'pending').length;
      if (completed % 30 === 0) console.log(`Trello ${completed}/${plan.cards.length}`);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    console.log(JSON.stringify({ results: plan.cards.reduce((m,c)=>(m[c.status]=(m[c.status]||0)+1,m),{}), missingFeedbacks: plan.skipped.length, conflicts: [...new Set(plan.cards.filter(c=>c.reason).map(c=>c.reason))] }));
  } finally { await db.end(); }
}
main().catch(e => { console.error(e.response?.status || e.message); process.exitCode = 1; });
