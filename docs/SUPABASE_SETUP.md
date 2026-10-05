# Supabase Integration & Setup Guide

This project has been migrated from MongoDB to **Supabase** using the official `@supabase/supabase-js` client and Supabase PostgreSQL tables.

---

## 🚀 Quick Setup (3 Steps)

### Step 1: Create a Supabase Project
1. Log in to [Supabase](https://supabase.com).
2. Click **New Project**, choose your organization, and name your project (e.g. `medcare-hms`).
3. Set a strong database password and select a region closest to you.

---

### Step 2: Run the Database Schema
1. In your Supabase project dashboard, open the **SQL Editor** from the left navigation bar.
2. Click **+ New query**.
3. Open the schema file located in this repository at:
   ```
   backend/supabase/schema.sql
   ```
4. Copy the entire contents of `backend/supabase/schema.sql`, paste it into the SQL Editor, and click **Run**.
5. You should see a success message (`Success. No rows returned`). All 10 tables (`users`, `patients`, `appointments`, `medicines`, `dispensings`, `invoices`, `audit_events`, `notifications`, `suppliers`, `sequences`), indexes, and functions are now created.

---

### Step 3: Configure Environment Variables
1. In your Supabase Dashboard, go to **Project Settings** (gear icon) -> **API**.
2. Find the following keys:
   - **Project URL** (e.g., `https://xyzcompany.supabase.co`)
   - **`anon` `public` key**
   - **`service_role` `secret` key** (Click reveal)
3. Open `backend/.env` in your local project and update the Supabase section:
   ```env
   # ── Supabase Database ───────────────────────────────────────
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJh...your-service-role-key...
   SUPABASE_ANON_KEY=eyJh...your-anon-key...
   ```

---

## 🌱 Seed Initial Demo Data

Once your credentials are added to `backend/.env`, run the seeder script from the `backend` folder:

```bash
cd backend
npm run seed
```

This populates your Supabase database with:
- **Admin:** `admin@hms.com` (password: `Admin@1234`)
- **Doctors:** `doctor1@hms.com`, `doctor2@hms.com` (password: `Admin@1234`)
- **Nurse:** `nurse1@hms.com` (password: `Admin@1234`)
- **Staff:** `staff1@hms.com` (password: `Admin@1234`)
- Demo patients with complete medical history and assigned doctors
- Demo appointments for today and tomorrow

To also seed pharmacy stock:
```bash
npm run seed:pharmacy
```

---

## 🏃 Running the Application

Start the backend:
```bash
cd backend
npm run dev
```

The server will log:
```
[info]: ✅ Supabase connected successfully
[info]: MedCare One API v3.0.0 listening on 5000 [development]
```

You can verify server and database health at:
`http://localhost:5000/health`
