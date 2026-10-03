# Deployment quick start

For local or evaluation deployment:

```bash
copy .env.example .env
docker compose up --build
```

Open `http://localhost:3010`. The Compose stack is intentionally a single-host development topology; do not use it as the production design for thousands of concurrent users.

For production, read:

- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [Production architecture](./docs/PRODUCTION_ARCHITECTURE.md)
- [Kubernetes deployment](./infra/kubernetes/README.md)
