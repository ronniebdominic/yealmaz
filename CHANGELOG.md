# Changelog — Ye-Almaz Dental Lab

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · Versioning: [Semantic Versioning](https://semver.org/)

---

## Web App + Backend

### [1.8.0] — 2026-05-29
Finance can now record manual cash/bank payments directly from the Billing tab without needing a clinic screenshot. Admin form utilities extracted into a shared module.

### [1.7.0] — 2026-05-29
New Users management tab for admins to create, edit, and deactivate staff accounts with one-time password reveal on creation.

### [1.6.0] — 2026-05-29
Payment flow overhauled: finance now sends a payment request first and the invoice is auto-generated only on approval.

### [1.5.0] — 2026-05-29
Admin clinic list gained a dedicated Partner column and explicit partner toggle buttons.

### [1.4.0] — 2026-05-29
`durationDays` is now stored per work type in the pricing table, with a keyword-pattern fallback. Editable Duration column added to the Admin Pricing page.

### [1.3.0] — 2026-05-29
Admins can now create and manage clinics and work types directly from the dashboard. Finance gained a per-clinic monthly statement view in the Trusted Partners tab.

### [1.2.0] — 2026-05-28
Impression pickup added as the first step in the case lifecycle. Clinic stations introduced across dispatch and delivery. Case management gained filters, search, Excel export, column reorder, and sort by date.

### [1.1.0] — 2026-05-27
Due date auto-calculates on new case creation in the receptionist dashboard. Mobile nav drawer added across all dashboards. Resolved Railway deployment issues (Procfile, nixpacks, CORS, service worker caching).

### [1.0.0] — Initial release
Core dashboards (Receptionist, Lab Tech, Delivery, Dispatch, Finance, Admin), JWT role-based auth, Socket.IO notifications, Redis caching, Cloudinary storage.

---

## Clinic App

### [1.3.0] — 2026-05-29
Payment flow overhauled: app now shows a payment request card with amount and instructions before upload is allowed. Invoice displays on approval. Fixed screenshot upload failures on web PWA (Platform check, native fetch, Content-Type header).

### [1.2.0] — 2026-05-29
Due date auto-calculates and is shown as an info card when a work type is selected on new case creation.

### [1.1.0] — 2026-05-27
Prominent logout button added to the Profile screen.

### [1.0.0] — Initial release
Case list, case detail, payment screenshot upload, invoice PDF download, push notifications.
