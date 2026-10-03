# MedCare One deployment guide

## Local container stack

1. Copy `.env.example` to `.env`.
2. Replace every placeholder secret with an independently generated random value.
3. Run `docker compose config` and review the resolved configuration.
4. Run `docker compose up --build`.
5. Open `http://localhost:3010` and verify `http://localhost:5000/health/ready`.

The local stack exposes MongoDB and Redis to the host for developer tooling. Never expose either port to a public network.

## Production prerequisites

- Node.js 24 LTS build environment
- managed multi-zone MongoDB with TLS and point-in-time recovery
- managed Redis with TLS and authentication
- container registry, Kubernetes 1.30+ or an equivalent managed container platform
- TLS certificate, WAF/load balancer, private service network, DNS, secret manager, centralized logs, metrics, and paging
- SMTP or transactional email provider with SPF, DKIM, and DMARC

## Required secrets

Generate independent values for `JWT_SECRET`, `JWT_REFRESH_SECRET`, `AUDIT_HMAC_KEY`, and `METRICS_TOKEN`. Store them in a managed secret store. Production startup fails when application secrets are absent, short, or left as placeholders.

Also configure `MONGODB_URI`, Redis credentials, SMTP credentials, `CLIENT_URL`, and the deployment-specific `BUILD_SHA`.

## Release sequence

1. Run backend tests and both production dependency audits.
2. Run the frontend typecheck and production build.
3. Build immutable backend and frontend images tagged with the source revision.
4. Scan images and generate an SBOM in the delivery platform.
5. Apply database indexes during a controlled pre-deployment step.
6. Deploy to staging and run integration, accessibility, security, load, and recovery checks.
7. Roll out to production with canary or blue/green traffic shifting.
8. Verify `/health/ready`, Prometheus metrics, queue lag, WebSocket connectivity, audit persistence, and key user journeys.
9. Roll back automatically when error rate or latency exceeds the agreed threshold.

The reference Kubernetes definitions are in `infra/kubernetes/medcare.yaml`. Replace image names, hosts, storage endpoints, and secret references before applying them.

## Production smoke checks

```bash
curl -fsS https://api.example-hospital.com/health/live
curl -fsS https://api.example-hospital.com/health/ready
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" https://api.example-hospital.com/metrics
```

Then validate sign-in with and without 2FA, token refresh, role boundaries, patient creation, appointment conflict prevention, billing, dispensing, real-time alerts, command-center updates, and audit events.

## Rollback

Keep at least two known-good image revisions. Application rollback must not reverse a destructive database migration. Use expand/migrate/contract schema changes so the old and new application versions can run simultaneously during rollout.
