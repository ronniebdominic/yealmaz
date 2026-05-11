# 🦷 Ye-Almaz Dental Lab — Setup Guide
# Follow these steps in order. Don't skip any.

## STEP 1 — Download the project files
Copy the entire `yealmaz` folder to your Windows PC.
Place it somewhere easy to find, e.g. C:\Projects\yealmaz

## STEP 2 — Get your Supabase database URL
1. Go to https://supabase.com and sign in
2. Click "New Project"
3. Name it: yealmaz-dental
4. Set a strong password (save it!)
5. Choose region: Southeast Asia (Singapore)
6. Wait 2 minutes for it to set up
7. Go to: Settings → Database → Connection String → URI
8. Copy that long URL — it looks like:
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxx.supabase.co:5432/postgres

## STEP 3 — Get your Cloudinary credentials
1. Go to https://cloudinary.com and sign in
2. On the Dashboard you'll see: Cloud Name, API Key, API Secret
3. Copy all three

## STEP 4 — Create your .env file
1. Open the `backend` folder
2. Find the file called `.env.example`
3. Make a COPY of it and rename the copy to `.env` (no .example)
4. Open `.env` in Notepad or VS Code
5. Fill in:
   - DATABASE_URL = paste your Supabase URI
   - JWT_SECRET = type any long random text e.g. YeAlmaz_Secret_2024_xk92mz!
   - CLOUDINARY_CLOUD_NAME = from step 3
   - CLOUDINARY_API_KEY = from step 3
   - CLOUDINARY_API_SECRET = from step 3

## STEP 5 — Install and start the backend
Open Command Prompt (Windows key + R → type cmd → Enter)

Type these commands one at a time:

  cd C:\Projects\yealmaz\backend
  npm install
  npx prisma generate
  npx prisma db push
  npm run dev

You should see:
  🦷 Ye-Almaz Dental Lab API
  🚀 Server running on http://localhost:5000

## STEP 6 — Create your admin account (one time only)
Open your browser and go to:
  http://localhost:5000/api/auth/seed-admin

You'll see a response with:
  Email: admin@yealmaz.com
  Password: YeAlmaz@Admin2024

Save these! Then log in and change the password.

## STEP 7 — Test it's working
Go to: http://localhost:5000
You should see: { "lab": "Ye-Almaz Dental Lab", "status": "API running" }

🎉 YOUR BACKEND IS RUNNING!

---
Come back here and tell me "backend is running"
and we'll move on to building the dashboards.
