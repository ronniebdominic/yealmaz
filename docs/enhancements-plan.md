# Ye-Almaz — Workflow Enhancements Implementation Plan

Source: client "Work flow chart.xlsx" (sheets: Dispatch dashboard, Delivery Portal, Reception, Finance, Work flow) + the 6 highlighted email items.

Status of this doc: **plan only — no code written yet.** Two items are explicitly **PARKED** pending a client decision (see §6).

## 0. Ground rules / mechanics

- **Three apps:** `backend/` (Express + Prisma + Socket.io), `frontend/receptionist/` (React/Vite — staff: reception, dispatch, delivery, finance, lab, admin), `yealmaz-clinic-app/` (Expo RN — clinics order cases).
- **Schema migrations are manual.** `schema.prisma` notes Railway can't reach Supabase :5432, so `prisma db push` is not used in prod. Each model change = (1) SQL run in Supabase SQL editor / Supabase MCP `apply_migration`, (2) update `backend/prisma/schema.prisma`, (3) `prisma generate` on deploy. All migrations below assume this flow.
- **Caching:** list/summary endpoints cache via `appCache` and clear via `invalidate('cases:*', ...)`. Any new write path must call `invalidate` with the right keys.
- **No DB column becomes NOT NULL** for the mandatory-field work — historical/imported rows would break. Mandatory-ness is enforced at the API + form layer only.

---

## 1. Phase 1 — New-case ordering (A1, A3) — *ready to build*

### A1. Work-type options must come from the edited pricing list
The pricing list lives in `WorkTypePrice` and is served (public) by `GET /api/prices` ([prices.js](../backend/src/routes/prices.js)).

- **Clinic app** [NewCaseScreen.js](../yealmaz-clinic-app/src/screens/cases/NewCaseScreen.js): currently a hardcoded `WORK_TYPES` array (~50 items) and prices are never read (only `durationDays`).
  - Remove `WORK_TYPES`; populate the dropdown from `/api/prices`.
  - Show the unit price next to each option and a computed total (mirror the receptionist behavior).
  - Keep the existing due-date logic (already reads `durationDays` from prices).
- **Receptionist** [NewCase.jsx](../frontend/receptionist/src/pages/NewCase.jsx): already auto-prices from `/api/prices`, but the dropdown options come from a hardcoded `WORK_TYPE_GROUPS`.
  - Drive options from `pricesData` so a work type without a price row cannot be selected.
- **Open sub-decision:** `WorkTypePrice` has no category/group column, but the current UI groups types (Zirconia, PFM, …). Options: (a) flat alphabetical list, or (b) add an optional `category` column to `WorkTypePrice` + group by it. Recommend (b) if grouping matters to staff; otherwise (a).
- **Edge case:** existing cases referencing now-removed work types still render fine (workType is free text on `Case`); only *new* orders are constrained.

