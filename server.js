// server.js
// API de productos, instrumentada con métricas (Prometheus) y logs estructurados (pino).
// Depende del inventory-service para resolver el stock de cada producto, así que su
// latencia y su tasa de error dependen en parte de un servicio externo.

const express = require('express');
const client = require('prom-client');
const pinoHttp = require('pino-http');

const app = express();
const PORT = 3000;
const INVENTORY_URL = process.env.INVENTORY_URL || 'http://localhost:3002';

const logger = pinoHttp();
app.use(logger);

// --- Métricas de Prometheus ---
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total de requests HTTP recibidas',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duración de las requests HTTP en segundos',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const activeRequests = new client.Gauge({
  name: 'http_active_requests',
  help: 'Requests activas en este momento',
  registers: [register],
});

// Métrica específica de negocio: cuántas veces falló la llamada al inventario
const inventoryFailures = new client.Counter({
  name: 'inventory_call_failures_total',
  help: 'Total de fallas al llamar al servicio de inventario',
  registers: [register],
});

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  activeRequests.inc();

  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    httpRequestsTotal.inc(labels);
    end(labels);
    activeRequests.dec();
  });

  next();
});

// --- Endpoint de negocio ---
app.get('/products/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const stockRes = await fetch(`${INVENTORY_URL}/stock/${id}`);

    if (!stockRes.ok) {
      inventoryFailures.inc();
      req.log.warn({ productId: id, status: stockRes.status }, 'inventory call returned error');
      return res.status(502).json({ error: 'no se pudo consultar el stock' });
    }

    const stock = await stockRes.json();
    res.json({ id, name: 'Producto de ejemplo', price: 29.9, stock: stock.stock });
  } catch (err) {
    inventoryFailures.inc();
    req.log.error({ err, productId: id }, 'fallo inesperado consultando inventario');
    res.status(500).json({ error: 'error interno' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// --- Endpoint que Prometheus scrapea ---
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(PORT, () => console.log(`Products API en http://localhost:${PORT}`));
