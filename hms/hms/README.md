# MedCare One HMS 3.0

MedCare One is a full-stack hospital operations platform for patient administration, appointments, billing, pharmacy, staff, security, real-time notifications, analytics, and executive command-center visibility.

## What changed in 3.0

- React 19, TypeScript 7, and Vite 8 frontend foundation
- Route-level code splitting and a responsive live Care Command Center
- Typed API/domain contracts with incremental TypeScript migration support
- Short-lived access tokens held only in memory
- Rotating refresh tokens delivered through secure HttpOnly cookies
- Two-factor authentication, lockout controls, CSRF protection for cookie refresh, RBAC, and strict production configuration validation
- Tamper-evident, append-only operational audit events
- Correlation IDs, structured request telemetry, Prometheus metrics, liveness, and readiness endpoints
- Express 5, MongoDB connection pooling, additional workload indexes, and concurrency-safe document numbering
- Redis cache, BullMQ background workers, and the Socket.io Redis adapter for horizontal scaling
- Graceful shutdown and production HTTP timeout controls
- Node.js 24 LTS container images and hardened Nginx asset delivery
- Clean production dependency audits for both applications

## Local development

Requirements: Node.js 24+, MongoDB, and Redis.

```bash
# API
cd backend
copy .env.example .env
npm install
npm run seed
npm run dev

# Web app (second terminal)
cd frontend
npm install
npm run dev

# Background workers (third terminal)
cd backend
npm run worker
```

The web app runs at `http://localhost:3000` and proxies API/WebSocket traffic to `http://localhost:5000`.

Demo password: `Admin@1234`

- `admin@hms.com`
- `doctor1@hms.com`
- `nurse1@hms.com`
- `staff1@hms.com`

## Verification

```bash
cd backend
npm test
npm audit --omit=dev

cd ../frontend
npm run build
npm audit --omit=dev
```

## Operations endpoints

- `GET /health/live` — process liveness
- `GET /health/ready` — dependency-aware readiness
- `GET /metrics` — Prometheus scrape endpoint; requires `METRICS_TOKEN` in production
- `GET /api/operations/command-center` — role-aware hospital operating picture
- `GET /api/operations/audit-trail` — administrator-only audit explorer API

Every response includes `X-Request-ID`. Send the same header from an upstream gateway to correlate a request across services.

## Production topology

Run the frontend behind a CDN/load balancer, at least two stateless API replicas, and an independently scaled worker pool. Use a managed MongoDB replica set and managed Redis with authentication, TLS, backups, alerting, and multi-zone failover. Socket.io uses Redis pub/sub, so connected users can receive the same events regardless of the API replica they reached.

See [PRODUCTION_ARCHITECTURE.md](./docs/PRODUCTION_ARCHITECTURE.md) for the scale model, security controls, deployment gates, and the remaining roadmap required before clinical production use.

## Important

This repository is an engineering foundation, not a certified medical device or a complete compliance program. A real deployment still requires a jurisdiction-specific privacy/security assessment, clinical safety validation, disaster-recovery exercises, penetration testing, data-retention policy, and hospital integration testing.
