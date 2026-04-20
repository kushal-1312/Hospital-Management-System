# 🏥 MedCare HMS — Hospital Management System

A production-ready, full-stack Hospital Management System built with React, Node.js/Express, and MongoDB.

---

## 📁 Project Structure

```
hms/
├── backend/
│   ├── config/
│   │   └── database.js          # MongoDB connection with retry logic
│   ├── controllers/
│   │   ├── authController.js    # Login, register, refresh token, logout
│   │   ├── patientController.js # Full CRUD + medical history + CSV export
│   │   ├── appointmentController.js  # Scheduling with double-booking check
│   │   ├── userController.js    # Staff management
│   │   └── dashboardController.js    # Aggregated stats + charts data
│   ├── middleware/
│   │   ├── auth.js              # JWT verify + RBAC + audit log
│   │   ├── errorHandler.js      # Global error handler + custom AppError
│   │   └── validation.js        # express-validator rules per route
│   ├── models/
│   │   ├── User.js              # Users with bcrypt password hashing
│   │   ├── Patient.js           # Patients with medical history sub-docs
│   │   └── Appointment.js       # Appointments with double-booking static
│   ├── routes/
│   │   ├── auth.js
│   │   ├── patients.js
│   │   ├── appointments.js
│   │   ├── users.js
│   │   └── dashboard.js
│   ├── services/
│   │   └── authService.js       # Token generation + sendTokenResponse
│   ├── utils/
│   │   ├── logger.js            # Winston logger (console + file)
│   │   └── seeder.js            # Demo data seeder
│   ├── logs/                    # Auto-created at runtime
│   ├── uploads/                 # File uploads (auto-created)
│   ├── server.js                # Express app entry point
│   ├── package.json
│   └── .env.example
│
└── frontend/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── components/
    │   │   ├── auth/
    │   │   │   ├── Login.js          # Login page with demo buttons
    │   │   │   └── ProtectedRoute.js # Route guard with role check
    │   │   ├── dashboard/
    │   │   │   └── Dashboard.js      # Stats, charts, tables
    │   │   ├── patients/
    │   │   │   ├── PatientList.js    # Paginated list + search + filters
    │   │   │   ├── PatientDetail.js  # Full record view + history
    │   │   │   └── PatientForm.js    # Create/edit modal (tabbed)
    │   │   ├── appointments/
    │   │   │   └── Appointments.js   # List + scheduling form + slots
    │   │   ├── staff/
    │   │   │   └── Staff.js          # Staff list + add modal (admin)
    │   │   └── shared/
    │   │       ├── Sidebar.js        # Role-filtered navigation
    │   │       └── Topbar.js         # Page title + date
    │   ├── context/
    │   │   └── AuthContext.js        # Global auth state + login/logout
    │   ├── services/
    │   │   └── api.js                # Axios instance + auto token refresh
    │   ├── styles/
    │   │   └── global.css            # Design system + all component styles
    │   ├── App.js                    # Router + layout
    │   └── index.js
    ├── package.json
    └── .env.example
```

---

## ✨ Features

### Security
- JWT access tokens (15 min) + refresh tokens (7 days)
- bcrypt password hashing (cost factor 12)
- Role-based access control (Admin / Doctor / Nurse / Staff)
- Rate limiting (100 req/15min globally, 10/15min for login)
- MongoDB injection sanitization via `express-mongo-sanitize`
- Helmet.js security headers
- CORS with whitelist
- Input validation with `express-validator`
- Audit logging on every patient record change

### Patient Management
- Full CRUD with soft validation
- Tabbed form: Basic Info / Contact / Medical
- Medical history timeline with doctor attribution
- Allergy tracking
- Status tracking (Active, Stable, Critical, Discharged, Under Observation)
- CSV export (admin only)
- Assigned doctor with access control (doctors see only their patients)

### Appointments
- Double-booking prevention (server-side conflict detection)
- Visual time slot picker (30-min slots, 08:00–18:00)
- Past-date prevention
- Status workflow: pending → confirmed → completed / cancelled / no-show
- Type: consultation, follow-up, emergency, routine-checkup, procedure
- Inline status update from list view

