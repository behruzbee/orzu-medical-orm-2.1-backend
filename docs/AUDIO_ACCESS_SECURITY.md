# Audio Access

Guest access is explicitly permitted once per issued link, globally, for 24 hours.
Opening the page or a Trello preview does not consume access. The first successful
claim on POST /api/audio-guest/play consumes it before bytes are returned. A network
failure, closed tab, or decoder failure can therefore consume the attempt too.
After consumption/expiry, the same link opens the exact protected archive route.
Only an active administrator can use that archive route. Public registration is
not enabled. Current patient-page audio retains its existing employee access.

## Ten Controls

1. Random 256-bit capability, scoped to database version, feedback, and evidence.
2. Only SHA-256 token hashes in PostgreSQL; secret is in a URL fragment, not an
   HTTP path/query. The frontend removes the fragment from the active history.
3. Atomic PostgreSQL claim prevents replay across tabs, devices, or API replicas.
4. Guest expiry of 24 hours; authenticated playback permission expires in 60 seconds.
5. Repeated access checks active-account JWT, token version, role, and ticket owner.
6. Administrator-only manual guest issuance and revocation; exact record binding and
   soft-delete checks are repeated before delivering bytes.
7. Shared database rate limits, 2 KB request bodies, POST-only claims, strict
   Origin/custom-header checks, and rejection of Range requests.
8. HTTPS deployment, no-store/private responses, nosniff, no-referrer, frame denial,
   and restrictive object/base policies. Preview/status responses contain no names.
9. No audio download control, blob URL, native media menu, or public GET file route.
   Playback uses Web Audio, releases its buffer at completion/unmount, and pauses
   when the document is hidden. Authenticated GET file routes reject audio too.
10. Metadata-only issuance/claim/denial/revocation audit (30 days); expired playback
    tickets and rate buckets are cleaned up. Guest hashes remain so old links can
    still route to the correct authenticated record, without renewing guest access.

## Limits

This is access control, NOT DRM or a guarantee against copying. A recipient receives
audio bytes and can capture network responses, browser memory, system output, or
use an external recorder. Context-menu suppression is only a UI deterrent.
Permissions-Policy display-capture=() prevents this document from initiating capture;
it cannot prohibit recording by other software. Microphone permission remains
self-only because employees record new voice messages in the existing form.
An attacker holding an unused guest link can consume it first. Revocation cannot
erase audio already delivered. Old copies, screenshots, and earlier downloads are
not recalled by this change. Do not place raw share tokens in public logs or git.

## Deployment And Operations

Apply scripts/audio-playback-schema.sql to the current application database with
ON_ERROR_STOP before deploying. No patient, feedback, or media rows are changed.
The existing database backup includes the new tables. Configure FRONTEND_URL to
the exact HTTPS frontend origin. All playback POSTs require application/json and
X-Audio-Playback: 1; authenticated routes also require a current Bearer token.

- POST /api/audio-playback/archive/tickets: administrator; {source, feedbackId, id}.
- POST /api/audio-playback/current/tickets: employee; same body, source=v21 only.
- POST /api/audio-playback/play: {token}; single-use, bound to the current account.
- POST /api/audio-playback/revoke: revoke unused tickets for the current account.
- POST /api/audio-playback/shares: administrator; exact target; returns URL and expiry.
- POST /api/audio-playback/shares/revoke: administrator; {token}; revoke guest access.
- POST /api/audio-guest/status: {token}; availability and authenticated fallback path.
- POST /api/audio-guest/play: {token}; one audio response, then sign-in required.

The archive page lets administrators create/copy/revoke a new guest link explicitly.
Creating a new link grants a new guest attempt; normal page refresh does not.
New feedback published to Trello includes a separate one-use link for each newly
uploaded audio file, audited under the submitting operator. The patient-record
footer stays authenticated and is explicitly labelled as requiring sign-in.
Existing non-audio files, patient links, and unresolved legacy links are not rewritten.

References: [OWASP token guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html),
[MDN display-capture scope](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/display-capture).
