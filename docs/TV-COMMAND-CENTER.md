# Ye-Almaz Live Production TV (`/tv/live`)

A read-only, always-on laboratory television. Six rotating screens (Command Center, Employee Wall, Performance
Board, Case Pipeline, Critical Cases, Team Achievements) driven by real production data.

Branch: `feature/tv-command-center`. **Not merged, not deployed.**

## How it works

```
 scan / accept / status / delivery / attendance  ──►  production_events (numbered, append-only)
                                                          │            │
              GET /api/tv/snapshot  ◄── tvProjection ◄────┘            └─► /tv socket (deltas: seq, type, case, stage)
              (authoritative state)       (pure, tested)
                       ▲                                                    │
                       └──── TV refetches (debounced) after each event, on reconnect, and every 60 s
```

* **Snapshot is the truth; events are the doorbell.** The TV re-reads the snapshot after every event, so a lost
  event can never leave a wrong card on screen. Events carry sequence numbers; a skipped number triggers a
  catch-up fetch (`GET /api/tv/events?after=<seq>`).
* **Stale data is never shown as live.** Disconnected or silent for 45 s → the header drops "LIVE" and a banner
  reads `RECONNECTING — DATA MAY BE OUTDATED`.
* **One connection.** All six screens share one store and one socket; screens mount only while visible and clean
  up their timers when they leave.
* **Fixed 1920×1080 stage scaled to fit**, so 1080p and 4K render identically with no scrollbars.

### What "working" means
The lab has no start/pause button. A technician is **WORKING** only when they are on duty *and* the case they most
recently scanned into their department is still at that department. Other cases they scanned earlier and that are
still there count as "+N assigned", not as worked. A case moved on with nobody scanning it in shows
**AWAITING ASSIGNMENT**; no owner is ever invented. ON BREAK comes from break punches, BLOCKED from an on-hold
case, WAITING FOR APPROVAL from remake review / under-review. On duty = a punch today, or a scan in the last 2 h
(so a terminal outage does not blank the wall).

### Performance model (transparent, configurable)
* Workload = finished stage visits × units × per-department weight (default 1).
* **Ranked only where a department daily target is configured.** Without a target the person is listed, unranked.
* Quality = share of finished cases with no later remake; on-time = share of visits within the department's
  expected bench time. Both show **Not enough data** below the minimum sample (default 10 finished cases) or
  without a target. Quality, timeliness, workload and trend are shown separately, never blended into one score.

## Security
* A TV signs in with a one-time pairing code (10 min, single use) from **Admin → TV Display** and receives its own
  token. Only the token's **hash** is stored. Revoking drops the live connection immediately.
* The token reaches `/api/tv/{snapshot,events,config}` only. It cannot reach any other route; settings and display
  management require an admin login. Existing user authentication and permissions are untouched.
* The snapshot is built by a backend projection whose vocabulary is: case number, work type, units, stage, times,
  employee names, department. No patient, clinic or money fields exist in it (asserted by tests, including
  against a real database).
* Pairing is rate-limited. The TV client does not use the staff API client, so a revoked TV can never log a staff
  user out or redirect to the staff login.

## Production migration (exact)
1. Run `backend/prisma/sql/2026-10-22-tv-command-center.sql` in the Supabase SQL Editor. It is additive
   (`CREATE TABLE IF NOT EXISTS` ×3, indexes, RLS on). It touches no existing table or row.
2. Deploy the backend (Railway). Until step 1 is done the event hooks just log one warning a minute; scans,
   case changes and attendance are unaffected (event logging never throws into those paths).
3. Deploy the frontend (Vercel). The TV is at `/tv/live`; the admin panel at `/admin/tv`.
4. Admin → TV Display: set targets/thresholds, create a pairing code, open `/tv/live` on the TV, enter the code,
   press **F** (or the Full screen button).

### Rollback
* Frontend: redeploy the previous Vercel build (the `/tv` route and `/admin/tv` page disappear; nothing else changes).
* Backend: redeploy the previous Railway build. The three new tables can stay (unused) or be dropped:
  `DROP TABLE production_events, tv_config, display_sessions;` — nothing else references them.

## Technician attribution: current state and a safe migration proposal (not implemented)
Today a scan is attributed by the **string** `CaseStage.scannedBy = "Name (DEPT)"`, matched to a user by exact name.
Consequences: two employees with the same name are merged; a renamed employee loses their history; a shared
department login ("Zirconia Fitting") appears as a person.

Proposal — additive and reversible, never rewriting history:
1. Add `scannedById TEXT NULL` + index to `case_stages` (no FK needed at first).
2. **Dual-write** from `scan.js`: keep writing `scannedBy` exactly as today and also write the technician's user id.
3. **Backfill by evidence only:** set `scannedById` where the name matches exactly one user; leave NULL where the
   name is ambiguous (several users) or unmatched. Produce a report of every NULL for a human to decide. First run
   as a read-only dry run (`SELECT name, count(*) FROM users GROUP BY name HAVING count(*) > 1;` and a count of
   case_stages whose name matches 0 or >1 users).
4. Readers prefer `scannedById`, fall back to the name. The original `scannedBy` text is never modified.
5. Only after a few weeks of clean dual-write data consider making new scans require an id.

## Known limitations
* No start/pause/resume or case assignment exists in the lab workflow, so "working" is inferred from the latest
  scan (see above). An explicit Start/Pause button on the lab tech screen would make it exact.
* ON BREAK requires break punches; BLOCKED is the on-hold status; QC *failures* are not recorded anywhere, so the
  Critical screen has no QC-failure column rather than an invented one.
* No per-user photos exist; cards show initials. Current shift is not shown (no shift data in the TV projection).
* Attribution is by name until the migration above is done; shared department logins are not shown as employees.
* Cases with `dueDate` missing are never "overdue".
* The TV needs the backend's `TZ=Africa/Addis_Ababa` (already set in `src/index.js`) for local-day counters.

## Tests
```
cd backend && npm test                               # unit + authorization (no database needed)
DATABASE_URL=<LOCAL postgres> node --test tests/tvIntegration.test.js   # real PostgreSQL; refuses non-local hosts
node tests/tools/tvDemo.js [--simulate] [--employees=N]                 # seeded local demo API for the browser checks
```
Browser checks (`frontend/receptionist/tv-visual/`) drive Edge/Chrome through puppeteer-core against the demo API:
`npm i --no-save puppeteer-core` then `node tv-visual/tv-visual.mjs <outDir> <demo.json>`.