### Dashboard
- 6 stat cards: Total Patients, Today's Appointments, Critical Cases, Doctors, Pending, Completed
- Area chart: Monthly patient admissions (6 months)
- Bar chart: Monthly appointments (6 months)
- Recent patients table
- Today's schedule table

### Staff Management (Admin)
- Paginated staff list with search
- Role and department filters
- Add new staff via secure registration
- Activate/deactivate accounts (soft delete)

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- MongoDB (local or MongoDB Atlas)
- npm or yarn

### 1. Clone and install

```bash
# Backend
cd hms/backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure environment

```bash
# Backend
cd hms/backend
cp .env.example .env
# Edit .env — set MONGODB_URI and strong JWT secrets
```

```bash
# Frontend
cd hms/frontend
cp .env.example .env
# Leave REACT_APP_API_URL empty for local dev (uses proxy)
```

### 3. Seed the database

```bash
cd hms/backend
npm run seed
```

Output:
```
✓ Seeded 6 users
✓ Seeded 5 patients
✓ Seeded 4 appointments

🎉 Database seeded successfully!

Demo credentials:
  Admin:  admin@hms.com    / Admin@1234
  Doctor: doctor1@hms.com  / Admin@1234
  Nurse:  nurse1@hms.com   / Admin@1234
  Staff:  staff1@hms.com   / Admin@1234
```

### 4. Start the servers

```bash
# Terminal 1 — Backend (port 5000)
cd hms/backend
npm run dev

# Terminal 2 — Frontend (port 3000)
cd hms/frontend
npm start
```

Open: http://localhost:3000

---

## 🌐 API Reference

### Auth
| Method | Route                    | Access  | Description              |
|--------|--------------------------|---------|--------------------------|
| POST   | /api/auth/login          | Public  | Login, returns tokens    |
| POST   | /api/auth/refresh        | Public  | Refresh access token     |
| POST   | /api/auth/logout         | Private | Invalidate refresh token |
| GET    | /api/auth/me             | Private | Get current user         |
| POST   | /api/auth/register       | Admin   | Create new user          |
| PUT    | /api/auth/change-password| Private | Change own password      |

### Patients
| Method | Route                        | Access               | Description           |
|--------|------------------------------|----------------------|-----------------------|
| GET    | /api/patients                | All                  | List with pagination  |
| POST   | /api/patients                | Admin/Doctor/Nurse   | Create patient        |
| GET    | /api/patients/:id            | All                  | Get single patient    |
| PUT    | /api/patients/:id            | Admin/Doctor/Nurse   | Update patient        |
| DELETE | /api/patients/:id            | Admin                | Delete patient        |
| POST   | /api/patients/:id/history    | Admin/Doctor         | Add medical history   |
| GET    | /api/patients/stats          | Admin/Doctor         | Patient statistics    |
| GET    | /api/patients/export         | Admin                | Export CSV            |

### Appointments
| Method | Route                      | Access  | Description             |
|--------|----------------------------|---------|-------------------------|
| GET    | /api/appointments          | All     | List with filters       |
| POST   | /api/appointments          | All     | Schedule appointment    |
| GET    | /api/appointments/:id      | All     | Get single              |
| PUT    | /api/appointments/:id      | All     | Update / change status  |
| DELETE | /api/appointments/:id      | Admin   | Delete                  |
| GET    | /api/appointments/slots    | All     | Available time slots    |
| GET    | /api/appointments/stats    | All     | Stats by status/type    |

### Users/Staff
| Method | Route              | Access       | Description        |
|--------|--------------------|--------------|--------------------|
| GET    | /api/users         | Admin        | List all staff     |
| GET    | /api/users/:id     | Admin/Self   | Get user           |
| PUT    | /api/users/:id     | Admin/Self   | Update user        |
| DELETE | /api/users/:id     | Admin        | Deactivate user    |
| GET    | /api/users/doctors | All          | List active doctors|
| GET    | /api/users/stats   | Admin        | Staff statistics   |

### Dashboard
| Method | Route                  | Access | Description         |
|--------|------------------------|--------|---------------------|
| GET    | /api/dashboard/stats   | All    | Full dashboard data |

---

## ☁️ Deployment

### Option A: Render (Recommended — Free Tier)

**Backend:**
1. Create a new **Web Service** on [render.com](https://render.com)
2. Connect your GitHub repo
3. Set:
   - Root Directory: `hms/backend`
   - Build Command: `npm install`
   - Start Command: `node server.js`
4. Add Environment Variables (from `.env.example`)
5. Use [MongoDB Atlas](https://cloud.mongodb.com) for `MONGODB_URI`

**Frontend:**
1. Create a new **Static Site** on Render
2. Set:
   - Root Directory: `hms/frontend`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `build`
3. Add env var: `REACT_APP_API_URL=https://your-backend.onrender.com/api`