### A3. Shade, Doctor name, Doctor contact mandatory on new cases
Currently only `patientName` + `workType` are required — backend [cases.js:154](../backend/src/routes/cases.js#L154), clinic [NewCaseScreen.js:225](../yealmaz-clinic-app/src/screens/cases/NewCaseScreen.js#L225), receptionist [NewCase.jsx](../frontend/receptionist/src/pages/NewCase.jsx).
- **Backend** `POST /api/cases`: require non-empty `shade`, `doctorName`, `doctorPhone`. Return 400 with a clear message.
- **Clinic app** `validate()`: add the three checks + mark fields with `*`.
- **Receptionist** submit validation: same.
- **Carve-out:** historical imports (`deliveryDate` supplied → status `DELIVERED`) should bypass the requirement so back-dated data entry isn't blocked. Confirm desired.

**Phase 1 migration:** none (unless A1 option (b) is chosen → add `WorkTypePrice.category String?`).

---

## 2. Phase 2 — Reception panel (B1, B3, B4) — *ready to build; B2 parked*

Reception dashboard: [Dashboard.jsx](../frontend/receptionist/src/pages/Dashboard.jsx); stats from `GET /api/dashboard/summary` ([dashboard.js](../backend/src/routes/dashboard.js)).

### B1. Show daily totals, not overall totals
`summary` already returns `todayCases`, `deliveredToday`, `remakeCount`, `redoCases`, `readyToDispatch`. The page also shows overall "Total Delivered" / totals.
- Remove the overall-total stat cards; keep the per-day set (orders today, remake, redo, delivered today). Mostly a UI edit.

### B3. All ready orders + search by order date / clinic / case / patient
- Search by clinic/patient/case already works **client-side**, but there is **no date filter** and `GET /api/cases` has none ([cases.js:54](../backend/src/routes/cases.js#L54)).
- **Backend** `GET /api/cases`: add `dateFrom`/`dateTo` (filter on `createdAt` = order date). The cache key already serializes query params, so caching still works.
- **Reception UI:** add Date-from / Date-to inputs, push search + dates to the server query.

### B4. Comment section on Accept Case (additional info needed from dentist)
New capability. Today there's `Case.notes` and `CaseStage.notes` but no receptionist comment thread.
- **Recommended:** new `CaseComment` model (`id, caseId, authorName, authorRole, body, createdAt`) → endpoints `POST /api/cases/:id/comments`, `GET /api/cases/:id/comments`. Renders in the Accept Case view / [CaseDetailModal.jsx](../frontend/receptionist/src/components/CaseDetailModal.jsx).
- **Lighter alternative:** single `Case.receptionNote String?` field. Pick based on whether a thread (multiple notes/people) is wanted.

**Phase 2 migration:** `CaseComment` model (or `Case.receptionNote`).

### B2. [PARKED] Remove duplicated "ready orders" vs "all ready orders should display"
The email both says *remove the ready list (duplicate of ready-to-dispatch)* and *all ready orders should display on reception with search*. Reception currently shows a "Ready for Delivery" list (`READY_TO_DISPATCH` cases) that overlaps Dispatch. Resolution deferred — needs client to clarify which list stays. The B3 date-search work is built to apply to whichever list survives.

---

## 3. Phase 3 — Excel export (C) — *ready to build; Excel only*

No export exists anywhere today. Decision: **Excel (.xlsx) only.**
- **Approach:** server-side generation with `exceljs` (add dependency). New endpoints stream a workbook, reusing each list's existing filters + role gating:
  - `GET /api/cases/export.xlsx` (reception/admin case list)
  - `GET /api/payments/billing/export.xlsx` and history/trusted (finance)
  - `GET /api/dashboard/finance-report/export.xlsx` (finance summary)
  - delivered / ready lists as needed
- **Frontend:** "Export to Excel" buttons that GET the endpoint and download.
- Server-side chosen over client SheetJS for consistent formatting and large datasets.

**Phase 3 migration:** none. (Dependency: `exceljs`.)

---

## 4. Phase 4 — Dispatch / Delivery / Finance / Workflow (D) — *larger; build after 1–3*

Detailed in the Excel beyond the 6 bullets. Much is partially built.

### Dispatch ([DispatchDashboard.jsx](../frontend/receptionist/src/pages/DispatchDashboard.jsx))
- Counters: Total placed, Ready to dispatch, Picked up, Pending pickup/delivery, Delivered.
- Lists: Place-order pickup (clinic/location/contact + Assign), Ready-for-Delivery (clinic/patient/case/product/unit/price/total + Request Payment), Ready-for-Dispatch (clinic/location/contact/payment status + Assign), Delivered list (… + payment + delivery status).
- Search (clinic/case/patient) + date range. Audit which counters/lists already exist; fill gaps.

### Delivery ([DeliveryDashboard.jsx](../frontend/receptionist/src/pages/DeliveryDashboard.jsx))
- Pickup list: Mark as picked up / Not picked up.
- Delivery list: Mark as delivered / **Return not delivered** (new — needs a `RETURNED`/`returnedAt` concept on `DeliveryLog` or a case status).

### Finance ([FinanceDashboard.jsx](../frontend/receptionist/src/pages/FinanceDashboard.jsx))
- Delivered/day, total units, revenue, paid, pending — mostly served by `finance-report` + `clinic-balances` ([dashboard.js](../backend/src/routes/dashboard.js)).
- Trusted-partner totals layout (total/delivered/in-progress/revenue/received/outstanding), unpaid-cases view, report + Excel export.

### Workflow rule
- "Ready for delivery" must be visible to Reception, Finance **and** Dispatch — verify role gating + shared data source/socket rooms expose it to all three.

**Phase 4 migrations:** delivery "return not delivered" status/flag.

---

## 5. Consolidated schema migrations
1. *(opt, A1b)* `WorkTypePrice.category String?`
2. *(B4)* `CaseComment` model **or** `Case.receptionNote String?`
3. *(Phase 4)* delivery return-not-delivered status/flag
4. *(PARKED, A2)* redo: `Case.isRedo Boolean @default(false)` (+ possibly `originalCaseId`) and a 50%-price rule

---

## 6. Parked / open decisions
- **A2 Redo pricing** — definition (vs `remake`) + how 50% is applied. PARKED.
- **B2 Reception ready-list dedup** — what to remove vs keep. PARKED.
- **A1 grouping** — flat list vs add `category` column.
- **B4 comment** — thread (`CaseComment`) vs single `receptionNote`.
- **A3 carve-out** — exempt historical/delivered imports from mandatory fields?

## 7. Suggested sequencing
1. **Phase 1** (pricing alignment + mandatory fields) — highest value, low risk, minimal/no migration.
2. **Phase 2** (reception daily counts + date search + comments).
3. **Phase 3** (Excel export).
4. **Phase 4** (Dispatch/Delivery/Finance/Workflow) — after the parked decisions land.

## 8. Build log / pending migrations
- **Phase 1 — DONE.** A1 work types: **both new-case forms are driven solely by the pricing list (`/api/prices`)** — hardcoded catalogs removed (client confirmed: remove the hybrid). `FLAT_PRICE_TYPES` (per item/arch, not × tooth count) = `Night Guard, Retainer, Clear Aligner, Bleaching Tray, Flexible Denture, Fexible Denture, 3D Printed Model`. A3 mandatory shade/doctor name/contact (both forms + API, historical exempt). No migration. NB: pricing table has 14 curated types incl. a typo "Fexible Denture" (both spellings kept in the flat set).
- **Phase 2 — code DONE.** B1 reception daily counts (removed all-time totals); B3 `dateFrom`/`dateTo` on `GET /api/cases` + reception ready-list date search; B4 staff comment thread (`CaseComment` model + `/api/cases/:id/comments` endpoints + CaseDetailModal UI). B2 still PARKED.
- **Phase 4 — DONE (mostly pre-existing).** Audit found Delivery "Not Picked Up" + "Return — Not Delivered" already implemented ([DeliveryDashboard.jsx](../frontend/receptionist/src/pages/DeliveryDashboard.jsx) via `PATCH /cases/:id/status`); Dispatch counters/lists/assign/assign-pickup/request-payment/stations already implemented; Finance KPIs + tabs (Screenshots, Billing, Trusted Partners, History, Cases Overview, Clinic Balances, Revenue Report) already implemented. Only concrete gap closed: **Date-from/Date-to filter added to the Dispatch board**. No migration. Workflow "ready-for-delivery visible to all 3 depts" appears satisfied (Reception ready list + Dispatch queue + Finance Cases Overview).
- **Phase 3 — DONE.** Excel export via existing `xlsx` dep: `backend/src/utils/excel.js` helper + `GET /api/cases/export` + `GET /api/payments/export`; frontend `downloadExport()` in `api.js` + Export buttons on Cases page, reception ready list, and Finance → History tab. No migration.
- **A2 — DONE (code).** `isRedo` flag on Case (distinct from `remake`): redo/replacement = replacing an existing in-mouth restoration, charged at 50%. Toggle on both new-case forms halves the amount; backend stores `isRedo`; dashboard "Redo" counter now counts `isRedo` (was `status:REMAKE`); CaseDetailModal shows a Redo row. **Needs migration (below).**
- **B2 — DONE.** Removed the "Ready for Delivery" list from the reception dashboard (duplicated Dispatch); kept the Ready-to-Dispatch count. No migration.
- **Phase 5 — code DONE.** `FINANCE_AP` (trusted-partner follow-up: `/payments/trusted`, `/payments/statement/:clinicId`, `/payments/:caseId/fs-number`, `/payments/:caseId/collect`, `/dashboard/trusted-partners-summary`) and `FINANCE_CASHIER` (`/payments/:caseId/collect`, `/payments/billing`, `/payments/pending`, `/payments/:caseId/verify`, `/payments/gateway`) added to the `Role` enum and wired into `payments.js`/`dashboard.js` `restrict()`. `FinanceDashboard.jsx` now derives a `scope` (`FULL`/`AP`/`CASHIER`) from `user.role`, trims the sidebar/drawer nav to just the tab each scope can reach, defaults straight into that tab (skipping the mixed 'dashboard' overview, which calls FULL-only endpoints), and disables queries the role has no backend access to. `AdminUsers.jsx` role dropdown + colors updated so Admin can create the two accounts. Plain `FINANCE` role is untouched (still full access). **Needs migration (below).**

### ⚠️ PENDING MIGRATIONS — run in Supabase SQL Editor before deploying that code, then deploy (Railway `npm run build` auto-runs `prisma generate`)

**A2 — `isRedo` column. CRITICAL: deploying A2 code without this column breaks `POST /cases` (case creation) AND the dashboard summary — run this FIRST/with the A2 deploy.** Additive & safe:
```sql
ALTER TABLE cases ADD COLUMN IF NOT EXISTS "isRedo" BOOLEAN NOT NULL DEFAULT false;
```

**Phase 5 — new `Role` enum values. CRITICAL: deploying this code without these values breaks login/user-creation for the two new roles (and Prisma Client generation expects them to match `schema.prisma`) — run before/with this deploy.** Additive & safe:
```sql
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FINANCE_AP';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FINANCE_CASHIER';
```

**B4 — `case_comments` table** (only the comments feature 500s without it; not catastrophic):
```sql
CREATE TABLE IF NOT EXISTS case_comments (
  id           TEXT PRIMARY KEY,
  "caseId"     TEXT NOT NULL REFERENCES cases(id),
  body         TEXT NOT NULL,
  "authorName" TEXT,
  "authorRole" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "case_comments_caseId_idx" ON case_comments("caseId");
```

---

## 9. Phase 5 — Finance role split: Accounts Payable + Cashier accounts

Source: client WhatsApp 5/8/2026 — two proposed finance accounts: (1) an "accounts payable" account that only follows up trusted partners, (2) a "cashier" account that does daily real-time collection from upfront-paying clinics, described as a stopgap "until Chapa is integrated."

**Note for the client:** Chapa online payment is already fully implemented in this codebase ([payments.js](../backend/src/routes/payments.js) — `chapa-nodejs`, initialize/webhook/verify flow). Worth clarifying with them whether the cashier role is still wanted as a permanent walk-in/cash-collection role (most labs need one regardless of gateway status) or whether they believed Chapa wasn't live yet.

### Design decision — recommend confirming before building
Add two new **hard, backend-enforced** `Role` enum values — `FINANCE_AP` and `FINANCE_CASHIER` — following the same pattern as the existing `HR_MANAGER` / `INVENTORY_MANAGER` roles, rather than a soft permission flag on the existing `FINANCE` role. This app's entire authz model is `restrict('ROLE', ...)` at the route level ([auth.js](../backend/src/middleware/auth.js)), so a real Role value keeps AP/Cashier access enforced at the API layer even if the frontend is bypassed, and costs only a one-line addition per route. The existing `FINANCE` role is untouched and keeps full access — recommended as the "finance manager/owner" account that can still see everything.

**Confirm with client:** keep `FINANCE` (full access) as a third role for oversight, or should AP/Cashier fully replace it?

### Backend changes
1. **schema.prisma**: add `FINANCE_AP`, `FINANCE_CASHIER` to `enum Role`.
2. **payments.js** — extend `restrict()` allow-lists:
   - **AP scope** (trusted-partner follow-up only): `GET /trusted`, `GET /statement/:clinicId`, `POST /:caseId/fs-number` → add `FINANCE_AP`.
   - **Cashier scope** (upfront/walk-in collection): `POST /:caseId/collect`, `GET /billing`, `GET /pending`, `POST /:caseId/verify` (screenshot approval is also a real-time payment confirmation) → add `FINANCE_CASHIER`.
   - Deliberately **not** granting AP/Cashier `GET /export`, `/invoices`, `/gateway`, `/history` — none of these endpoints scope results by caller (an AP or Cashier user would see *all* payments, not just their slice), so until that scoping exists those stay `ADMIN, FINANCE` only.
3. **dashboard.js** — `finance-report`, `clinic-balances`, `trusted-partners-summary` stay `ADMIN, FINANCE` only (aggregate views, not needed by either single-purpose UI yet).

### Frontend changes
1. **App.jsx** (~line 68): route `FINANCE_AP` / `FINANCE_CASHIER` to `<FinanceDashboard />` like `FINANCE`, passing a `scope` prop derived from `user.role`.
2. **FinanceDashboard.jsx**: gate tabs by scope — `FULL` (`FINANCE`/`ADMIN`) unchanged; `AP` shows only Trusted Partners; `CASHIER` shows only Billing/Collect (+ Verify Payments). This is a UX convenience layer — the real guard is the backend `restrict()` change above.
3. **AdminUsers.jsx**: add `FINANCE_AP` ("Finance — AP") and `FINANCE_CASHIER` ("Finance — Cashier") to the `ROLE_MAP` dropdown + `ROLE_COLORS` so Admin can create these accounts from the existing Users screen.

### Migration
```sql
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FINANCE_AP';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FINANCE_CASHIER';
```
Additive & safe — run in Supabase SQL editor before deploying the code that references these values (same flow as §0).

### Open decisions
- Retire plain `FINANCE` once AP/Cashier exist, or keep it as a third "sees everything" role?
- Should Cashier get `POST /:caseId/request` (send payment request/amount due), or only collect against an amount already set by Dispatch/Reception (current behavior)?
- Confirm with client what "until Chapa is integrated" means, given Chapa is already live in code.

### Sequencing
1. Migration (enum values) — additive, zero risk.
2. `payments.js` `restrict()` updates.
3. `AdminUsers.jsx` role dropdown (needed to actually create the two accounts).
4. `FinanceDashboard.jsx` tab gating.
5. Manual QA: create one AP + one Cashier test user, confirm each only sees/can hit their scoped tabs/endpoints, confirm a stray call to an out-of-scope endpoint 403s.
