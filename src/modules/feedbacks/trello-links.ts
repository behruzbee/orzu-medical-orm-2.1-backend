const evidencePath = /^\/api\/feedbacks\/evidence\/[0-9a-f-]{36}\/file$/i;

export function patientRequestUrl(
  frontendUrl: string,
  requestId: string,
): string {
  return new URL(
    `/patients/${encodeURIComponent(requestId)}`,
    frontendUrl,
  ).toString();
}

export function trelloEvidenceText(evidence: {
  mediaUrl?: string | null;
  text?: string | null;
}): string {
  if (evidence.mediaUrl) {
    try {
      if (
        evidencePath.test(
          new URL(evidence.mediaUrl, 'https://localhost').pathname,
        )
      ) {
        return 'Вложение доступно в обращении';
      }
    } catch {
      // Preserve a non-URL value in historical evidence.
    }
  }

  return evidence.mediaUrl || evidence.text || '';
}

export async function trelloEvidenceLines(
  evidence: Array<{
    id: string;
    type: string;
    mediaData?: Buffer | null;
    mediaUrl?: string | null;
    text?: string | null;
  }>,
  issueAudioLink: (id: string) => Promise<string>,
): Promise<string> {
  const lines: string[] = [];
  for (const [index, item] of evidence.entries()) {
    if (item.type === 'audio' && item.mediaData?.length) {
      const url = await issueAudioLink(item.id);
      lines.push(
        `${index + 1}. Слушать голосовое сообщение (один раз без входа): ${url}`,
      );
    } else {
      lines.push(
        `${index + 1}. Файл или сообщения: ${trelloEvidenceText(item)}`,
      );
    }
  }
  return lines.join('\n');
}
