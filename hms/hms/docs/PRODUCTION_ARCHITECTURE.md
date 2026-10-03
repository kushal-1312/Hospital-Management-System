# MedCare One production architecture

## Target operating model

The application is designed so the web tier and API tier can scale horizontally while shared coordination remains in MongoDB and Redis.

```text
Users
  -> CDN / WAF / TLS termination
    -> Nginx web replicas
    -> API load balancer
      -> Express API replicas
        -> MongoDB replica set / managed cluster
        -> Redis HA (cache, queues, Socket.io pub/sub)
      -> BullMQ worker replicas
    -> Metrics, logs, traces, alerts, SIEM
```

Do not expose MongoDB or Redis ports publicly. The ports in `docker-compose.yml` are for local development only.

## Scale characteristics

- API processes are stateless apart from short-lived in-process access tokens on the browser side.
- Refresh credentials are opaque, hashed in MongoDB, rotated on use, and stored in HttpOnly cookies.
- WebSocket events fan out through Redis, allowing multiple API replicas.
- expensive exports, reports, and emails run in BullMQ worker processes.
- read-heavy dashboard and command-center aggregations use short Redis cache windows.
- MongoDB pool sizing is configurable per replica. Total connections across all replicas must remain below the cluster limit.
- common patient, appointment, finance, inventory, and audit queries have compound indexes.

Capacity must be proven with production-shaped load tests. Start with at least two API replicas and two worker replicas across separate failure zones. Measure p50/p95/p99 latency, event-loop utilization, database CPU/IO, connection saturation, Redis memory, queue lag, error rate, and WebSocket counts.

Suggested initial service objectives:

- API availability: 99.95% monthly
- p95 read latency: under 300 ms at the service boundary
- p95 write latency: under 600 ms at the service boundary
- critical notification delivery: under 5 seconds when dependencies are healthy
- recovery point objective: 5 minutes or better
- recovery time objective: 30 minutes or better

These are starting targets, not guarantees.

## Security and privacy controls

Implemented in the repository:

- RBAC for administrator, doctor, nurse, and staff roles
- short-lived JWT access tokens and rotating opaque refresh credentials
- HttpOnly, Secure, SameSite refresh cookies in production
- TOTP two-factor authentication and account lockout
- strict origin allow-list, Helmet security headers, request size/time limits, and NoSQL operator rejection
- rate limiting, hashed secrets, generic login failures, and password-reset token hashing
- tamper-evident centralized audit events without request-body/PHI logging
- minimum secret validation at startup
- dependency audit gates in CI

Required deployment controls:

- TLS everywhere, including MongoDB, Redis, SMTP, backups, and service-to-service links
- a managed secret store/KMS; never put production secrets in Compose files or source control
- encryption at rest with managed key rotation
- SSO through an approved identity provider and phishing-resistant MFA for privileged users
- WAF, DDoS protection, private networking, egress restrictions, and administrator IP/device policy
- centralized immutable log retention and SIEM alerting
- malware scanning and object storage for uploaded clinical files
- regular dependency updates, SAST/DAST, penetration tests, and threat-model reviews
- formal break-glass access with reason capture and post-event review
- data classification, retention, deletion, consent, and subject-access processes

## Reliability controls

- Use a multi-zone managed MongoDB replica set with point-in-time recovery.
- Use Redis HA with eviction policy chosen separately for cache and durable queue workloads. For strict isolation, operate separate Redis clusters for cache, queues, and Socket.io pub/sub.
- Configure readiness probes on `/health/ready` and liveness probes on `/health/live`.
- Scrape `/metrics` using the configured bearer token.
- Alert on HTTP 5xx rate, p95 latency, event-loop lag, Mongo/Redis readiness, queue failures and age, low pharmacy stock, critical patient events, and audit-write failures.
- Exercise restore procedures and dependency failover at least quarterly.
- Use canary or blue/green rollout with automated rollback tied to service-level indicators.

## Clinical-production roadmap

The following capabilities are intentionally not represented as complete:

1. Organization/facility/department tenancy with row-level isolation and scoped identifiers.
2. Bed, ward, emergency, OT, nursing task, lab, radiology, and discharge workflows.
3. FHIR R4/R5 APIs, HL7 v2 interfaces, DICOM/PACS integration, and terminology services (SNOMED CT, ICD, LOINC, RxNorm/local equivalents).
4. Medication reconciliation, allergy/interaction checks, e-prescribing, barcode medication administration, and controlled-drug workflows.
5. Consent, legal hold, record amendment, provenance, and jurisdiction-specific retention.
6. Offline/downtime procedures and reconciliation after recovery.
7. Multi-region disaster recovery and tested traffic failover.
8. Accessibility audit to WCAG 2.2 AA and multilingual/localization workflows.
9. Clinical safety case, human-factors review, validation evidence, and applicable regulatory certification.

Implement tenancy and facility isolation before onboarding unrelated hospitals. Do not treat role checks alone as tenant isolation.

## Release gates

A release is eligible for staging only when:

- backend tests, frontend typecheck/build, and production dependency audits pass;
- database migrations/index changes have a reviewed rollout and rollback plan;
- load and soak tests meet the agreed service objectives;
- backup restore has been proven in the target environment;
- audit events, metrics, logs, dashboards, and paging routes are verified;
- privacy, security, and clinical owners approve the release.
