-- Live Production TV: event log, display config, paired display sessions. Additive only.
CREATE TABLE IF NOT EXISTS production_events (
  seq          BIGSERIAL PRIMARY KEY,
  type         TEXT NOT NULL,
  "caseId"     TEXT,
  "caseNumber" TEXT,
  stage        TEXT,
  "fromStage"  TEXT,
  department   TEXT,
  "actorUserId" TEXT,
  "actorName"  TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data         JSONB
);
CREATE INDEX IF NOT EXISTS production_events_occurred_idx ON production_events ("occurredAt");
CREATE INDEX IF NOT EXISTS production_events_case_idx ON production_events ("caseId");

CREATE TABLE IF NOT EXISTS tv_config (
  id            TEXT PRIMARY KEY DEFAULT 'default',
  config        JSONB NOT NULL,
  "updatedById" TEXT,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS display_sessions (
  id                 TEXT PRIMARY KEY,
  label              TEXT NOT NULL,
  "tokenHash"        TEXT UNIQUE,
  "pairingHash"      TEXT UNIQUE,
  "pairingExpiresAt" TIMESTAMP(3),
  "createdById"      TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pairedAt"         TIMESTAMP(3),
  "lastSeenAt"       TIMESTAMP(3),
  "revokedAt"        TIMESTAMP(3)
);
-- The tables are reached only through the backend (service connection); keep them closed to the public API.
ALTER TABLE production_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tv_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE display_sessions ENABLE ROW LEVEL SECURITY;
