-- Extra access on top of a user's main role (e.g. a lab tech who also manages inventory).
-- Run in the Supabase SQL Editor BEFORE deploying the code that reads it. Additive and safe to re-run.
ALTER TABLE users ADD COLUMN IF NOT EXISTS "extraRoles" TEXT[] NOT NULL DEFAULT '{}';
