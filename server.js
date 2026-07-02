// server.js


const express = require('express');
const client = require('prom-client');
const pinoHttp = require('pino-http');
const http = require('http');
const https = require('https');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const INVENTORY_URL = process.env.INVENTORY_URL || 'http://localhost:3002';

const logger = pinoHttp();
app.use(logger);

function getLocalInventoryPort(url) {
  try {
    const parsed = new URL(url);
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'));
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') return null;
    return port;
  } catch {
    return null;
  }
}

function fetchJson(url) {
  if (typeof fetch === 'function') {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(async (res) => {
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      return { ok: res.ok, status: res.status, data };
    });
  }

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    const req = transport.request(
      {
        method: 'GET',
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        headers: { Accept: 'application/json' },
      },
      (res) => {
        res.setEncoding('utf8');
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          let data = null;
          try {
            data = body ? JSON.parse(body) : null;
          } catch {
            data = null;
          }
          const status = res.statusCode || 0;
          resolve({ ok: status >= 200 && status < 300, status, data });
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

const localInventoryPort = getLocalInventoryPort(INVENTORY_URL);
if (process.env.AUTO_START_INVENTORY !== 'false' && localInventoryPort != null) {
  try {
    const { startInventoryService } = require('./inventory-service');
    startInventoryService({ port: localInventoryPort });
  } catch (err) {
    console.error('No se pudo iniciar el servicio de inventario embebido', err);
  }
}

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
app.get('/', (req, res) =>
  res.json({
    service: 'products-api',
    routes: { health: '/health', metrics: '/metrics', product: '/products/:id' },
  })
);

app.get('/products/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const stockRes = await fetchJson(`${INVENTORY_URL}/stock/${id}`);

    if (!stockRes.ok) {
      inventoryFailures.inc();
      req.log.warn({ productId: id, status: stockRes.status }, 'inventory call returned error');
      return res.status(502).json({ error: 'no se pudo consultar el stock' });
    }

    res.json({ id, name: 'Producto de ejemplo', price: 29.9, stock: stockRes.data?.stock });
  } catch (err) {
    inventoryFailures.inc();
    req.log.error({ err, productId: id }, 'fallo inesperado consultando inventario');
    res.status(502).json({ error: 'no se pudo consultar el stock' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// --- Endpoint que Prometheus scrapea ---
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(PORT, () => console.log(`Products API en http://localhost:${PORT}`));
