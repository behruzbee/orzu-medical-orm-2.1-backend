const evidencePath = /^\/api\/feedbacks\/evidence\/[0-9a-f-]{36}\/file$/i;

export function patientRequestUrl(frontendUrl: string, requestId: string): string {
  return new URL(`/patients/${encodeURIComponent(requestId)}`, frontendUrl).toString();
}

export function trelloEvidenceText(evidence: {
  mediaUrl?: string | null;
  text?: string | null;
}): string {
  if (evidence.mediaUrl) {
    try {
      if (evidencePath.test(new URL(evidence.mediaUrl, 'https://localhost').pathname)) {
        return 'Вложение доступно в обращении';
      }
    } catch {
      // Preserve a non-URL value in historical evidence.
    }
  }

  return evidence.mediaUrl || evidence.text || '';
}
