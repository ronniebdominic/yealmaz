# 🦷 Ye-Almaz Clinic App — Setup Guide

## STEP 1 — Install tools (one time)

Install Node.js: https://nodejs.org (LTS version)
Install Expo CLI:
  npm install -g expo-cli eas-cli

Install the Expo Go app on your Android phone from Google Play Store
(for testing without publishing)

---

## STEP 2 — Get your PC's local IP address

Open Command Prompt and run:
  ipconfig

Find "IPv4 Address" under your WiFi adapter.
Example: 192.168.1.105

---

## STEP 3 — Update the API URL

Open: src/api/client.js
Change this line to your PC's IP:
  export const API_BASE = 'http://192.168.1.105:5000/api';

Your phone and PC must be on the SAME WiFi network.

---

## STEP 4 — Install dependencies

Open Command Prompt in the yealmaz-clinic-app folder:
  cd C:\yealmaz\yealmaz-clinic-app
  npm install --legacy-peer-deps

---

## STEP 5 — Run on your phone (testing)

  npx expo start

Scan the QR code shown in the terminal with the Expo Go app.
The app will open on your phone instantly.

Test login with:
  Email: testclinic@yealmaz.com
  Password: Admin1234

---

## STEP 6 — Publish to Google Play Store

1. Create an Expo account at expo.dev
2. Create an EAS project:
     eas init

3. Build the Android APK:
     eas build --platform android --profile preview

   This creates an APK you can install directly (for testing)
   Or for Play Store:
     eas build --platform android --profile production

4. Create a Google Play Developer account ($25 one-time fee)
   at play.google.com/console

5. Upload the .aab file from EAS build to Play Store

---

## STEP 7 — Before going live

Update src/api/client.js to use your deployed backend URL:
  export const API_BASE = 'https://your-backend.railway.app/api';

Deploy your backend to Railway or Render first.

---

## App Features

- Login screen with clinic credentials
- Home dashboard with live stats (active, pending payment, delivered)
- Quick actions: New Case, My Cases, Payments
- Cases list with search and filters (All, Active, Payment, Delivered)
- Case detail with:
  * Live production progress bar (8 stages)
  * Stage-by-stage timeline with timestamps
  * Payment status and screenshot upload
  * Camera and gallery support for payment photos
  * Auto-refreshes every 15 seconds
- New case submission with full form
- Profile screen with clinic info

---

## Clinic Credentials Format

Each clinic logs in with:
  Email: their registered email
  Password: set when account was created (default: Admin1234)

To create clinic accounts, add them via Supabase SQL:
  INSERT INTO clinics (id, name, email, phone, address, password, "isActive", "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid()::text,
    'Clinic Name',
    'clinic@email.com',
    '0912345678',
    'Addis Ababa',
    '$2a$10$wtSqxc76hhgdRPFWSKPPsu43l.WWAWcGGG2RapfIVpKOxdqwSOX6m',
    true, NOW(), NOW()
  );
  (password = Admin1234)
