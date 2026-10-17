-- Staff roles: admin-defined job titles on top of a built-in access level.
-- Additive only (new table + nullable column), safe to run before the code deploys.
-- Run in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS "staff_roles" (
  "id"        TEXT         NOT NULL,
  "name"      TEXT         NOT NULL,
  "baseRole"  "Role"       NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "staff_roles_name_key" ON "staff_roles"("name");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "staffRoleId" TEXT;
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_staffRoleId_fkey"
    FOREIGN KEY ("staffRoleId") REFERENCES "staff_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
