const legacyHosts = new Map([
  ['orzu-medical-orm-21-backend-production.up.railway.app', 'v21'],
  ['orzu-medical-feedbacks-20-backend-production.up.railway.app', 'v2'],
  ['orzu-med-complaints-server-production.up.railway.app', 'v1'],
]);
const urls = /https?:\/\/[^\s<>"\)\]]+/g;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const evidencePath = new RegExp(
  `^/api/feedbacks/evidence/(${uuid})/file$`,
  'i',
);
const feedbackMarker = new RegExp(`FeedbackID:\\s*(${uuid})`, 'gi');

function planCard(card, records, frontendOrigin) {
  const origin = new URL(frontendOrigin);
  if (origin.protocol !== 'https:') throw Error('HTTPS frontend required');
  const feedbackIds = [
    ...new Set(
      [...card.desc.matchAll(feedbackMarker)].map((match) =>
        match[1].toLowerCase(),
      ),
    ),
  ];
  const replacements = [];
  const unresolved = [];
  for (const oldUrl of new Set(card.desc.match(urls) || [])) {
    let url;
    try {
      url = new URL(oldUrl);
    } catch {
      continue;
    }
    const source = legacyHosts.get(url.hostname);
    if (!source) continue;
    if (url.username || url.password || url.search || url.hash || url.port) {
      unresolved.push({ oldUrl, reason: 'noncanonical-url' });
      continue;
    }
    const evidenceId = url.pathname.match(evidencePath)?.[1]?.toLowerCase();
    const candidates = (records[source] || []).filter((record) =>
      evidenceId
        ? record.id.toLowerCase() === evidenceId
        : record.originalUrl === oldUrl,
    );
    if (
      candidates.length !== 1 ||
      !candidates[0].bytes ||
      !candidates[0].checksum
    ) {
      unresolved.push({ oldUrl, reason: 'file-not-uniquely-available' });
      continue;
    }
    const record = candidates[0];
    if (
      feedbackIds.length !== 1 ||
      feedbackIds[0] !== record.feedbackId?.toLowerCase()
    ) {
      unresolved.push({ oldUrl, reason: 'feedback-id-not-confirmed' });
      continue;
    }
    const newUrl = new URL(
      `/archive/${source}/feedbacks/${record.feedbackId}/evidence/${record.id}`,
      origin,
    ).toString();
    replacements.push({
      oldUrl,
      newUrl,
      source,
      id: record.id,
      feedbackId: record.feedbackId,
      bytes: record.bytes,
      checksum: record.checksum,
    });
  }
  const byUrl = new Map(
    replacements.map((replacement) => [replacement.oldUrl, replacement.newUrl]),
  );
  const after = card.desc.replace(urls, (url) => byUrl.get(url) || url);
  return {
    cardId: card.id,
    boardId: card.idBoard,
    before: card.desc,
    after,
    replacements,
    unresolved,
  };
}

module.exports = { planCard };
