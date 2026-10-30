const fs = require('node:fs');
const axios = require('axios');

function replaceExact(description, replacements) {
  return description.replace(
    /https?:\/\/[^\s<>"\)\]]+/g,
    (url) => replacements.get(url) || url,
  );
}

async function run({ plans, env, auditPath }) {
  const frontend = new URL(env.FRONTEND_URL).origin;
  const api = axios.create({
    baseURL: env.API_BASE_URL,
    timeout: 60000,
    headers: {
      Authorization: `Bearer ${env.ADMIN_BEARER_TOKEN}`,
      Origin: frontend,
      'X-Audio-Playback': '1',
    },
  });
  const audit = fs.existsSync(auditPath)
    ? JSON.parse(fs.readFileSync(auditPath))
    : { cards: [] };
  const save = () =>
    fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), {
      mode: 0o600,
    });
  const tokenOf = (url) =>
    new URLSearchParams(new URL(url).hash.slice(1)).get('t');
  const revoke = async (entry) => {
    for (const replacement of entry.replacements)
      await api.post('/api/audio-playback/shares/revoke', {
        token: tokenOf(replacement.newUrl),
      });
  };
  for (const plan of plans.filter((p) => p.replacements.length)) {
    if (![plan.cardId, plan.boardId].every((id) => /^[0-9a-f]{24}$/.test(id)))
      throw Error('Invalid Trello identifiers');
    const params =
      plan.boardId === env.TRELLO_BOARD_ID
        ? { key: env.TRELLO_API_KEY, token: env.TRELLO_API_TOKEN }
        : {
            key: env.TRELLO_TARGET_API_KEY || env.TRELLO_API_KEY,
            token: env.TRELLO_TARGET_API_TOKEN || env.TRELLO_API_TOKEN,
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
    if (current.idBoard !== plan.boardId) throw Error('Board changed');
    let entry = audit.cards.find((c) => c.id === plan.cardId);
    if (entry?.after === current.desc) {
      entry.status = 'updated-and-reread';
      save();
      continue;
    }
    if (current.desc !== plan.after) {
      if (entry) {
        await revoke(entry);
        entry.status = 'skipped-concurrent-edit';
      } else
        audit.cards.push({
          id: plan.cardId,
          status: 'skipped-concurrent-edit',
          replacements: [],
        });
      save();
      continue;
    }
    if (!entry) {
      entry = {
        id: plan.cardId,
        boardId: plan.boardId,
        before: current.desc,
        replacements: [],
        status: 'preparing',
      };
      audit.cards.push(entry);
      save();
    }
    for (const target of plan.replacements) {
      const expectedPath = `/archive/${target.source}/feedbacks/${target.feedbackId}/evidence/${target.id}`;
      if (target.newUrl !== frontend + expectedPath)
        throw Error('Unexpected original target');
      if (entry.replacements.some((r) => r.oldUrl === target.newUrl)) continue;
      const { data: metadata } = await api.get(`/api${expectedPath}`);
      if (
        metadata.id !== target.id ||
        metadata.feedbackId !== target.feedbackId ||
        metadata.source !== target.source ||
        metadata.bytes !== target.bytes
      )
        throw Error('Evidence identity changed');
      if (!String(metadata.mimeType || '').startsWith('audio/')) continue;
      let share;
      try {
        ({ data: share } = await api.post('/api/audio-playback/shares', {
          source: target.source,
          feedbackId: target.feedbackId,
          id: target.id,
        }));
      } catch (error) {
        if (error.response?.status !== 429) throw error;
        await new Promise((resolve) => setTimeout(resolve, 61000));
        ({ data: share } = await api.post('/api/audio-playback/shares', {
          source: target.source,
          feedbackId: target.feedbackId,
          id: target.id,
        }));
      }
      const url = new URL(share.url);
      if (
        url.origin !== frontend ||
        url.pathname !== '/listen' ||
        url.search ||
        !/^#t=[A-Za-z0-9_-]{43}$/.test(url.hash)
      )
        throw Error('Invalid share URL');
      entry.replacements.push({
        oldUrl: target.newUrl,
        newUrl: share.url,
        source: target.source,
        feedbackId: target.feedbackId,
        id: target.id,
        expiresAt: share.expiresAt,
      });
      save();
      const { data: status } = await api.post('/api/audio-guest/status', {
        token: tokenOf(share.url),
      });
      if (!status.available || status.path !== expectedPath) {
        await revoke(entry);
        throw Error('Guest target mismatch');
      }
      // Stay below the same issuance limit as interactive administrators.
      await new Promise((resolve) => setTimeout(resolve, 3100));
    }
    const replacements = new Map(
      entry.replacements.map((r) => [r.oldUrl, r.newUrl]),
    );
    entry.after = replaceExact(entry.before, replacements);
    save();
    const latest = await read();
    if (latest.desc !== entry.before || latest.idBoard !== plan.boardId) {
      await revoke(entry);
      entry.status = 'skipped-concurrent-edit';
      save();
      continue;
    }
    entry.status = 'pending';
    save();
    try {
      await axios.put(
        endpoint,
        { desc: entry.after },
        { params, timeout: 30000 },
      );
    } catch {
      if ((await read()).desc !== entry.after)
        throw Error('Card update failed; private audit retained');
    }
    if ((await read()).desc !== entry.after)
      throw Error('Card differs from exact replacement plan');
    entry.status = 'updated-and-reread';
    save();
    if (audit.cards.length % 10 === 0)
      console.log(JSON.stringify({ cardsVerified: audit.cards.length }));
  }
  console.log(
    JSON.stringify({
      cards: audit.cards.length,
      updated: audit.cards.filter((c) => c.status === 'updated-and-reread')
        .length,
      links: audit.cards.reduce((n, c) => n + c.replacements.length, 0),
    }),
  );
  return audit;
}

module.exports = { run, replaceExact };
