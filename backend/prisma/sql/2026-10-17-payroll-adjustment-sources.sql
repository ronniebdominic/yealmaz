-- Payroll: auto-generated adjustments remember which overtime/advance/expense/
-- incentive records they cover, so those are only marked paid when the run is
-- marked PAID (not at draft creation). Additive, safe to run before deploy.
-- Run in the Supabase SQL Editor.

ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "sourceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
