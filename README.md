# Ye-Almaz Dental Lab — System Documentation

Full-stack case management system for a dental laboratory. Clinics submit orders via a mobile app; lab staff process cases through a multi-department production workflow tracked by QR code scans; dispatch coordinates impression pickups and final deliveries.

---

## Repository Structure

```
yealmaz/
├── backend/                     # Express.js REST API + Socket.IO
├── frontend/receptionist/       # React + Vite staff web dashboard
├── yealmaz-clinic-app/          # Expo React Native clinic mobile app
├── data-import/                 # One-off data migration scripts & Excel files
├── docs/                        # Internal planning documents
├── CHANGELOG.md
├── SETUP.md                     # Step-by-step first-time setup guide
└── vercel.json                  # Frontend deployment config
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js · Express 4 · CommonJS |
| Database | PostgreSQL (Supabase) · Prisma ORM 5 |
| Real-time | Socket.IO 4 |
| Auth | JWT (jsonwebtoken) · bcryptjs |
| Caching | Redis (ioredis) |
| File storage | Cloudinary |
| Payments | Chapa (Ethiopian payment gateway) |
| QR codes | qrcode |
| Push notifications | web-push (VAPID) · expo-notifications |
| Staff frontend | React 19 · Vite · React Router 7 · TanStack Query 5 |
| Charts | Recharts |
| Mobile app | Expo SDK 54 · React Native 0.81 · React Navigation 6 |
| Export | xlsx (Excel) · jsPDF |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      Clients                            │
│                                                         │
│  Clinic Mobile App          Staff Web Dashboard         │
│  (Expo React Native)        (React + Vite)              │
│        │                          │                     │
└────────┼──────────────────────────┼─────────────────────┘
         │  HTTPS + Socket.IO       │
         ▼                          ▼
┌────────────────────────────────────────┐
│           Express.js API               │
│           backend/src/index.js         │
│                                        │
│  JWT auth middleware                   │
│  Role-based access control             │
│  Redis cache (15–60 s TTL)             │
│  Socket.IO rooms:                      │
│    lab_staff · delivery_{id}           │
│    clinic_{id}                         │
└────────┬───────────────┬───────────────┘
         │               │
         ▼               ▼
   PostgreSQL        Cloudinary
   (Supabase)        (screenshots,
   Prisma ORM        invoices)
```

---

## Backend

### Entry Point

**`backend/src/index.js`** — Express server setup, Socket.IO configuration, route mounting, Redis connection, rate limiting, CORS.

### Middleware

| File | Purpose |
|---|---|
| `src/middleware/auth.js` | `protect` — verifies JWT and attaches `req.user`. `restrict(...roles)` — gates routes to specific roles. |

### Utilities

| File | Purpose |
|---|---|
| `src/utils/excel.js` | `buildWorkbookBuffer` + `sendXlsx` — builds Excel workbooks from column definitions and streams them as downloads. |
| `src/utils/webpush.js` | `sendPushToClinic` — sends Web Push notifications to a clinic's registered browser/device subscriptions. |

### Cache

**`src/cache.js`** — `appCache.get/set`, `invalidate(...keys)` — thin Redis wrapper with pattern-based key invalidation. Cache TTLs range from 15 s (dispatch queue) to 5 min (price list).

### API Routes

| Mount | File | Description |
|---|---|---|
| `/api/auth` | `routes/auth.js` | Login (staff + clinic), token refresh, admin seed, push subscription registration |
| `/api/cases` | `routes/cases.js` | CRUD for cases; accept, status patch, comments, Excel export |
| `/api/clinics` | `routes/clinics.js` | List, create, update, toggle active/excluded/partner status |
| `/api/dispatch` | `routes/dispatch.js` | Pickup queue, assign/unassign drivers, phone order creation, send-out |
| `/api/delivery` | `routes/delivery.js` | Driver's assigned queue; collect-impression, pickup, deliver, return-to-queue |
| `/api/scan` | `routes/scan.js` | QR scan endpoint — records department stage, advances case status, auto-dispatches at QC |
| `/api/stages` | `routes/stages.js` | Full stage/timeline history for a case |
| `/api/payments` | `routes/payments.js` | Request payment, upload screenshot, verify/reject, manual cash entry, Chapa online payment |
| `/api/dashboard` | `routes/dashboard.js` | KPI summary, revenue trend, cases-by-status, analytics |
| `/api/lab` | `routes/lab.js` | Lab-specific queries (active cases in production) |
| `/api/prices` | `routes/prices.js` | Work type price list CRUD (price, express price, duration days) |
| `/api/notifications` | `routes/notifications.js` | In-app notification list and mark-read |
| `/api/rewards` | `routes/rewards.js` | Points balance, award points, redeem items, admin reward catalog |
| `/api/users` | `routes/users.js` | Staff user management — create, deactivate, reset password |

