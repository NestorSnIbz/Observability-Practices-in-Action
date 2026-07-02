# observability-demo

Ejemplo mínimo de observabilidad con **Prometheus** y **Grafana**, usando dos servicios en Node.js que dependen entre sí (`products-api` → `inventory-service`), tal como pasaría en un sistema real de microservicios.

Código de acompañamiento del artículo: *"Observabilidad en la práctica: cómo saber qué está pasando dentro de tu API antes de que te llame un usuario enojado"*.

## Correrlo localmente

```bash
docker compose up --build
```

- `products-api`: http://localhost:3000
- `inventory-service`: http://localhost:3002
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (usuario `admin`, password `admin`)

Generá tráfico para ver algo en los dashboards:

```bash
for i in $(seq 1 50); do curl http://localhost:3000/products/$i; done
```

## Estructura

```
server.js              # API de productos (métricas + logs)
inventory-service.js   # Servicio dependiente, simula latencia y fallas
docker-compose.yml      # Levanta ambos servicios + Prometheus + Grafana
prometheus.yml          # Config de scraping
alert_rules.yml         # Reglas de alerta (latencia, tasa de error, dependencia caída)
.github/workflows/ci.yml  # CI: chequeo de sintaxis + smoke test de los servicios levantados
```

## CI

Cada push a `main` corre un workflow que:
1. Valida la sintaxis del código.
2. Levanta los servicios con `docker compose`.
3. Verifica que `/metrics` expone las métricas esperadas.
4. Genera tráfico real y confirma que los contadores suben.

## Licencia

MIT
