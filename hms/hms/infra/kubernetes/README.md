# Kubernetes reference deployment

`medcare.yaml` is a production-oriented starting point for the stateless application tiers. It intentionally does not install MongoDB or Redis; use managed, multi-zone services and inject their endpoints through `medcare-secrets`.

Before applying it:

1. Replace the three `ghcr.io/your-org/...` image references with immutable image digests.
2. Replace `hms.example-hospital.com` and the TLS secret name.
3. Create `medcare-secrets` from a managed external secret provider. It must contain `mongodb-uri`, `redis-host`, `redis-password`, `jwt-secret`, `jwt-refresh-secret`, `audit-hmac-key`, `metrics-token`, `smtp-host`, `smtp-user`, and `smtp-pass`.
4. Review resource requests/limits using measured load-test data.
5. Configure cluster monitoring to scrape the API on port 5000 with the metrics token.
6. Apply organization-specific network, admission, image-signing, and backup policies.

```bash
kubectl apply -f medcare.yaml
kubectl -n medcare rollout status deployment/medcare-api
kubectl -n medcare rollout status deployment/medcare-web
kubectl -n medcare rollout status deployment/medcare-worker
```

The API HPA scales from 3 to 20 replicas. Tune this only after a load test establishes per-pod throughput and database/Redis connection budgets.