### Database Schema (`prisma/schema.prisma`)

#### Models

| Model | Key Fields | Purpose |
|---|---|---|
| `User` | id, name, email, password, role, department, phone, isActive | Staff accounts |
| `Clinic` | id, code, name, station, email, phone, address, isActive, isExcluded | Partner dental clinics |
| `Case` | id, caseNumber, patientName, workType, shade, status, dueDate, deliveryType, paymentStatus, totalAmount | Core order entity |
| `CaseStage` | id, caseId, stageName, scannedAt, scannedBy, notes | Immutable audit trail — one record per QR scan |
| `CaseComment` | id, caseId, body, authorName, authorRole | Staff notes thread on a case |
| `Payment` | id, caseId, amount, status, screenshotUrl, invoiceNumber, chapaTxRef | Payment lifecycle per case |
| `DeliveryLog` | id, caseId, deliveryById, pickedUpAt, deliveredAt, notes | Pickup + delivery timestamps |
| `WorkTypePrice` | id, workType, price, durationDays, expressPrice, expressDurationDays | Pricing and turnaround config |
| `PushSubscription` | id, clinicId, endpoint, p256dh, auth | Web Push VAPID subscriptions |
| `Notification` | id, caseId, userId, title, message, isRead | In-app notifications |
| `RewardSetting` | pointsPerCase | Global loyalty program config |
| `ClinicPoints` | clinicId, totalEarned, totalRedeemed | Per-clinic loyalty balance |
| `RewardTransaction` | clinicId, type (EARN/REDEEM), points, caseId | Loyalty point history |
| `RewardItem` | name, pointsCost, isActive | Redeemable reward catalog |
| `RewardRedemption` | clinicId, rewardItemId, pointsSpent, status | Redemption requests |

#### Enums

**`Role`:** `ADMIN` · `RECEPTIONIST` · `CLINIC` · `DELIVERY` · `DISPATCH` · `LAB_TECH` · `FINANCE`

**`CaseStatus`** (full lifecycle):
```
PENDING_PICKUP → PICKUP_ASSIGNED
  → CASE_ACCEPTED
  → PLASTER_DEPARTMENT → MARGIN_DEPARTMENT
  → SCANNING → DESIGNING
  → MILLING_SINTERING | RESIN_3D_PRINTING | METAL_3D_PRINTING
  → METAL_FINISHING → OPAQUE_APPLICATION → CERAMIC_LAYERING
  → ZIRCONIA_FITTING_FINISHING → GLAZING → THERMO_PRESS → TRIMMING
  → QUALITY_CHECK → READY_TO_DISPATCH
  → OUT_FOR_DELIVERY → DELIVERED

Exception: ON_HOLD · REMAKE · CANCELLED · UNDER_REVIEW · REJECTED
```

**`PaymentStatus`:** `PENDING` → `PAYMENT_REQUESTED` → `SCREENSHOT_UPLOADED` → `VERIFIED` | `REJECTED`

**`DeliveryType`:** `NORMAL` · `EXPRESS`

---

## Staff Web Dashboard (`frontend/receptionist/`)

React 19 single-page app. Role determined at login; each role sees only its relevant pages.

### Pages

