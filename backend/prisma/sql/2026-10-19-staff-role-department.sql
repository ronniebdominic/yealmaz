-- Staff roles get a department (group) so job titles can be organised as
-- Front Office > Cashier, Finance > Cashier, Support Staff > Janitor …
-- Additive and safe to run before the new code deploys. Run in the Supabase SQL Editor.

ALTER TABLE "staff_roles" ADD COLUMN IF NOT EXISTS "department" TEXT;

-- The same job title can now exist in two departments, so uniqueness moves from the name alone
-- to (department, name).
DROP INDEX IF EXISTS "staff_roles_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "staff_roles_department_name_key" ON "staff_roles"("department", "name");

-- Existing roles created before departments existed.
UPDATE "staff_roles" SET "department" = 'Support Staff' WHERE "department" IS NULL AND "name" IN ('Chef', 'Janitor');
