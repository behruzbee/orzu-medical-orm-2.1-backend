const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const axios = require('axios');

async function run({ plans, env, auditDirectory, apply = false }) {
  if (!env.ADMIN_BEARER_TOKEN)
    throw Error('Administrator token required for verification');
  const apiOrigin = new URL(env.API_BASE_URL);
  const frontend = new URL(env.FRONTEND_URL);
  if (apiOrigin.protocol !== 'https:' || frontend.protocol !== 'https:')
    throw Error('HTTPS required');
  fs.mkdirSync(auditDirectory, { recursive: true, mode: 0o700 });
  const auditPath = path.join(
    auditDirectory,
    `exact-link-apply-${Date.now()}.json`,
  );
  const audit = { mode: apply ? 'apply' : 'verify', files: [], cards: [] };
  const save = () =>
    fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), {
      mode: 0o600,
    });
  const api = axios.create({
    baseURL: apiOrigin.toString(),
    timeout: 60000,
    headers: { Authorization: `Bearer ${env.ADMIN_BEARER_TOKEN}` },
  });
  const verified = new Set();
  for (const plan of plans.filter((entry) => entry.replacements.length)) {
    if (![plan.cardId, plan.boardId].every((id) => /^[0-9a-f]{24}$/.test(id)))
      throw Error('Invalid card or board identifier');
    const replacements = new Map();
    for (const replacement of plan.replacements) {
      const { source, id, feedbackId, newUrl, bytes, checksum } = replacement;
      if (
        !['v1', 'v2', 'v21'].includes(source) ||
        !/^[0-9a-f]{64}$/.test(checksum)
      )
        throw Error('Unverified plan record');
      const pathname = `/archive/${source}/feedbacks/${feedbackId}/evidence/${id}`;
      if (new URL(pathname, frontend).toString() !== newUrl)
        throw Error('Unexpected destination URL');
      replacements.set(replacement.oldUrl, newUrl);
      if (verified.has(newUrl)) continue;
      const { data: metadata } = await api.get(`/api${pathname}`);
      if (
        metadata.id !== id ||
        metadata.feedbackId !== feedbackId ||
        metadata.source !== source ||
        metadata.bytes !== bytes
      )
        throw Error('Attachment identity mismatch');
      const { data } = await api.get(`/api${pathname}/file`, {
        responseType: 'arraybuffer',
      });
      const downloaded = Buffer.from(data);
      if (
        downloaded.length !== bytes ||
        createHash('sha256').update(downloaded).digest('hex') !== checksum
      )
        throw Error('Attachment content mismatch');
      audit.files.push({
        source,
        id,
        feedbackId,
        bytes,
        checksum,
        verified: true,
      });
      verified.add(newUrl);
      save();
    }
    const expected = plan.before.replace(
      /https?:\/\/[^\s<>"\)\]]+/g,
      (url) => replacements.get(url) || url,
    );
    if (expected !== plan.after)
      throw Error('Plan includes changes beyond exact URLs');
  }
  console.log(
    JSON.stringify({ verifiedFiles: verified.size, mode: audit.mode }),
  );
  if (!apply) return { auditPath, ...audit };

  for (const plan of plans.filter((entry) => entry.replacements.length)) {
    const main = plan.boardId === env.TRELLO_BOARD_ID;
    const params = {
      key: main
        ? env.TRELLO_API_KEY
        : env.TRELLO_TARGET_API_KEY || env.TRELLO_API_KEY,
      token: main
        ? env.TRELLO_API_TOKEN
        : env.TRELLO_TARGET_API_TOKEN || env.TRELLO_API_TOKEN,
    };
    const endpoint = `https://api.trello.com/1/cards/${plan.cardId}`;
    const read = async () =>
      (
        await axios.get(endpoint, {
          params: { ...params, fields: 'desc,idBoard' },
          timeout: 30000,
        })
      ).data;
    const current = await read();
    if (current.idBoard !== plan.boardId)
      throw Error('Card changed board; stopping');
    if (current.desc === plan.after) {
      audit.cards.push({ id: plan.cardId, status: 'already-updated' });
      save();
      continue;
    }
    if (current.desc !== plan.before) {
      audit.cards.push({ id: plan.cardId, status: 'skipped-concurrent-edit' });
      save();
      continue;
    }
    // Persist the exact original before any remote mutation.
    const entry = {
      id: plan.cardId,
      boardId: plan.boardId,
      before: current.desc,
      after: plan.after,
      status: 'pending',
    };
    audit.cards.push(entry);
    save();
    try {
      await axios.put(
        endpoint,
        { desc: plan.after },
        { params, timeout: 30000 },
      );
    } catch {
      if ((await read()).desc !== plan.after)
        throw Error('Card update failed; original retained in audit');
    }
    if ((await read()).desc !== plan.after)
      throw Error('Saved description differs from the verified plan');
    entry.status = 'updated-and-reread';
    save();
    if (audit.cards.length % 10 === 0)
      console.log(`Cards verified: ${audit.cards.length}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.log(
    JSON.stringify({
      cards: audit.cards.length,
      updated: audit.cards.filter(
        (card) => card.status === 'updated-and-reread',
      ).length,
      skipped: audit.cards.filter(
        (card) => card.status === 'skipped-concurrent-edit',
      ).length,
    }),
  );
  return { auditPath, ...audit };
}

module.exports = { run };
