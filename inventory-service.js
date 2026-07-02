// inventory-service.js
// Servicio "de inventario" que simula una dependencia real: a veces lenta, a veces falla.
// El objetivo es mostrar cómo la observabilidad ayuda a detectar problemas que
// vienen de un servicio del que dependés, no solo de tu propio código.

const express = require('express');
const client = require('prom-client');
const pinoHttp = require('pino-http');

const app = express();
const PORT = 3002;

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'inventory_' });

const requestsTotal = new client.Counter({
  name: 'inventory_requests_total',
  help: 'Total de requests recibidas por el servicio de inventario',
  labelNames: ['status_code'],
  registers: [register],
});

const requestDuration = new client.Histogram({
  name: 'inventory_request_duration_seconds',
  help: 'Duración de las requests del servicio de inventario',
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2],
  registers: [register],
});

app.use(pinoHttp());

app.get('/stock/:productId', (req, res) => {
  const end = requestDuration.startTimer();

  // Simula degradación: 15% de las veces responde lento (500ms a 2s)
  const isSlow = Math.random() < 0.15;
  const delay = isSlow ? 500 + Math.random() * 1500 : Math.random() * 80;

  setTimeout(() => {
    // Simula fallas ocasionales de la dependencia (ej: timeout de base de datos)
    if (Math.random() < 0.08) {
      requestsTotal.inc({ status_code: 503 });
      end({ status_code: 503 });
      req.log.warn({ productId: req.params.productId }, 'inventory lookup failed');
      return res.status(503).json({ error: 'servicio de inventario no disponible' });
    }

    requestsTotal.inc({ status_code: 200 });
    end({ status_code: 200 });
    res.json({ productId: req.params.productId, stock: Math.floor(Math.random() * 50) });
  }, delay);
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(PORT, () => console.log(`Inventory service en http://localhost:${PORT}`));