| File | Role | Purpose |
|---|---|---|
| `pages/Login.jsx` | All | JWT login form |
| `pages/Dashboard.jsx` | RECEPTIONIST | Accept/review/reject incoming cases; monitor in-transit and arrived-at-lab cases; view ready-to-dispatch orders |
| `pages/Cases.jsx` | RECEPTIONIST, ADMIN | Full paginated case list with status/payment filters, date range, search, Excel export |
| `pages/NewCase.jsx` | RECEPTIONIST, DISPATCH, ADMIN | Create a case directly (drop-off or historical entry) |
| `pages/DispatchDashboard.jsx` | DISPATCH | Tabs: Place Order (PENDING_PICKUP) · Pickup In Progress · Ready for Delivery · Ready for Dispatch · En Route · Delivered; phone order modal; assign pickup/delivery drivers |
| `pages/DeliveryDashboard.jsx` | DELIVERY | Personal assigned queue; confirm impression collected, lab pickup, delivery; return-to-queue fallbacks |
| `pages/LabDashboard.jsx` | LAB_TECH | Camera-based QR scanner; 16 department buttons; live case stage timeline |
| `pages/FinanceDashboard.jsx` | FINANCE | Payment request management; verify screenshots; issue invoices; manual cash/bank payment entry |
| `pages/Billing.jsx` | FINANCE, ADMIN | Per-clinic monthly statement (Trusted Partners tab) |
| `pages/Payments.jsx` | FINANCE, ADMIN | Payment overview and history |
| `pages/AdminDashboard.jsx` | ADMIN | KPI cards with drill-down, revenue chart (6 months), cases-by-status chart, work-type breakdown |
| `pages/AdminCases.jsx` | ADMIN | Full case management with delete capability |
| `pages/AdminClinics.jsx` | ADMIN | Create/edit clinics, toggle active/excluded/partner |
| `pages/AdminPricing.jsx` | ADMIN | Work type price table — price, express price, normal/express duration |
| `pages/AdminUsers.jsx` | ADMIN | Create/deactivate staff users; one-time password reveal on creation |
| `pages/AdminRewards.jsx` | ADMIN | Reward item catalog and redemption approval |
| `pages/Delivery.jsx` | DISPATCH, ADMIN | Delivery overview and status tracking |

### Components

| File | Purpose |
|---|---|
| `components/Layout.jsx` | Shell with sidebar nav, mobile drawer, topbar — shared across receptionist/dispatch/delivery/lab/finance views |
| `components/AdminLayout.jsx` | Shell variant for admin pages |
| `components/CaseDetailModal.jsx` | Full case detail overlay — stages timeline, payment info, comments |
| `components/StatusBadge.jsx` | `StatusBadge` and `PaymentBadge` — colour-coded pill labels for case/payment status |
| `components/FilterBar.jsx` | Search input + date-range pickers for case list filters |
| `components/ExportMenu.jsx` | Excel export button — accepts column definitions and either a data array or a `fetchData` async function |
| `components/QRScanner.jsx` | Camera-backed QR scanner using jsQR (used in Lab dashboard) |
| `components/SearchableSelect.jsx` | Autocomplete dropdown (used in dispatch modals) |
| `components/Pagination.jsx` | Page navigation for paginated tables |

### Auth & API

| File | Purpose |
|---|---|
| `AuthContext.jsx` | React context — stores user, token, login/logout, persists to localStorage |
| `api.js` | Axios instance with JWT header injection; exports `socket` (Socket.IO client) |

---

## Clinic Mobile App (`yealmaz-clinic-app/`)

Expo managed workflow. Clinics log in with email + password and can submit orders, track progress, and handle payments.

### Screens

| Screen | Purpose |
|---|---|
| `screens/SplashScreen.js` | Animated splash on launch |
| `screens/auth/LoginScreen.js` | Email + password login |
| `screens/cases/HomeScreen.js` | Dashboard home with summary cards |
| `screens/cases/CasesScreen.js` | Case list — tabs: All · Active · Payment Pending; search by case # / patient; pagination |
| `screens/cases/CaseDetailScreen.js` | Full case view: status hero, case info, timeline of stages, payment section (upload screenshot / download invoice), delivery info |
| `screens/cases/NewCaseScreen.js` | New case form: odontogram tooth selector, work type from lab price list, shade, doctor info, delivery type (Normal/Express), auto-calculated due date and price; submits to API as PENDING_PICKUP |
| `screens/profile/ProfileScreen.js` | Clinic info, loyalty point balance, logout |
| `screens/rewards/RewardsScreen.js` | Points history, redemption catalog, redeem flow |

### Supporting Files

| File | Purpose |
|---|---|
| `api/client.js` | Axios instance with stored JWT and base URL |
| `context/AuthContext.js` | Auth state — token storage via AsyncStorage, login/logout |
| `utils/theme.js` | Design system constants — Colors, Spacing, Radius, Shadow |

---

## Case Workflow — End to End

