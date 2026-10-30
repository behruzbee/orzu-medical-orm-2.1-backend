BEGIN;
CREATE TABLE IF NOT EXISTS audio_playback_tickets (
  token_hash char(64) PRIMARY KEY,
  actor_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('v1', 'v2', 'v21')),
  feedback_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  requires_admin boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS audio_playback_tickets_expiry ON audio_playback_tickets (expires_at);
CREATE TABLE IF NOT EXISTS audio_playback_limits (
  actor_id uuid NOT NULL,
  operation text NOT NULL,
  bucket bigint NOT NULL,
  attempts integer NOT NULL,
  PRIMARY KEY (actor_id, operation, bucket)
);
CREATE TABLE IF NOT EXISTS audio_playback_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  evidence_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audio_playback_audit_time ON audio_playback_audit (occurred_at);
CREATE TABLE IF NOT EXISTS audio_guest_links (
  token_hash char(64) PRIMARY KEY,
  created_by uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('v1', 'v2', 'v21')),
  feedback_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS audio_guest_limits (
  key_hash char(64) NOT NULL,
  bucket bigint NOT NULL,
  attempts integer NOT NULL,
  PRIMARY KEY (key_hash, bucket)
);
ALTER TABLE audio_playback_audit ALTER COLUMN actor_id DROP NOT NULL;
COMMIT;