---

### Option B: AWS (EC2 + MongoDB Atlas)

```bash
# On your EC2 instance (Ubuntu 22.04)

# 1. Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Install PM2
sudo npm install -g pm2

# 3. Clone repo and install
git clone <your-repo>
cd hms/backend && npm install
cd ../frontend && npm install && npm run build

# 4. Configure environment
cp .env.example .env && nano .env

# 5. Start backend with PM2
cd ../backend
pm2 start server.js --name hms-backend
pm2 save
pm2 startup

# 6. Serve frontend with Nginx
sudo apt install nginx
sudo cp build/* /var/www/html/
```

**Nginx config** (`/etc/nginx/sites-available/default`):
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    root /var/www/html;
    index index.html;
    try_files $uri /index.html;

    # Backend API proxy
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

### Option C: Vercel (Frontend) + Railway (Backend)

**Frontend → Vercel:**
```bash
cd hms/frontend
npx vercel --prod
# Set REACT_APP_API_URL to your Railway backend URL
```

**Backend → Railway:**
1. Push to GitHub
2. New project on [railway.app](https://railway.app) → Deploy from GitHub
3. Add MongoDB plugin or use Atlas
4. Set all env vars from `.env.example`

---

## 🔒 Security Checklist for Production

- [ ] Change all `.env` secrets (never use defaults)
- [ ] Set `NODE_ENV=production`
- [ ] Use strong, random 64-char JWT secrets
- [ ] Enable HTTPS (SSL certificate via Let's Encrypt)
- [ ] Set `CLIENT_URL` to your actual frontend domain
- [ ] Set up MongoDB Atlas with IP allowlist
- [ ] Enable MongoDB Atlas backups
- [ ] Review rate limiting values for your traffic
- [ ] Set up log monitoring (Winston logs to file)
- [ ] Remove seed script from production or protect it

---

## 🧪 Role Permission Matrix

| Feature                   | Admin | Doctor | Nurse | Staff |
|---------------------------|:-----:|:------:|:-----:|:-----:|
| View Dashboard            | ✅    | ✅     | ✅    | ✅    |
| View All Patients         | ✅    | Own    | ✅    | ✅    |
| Add Patient               | ✅    | ✅     | ✅    | ❌    |
| Edit Patient              | ✅    | ✅     | Limited| ❌  |
| Delete Patient            | ✅    | ❌     | ❌    | ❌    |
| Add Medical History       | ✅    | ✅     | ❌    | ❌    |
| Export CSV                | ✅    | ❌     | ❌    | ❌    |
| View Appointments         | ✅    | Own    | ✅    | ✅    |
| Schedule Appointment      | ✅    | ✅     | ✅    | ✅    |
| Delete Appointment        | ✅    | ❌     | ❌    | ❌    |
| View Staff                | ✅    | ❌     | ❌    | ❌    |
| Add Staff                 | ✅    | ❌     | ❌    | ❌    |
| Register New Users        | ✅    | ❌     | ❌    | ❌    |

---

## 📝 License

MIT — free to use and modify for personal or commercial projects.