```
1. CLINIC submits case (mobile app)
        ↓
   Status: PENDING_PICKUP  (no scan # yet)
        ↓
2. DISPATCH assigns pickup driver
   [Dispatch Dashboard → Place Order tab → Assign Pickup]
        ↓
   Status: PICKUP_ASSIGNED  (driver shown in Pickup In Progress tab)
        ↓
3. DELIVERY exec collects impression from clinic
   [Delivery Dashboard → Confirm Picked Up]
        ↓
   Status: PICKUP_ASSIGNED  (driver cleared → appears on Receptionist dashboard)
        ↓
4. RECEPTIONIST accepts the case
   [Receptionist Dashboard → Arrived at Lab → Accept]
   Scan number + QR code generated here.
        ↓
   Status: CASE_ACCEPTED
        ↓
5. LAB TECH scans QR at each department
   [Lab Dashboard → scan → select department]
   Progresses through production stages (Plaster → ... → Quality Check)
        ↓
   Status: READY_TO_DISPATCH  (auto-set when QC is scanned)
        ↓
6. FINANCE requests payment and verifies screenshot
   [Finance Dashboard → verify]
        ↓
   PaymentStatus: VERIFIED  (invoice auto-generated)
        ↓
7. DISPATCH assigns delivery driver
   [Dispatch Dashboard → Ready for Dispatch → Assign Driver]
        ↓
   Status: OUT_FOR_DELIVERY
        ↓
8. DELIVERY exec delivers to clinic
   [Delivery Dashboard → Confirm Delivered]
        ↓
   Status: DELIVERED
```

### QR Scan Departments (16)

| Code | Department | Advances to Status |
|---|---|---|
| RECEPTION | Reception | CASE_ACCEPTED |
| PLASTER | Plaster Department | PLASTER_DEPARTMENT |
| MARGIN | Margin Department | MARGIN_DEPARTMENT |
| SCANNING | Scanning | SCANNING |
| DESIGNING | Designing | DESIGNING |
| MILLING | Milling / Sintering | MILLING_SINTERING |
| RESIN_PRINT | Resin 3D Printing | RESIN_3D_PRINTING |
| METAL_PRINT | Metal 3D Printing | METAL_3D_PRINTING |
| METAL_FINISH | Metal Finishing | METAL_FINISHING |
| OPAQUE | Opaque Application | OPAQUE_APPLICATION |
| CERAMIC | Ceramic Layering | CERAMIC_LAYERING |
| ZIRCONIA | Zirconia Fitting | ZIRCONIA_FITTING_FINISHING |
| GLAZING | Glazing | GLAZING |
| THERMO | Thermo Press | THERMO_PRESS |
| TRIMMING | Trimming | TRIMMING |
| QC | Quality Control | QUALITY_CHECK + READY_TO_DISPATCH (two stages written atomically) |

---

## Real-time Events (Socket.IO)

| Room | Members | Events received |
|---|---|---|
| `lab_staff` | All lab users on join | `new_case`, `case_arrived`, `stage_scanned`, `case_ready_for_dispatch`, `case_delivered`, `case_updated` |
| `delivery_{userId}` | Specific delivery exec | `case_assigned` |
| `clinic_{clinicId}` | Specific clinic (mobile) | `case_updated`, `case_delivered` |

---

## Environment Variables (`backend/.env`)

```
DATABASE_URL=postgresql://...
JWT_SECRET=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
REDIS_URL=redis://...
APP_URL=https://your-backend-url
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:...
CHAPA_SECRET_KEY=...
```

---

## Running Locally

### Backend
```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run dev          # http://localhost:5000
```

Seed the first admin account (one time):
```
GET http://localhost:5000/api/auth/seed-admin
```

### Staff Web Dashboard
```bash
cd frontend/receptionist
npm install
npm run dev          # http://localhost:5173
```

### Clinic Mobile App
```bash
cd yealmaz-clinic-app
npm install
npx expo start
# Press 'a' for Android emulator, 'i' for iOS, 'w' for browser
```

---

## Data Import

`data-import/` contains:
- `clients-2026-02-28.xlsx` — historical clinic list for migration
- `order-sales-report-2026-05-23.xlsx` — historical order data
- `populate-stations.js` — script to bulk-assign clinic stations from the Excel file

---

## Versions

| Component | Version |
|---|---|
| Backend API | 1.8.0 |
| Staff Web Dashboard | 1.8.0 |
| Clinic Mobile App | 1.3.0 |

See [CHANGELOG.md](CHANGELOG.md) for full release history.
