const fs = require('node:fs');
const axios = require('axios');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function addAudioEntries(description, links) {
  const section =
    'Голосовые сообщения (один раз без входа):\n' +
    links.map((link, i) => `${i + 1}. Слушать: ${link.url}`).join('\n');
  const footer = /^(.*)Обращение и вложения:(.*)$/m;
  if (!footer.test(description))
    throw Error('Expected patient footer not found');
  return description.replace(
    footer,
    (_, prefix, suffix) =>
      `${section}\n\n${prefix}Карточка пациента (вход в аккаунт):${suffix}`,
  );
}

async function run({ env, patients, mapping, auditPath }) {
  const frontend = 'https://feedback.orzumedical.uz';
  const api = axios.create({
    baseURL: 'https://feedback-api.orzumedical.uz/api',
    timeout: 60000,
    headers: {
      Authorization: `Bearer ${env.ADMIN_BEARER_TOKEN}`,
      Origin: frontend,
      'X-Audio-Playback': '1',
    },
  });
  const params = { key: env.TRELLO_API_KEY, token: env.TRELLO_API_TOKEN };
  const audit = fs.existsSync(auditPath)
    ? JSON.parse(fs.readFileSync(auditPath))
    : { cards: [] };
  const save = () =>
    fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), {
      mode: 0o600,
    });
  const revoke = async (entry) => {
    for (const link of entry.links)
      await api.post('/audio-playback/shares/revoke', {
        token: new URLSearchParams(new URL(link.url).hash.slice(1)).get('t'),
      });
  };
  for (const patient of patients) {
    const files = mapping.evidence.filter(
      (e) =>
        e.feedbackId === patient.feedbackId &&
        String(e.mimeType || '').startsWith('audio/') &&
        e.bytes > 0,
    );
    if (!files.length) continue;
    if (!patient.valid || !/^[0-9a-f]{24}$/.test(patient.cardId))
      throw Error('Unverified card mapping');
    const endpoint = `https://api.trello.com/1/cards/${patient.cardId}`;
    const read = async () =>
      (
        await axios.get(endpoint, {
          params: { ...params, fields: 'desc,idBoard' },
          timeout: 30000,
        })
      ).data;
    const current = await read();
    let entry = audit.cards.find((c) => c.id === patient.cardId);
    if (entry?.after === current.desc) {
      entry.status = 'updated-and-reread';
      save();
      continue;
    }
    if (entry && current.desc !== entry.before) {
      await revoke(entry);
      entry.status = 'skipped-concurrent-edit';
      save();
      continue;
    }
    const markers = [
      ...current.desc.matchAll(/FeedbackID:\s*([0-9a-f-]{36})/gi),
    ];
    const urls = current.desc.match(/https?:\/\/[^\s<>"\)\]]+/g) || [];
    if (
      current.idBoard !== env.TRELLO_BOARD_ID ||
      markers.length !== 1 ||
      markers[0][1] !== patient.feedbackId ||
      !urls.includes(`${frontend}/patients/${patient.requestId}`)
    )
      throw Error('Card binding mismatch');
    if (!entry) {
      entry = {
        id: patient.cardId,
        boardId: current.idBoard,
        feedbackId: patient.feedbackId,
        requestId: patient.requestId,
        before: current.desc,
        links: [],
        status: 'preparing',
      };
      audit.cards.push(entry);
      save();
    }
    for (const file of files) {
      if (entry.links.some((link) => link.id === file.id)) continue;
      const path = `/archive/v21/feedbacks/${patient.feedbackId}/evidence/${file.id}`;
      const { data: metadata } = await api.get(path);
      if (
        metadata.id !== file.id ||
        metadata.feedbackId !== patient.feedbackId ||
        metadata.source !== 'v21' ||
        metadata.bytes !== file.bytes ||
        !String(metadata.mimeType).startsWith('audio/')
      )
        throw Error('Evidence binding mismatch');
      let share;
      try {
        ({ data: share } = await api.post('/audio-playback/shares', {
          source: 'v21',
          feedbackId: patient.feedbackId,
          id: file.id,
        }));
      } catch (error) {
        if (error.response?.status !== 429) throw error;
        await sleep(61000);
        ({ data: share } = await api.post('/audio-playback/shares', {
          source: 'v21',
          feedbackId: patient.feedbackId,
          id: file.id,
        }));
      }
      const url = new URL(share.url);
      if (
        url.origin !== frontend ||
        url.pathname !== '/listen' ||
        url.search ||
        !/^#t=[A-Za-z0-9_-]{43}$/.test(url.hash)
      )
        throw Error('Unexpected guest link');
      entry.links.push({
        id: file.id,
        feedbackId: patient.feedbackId,
        url: share.url,
        expiresAt: share.expiresAt,
      });
      save();
      const { data: status } = await api.post('/audio-guest/status', {
        token: new URLSearchParams(url.hash.slice(1)).get('t'),
      });
      if (!status.available || status.path !== path) {
        await revoke(entry);
        throw Error('Wrong guest destination');
      }
      await sleep(3100);
    }
    entry.after = addAudioEntries(entry.before, entry.links);
    save();
    const latest = await read();
    if (latest.desc !== entry.before || latest.idBoard !== entry.boardId) {
      await revoke(entry);
      entry.status = 'skipped-concurrent-edit';
      save();
      continue;
    }
    try {
      await axios.put(
        endpoint,
        { desc: entry.after },
        { params, timeout: 30000 },
      );
    } catch {
      if ((await read()).desc !== entry.after)
        throw Error('Card update failed');
    }
    if ((await read()).desc !== entry.after)
      throw Error('Card verification mismatch');
    entry.status = 'updated-and-reread';
    save();
    if (audit.cards.length % 10 === 0)
      console.log(
        JSON.stringify({
          updatedCards: audit.cards.length,
          audioLinks: audit.cards.reduce((n, c) => n + c.links.length, 0),
        }),
      );
  }
  console.log(
    JSON.stringify({
      cards: audit.cards.length,
      updated: audit.cards.filter((c) => c.status === 'updated-and-reread')
        .length,
      audioLinks: audit.cards.reduce((n, c) => n + c.links.length, 0),
    }),
  );
  return audit;
}

module.exports = { run, addAudioEntries };
