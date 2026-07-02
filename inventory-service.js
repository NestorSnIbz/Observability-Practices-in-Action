// inventory-service.js


const express = require('express');
const client = require('prom-client');
const pinoHttp = require('pino-http');

const app = express();
const PORT = Number(process.env.INVENTORY_PORT || 3002);

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
  labelNames: ['status_code'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2],
  registers: [register],
});

app.use(pinoHttp());

app.get('/', (req, res) =>
  res.json({ service: 'inventory-service', routes: { metrics: '/metrics', stock: '/stock/:productId' } })
);

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

function startInventoryService({ port = PORT } = {}) {
  return app.listen(port, () => console.log(`Inventory service en http://localhost:${port}`));
}

if (require.main === module) {
  startInventoryService();
}

module.exports = { startInventoryService };
