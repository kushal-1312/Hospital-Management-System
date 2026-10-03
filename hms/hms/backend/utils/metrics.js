const client = require('@prometheus-io/client');

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'medcare_' });

const httpRequests = new client.Counter({
  name: 'medcare_http_requests_total',
  help: 'Total HTTP requests handled by the API',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry]
});

const httpDuration = new client.Histogram({
  name: 'medcare_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry]
});

module.exports = { registry, httpRequests, httpDuration };
