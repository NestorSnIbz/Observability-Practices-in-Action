# observability-demo

Minimal observability example using **Prometheus** and **Grafana**, with two Node.js services that depend on each other (`products-api` → `inventory-service`), similar to a real microservices system.

This is the companion code for the article: *"Observability in Practice: Understanding What’s Happening Inside Your API Before an Angry User Calls You"*.

## Run locally

```bash
docker compose up --build
```

- `products-api`: http://localhost:3000
- `inventory-service`: http://localhost:3002
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (usuario `admin`, password `admin`)

## Generate traffic

```bash
for i in $(seq 1 50); do curl http://localhost:3000/products/$i; done
```

## Project structure

```
server.js                 # Products API (metrics + logs)
inventory-service.js      # Dependent service, simulates latency and failures
docker-compose.yml        # Spins up services + Prometheus + Grafana
prometheus.yml            # Prometheus scraping configuration
alert_rules.yml           # Alert rules (latency, error rate, dependency failure)
.github/workflows/ci.yml  # CI pipeline: syntax check + smoke tests
```

## CI

Validates code syntax.
Builds and starts services using Docker Compose.
Verifies /metrics endpoints are exposed correctly.
Generates traffic and confirms metrics are being recorded.
