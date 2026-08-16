import { createServer } from 'node:http';

export function createWebhookServer({ commerce, logger, port = process.env.PORT || process.env.WEBHOOK_PORT || 3001 }) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
    }

    if (req.method === 'POST' && url.pathname.startsWith('/webhooks/payment/')) {
      const provider = url.pathname.split('/')[3];
      const chunks = [];

      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', async () => {
        const rawBody = Buffer.concat(chunks).toString('utf-8');
        const signature =
          req.headers['x-signature'] ||
          req.headers['stripe-signature'] ||
          req.headers['x-mercado-pago-signature'] ||
          '';
        const eventId = req.headers['x-event-id'] || `evt_${Date.now()}`;

        try {
          if (!commerce) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Commerce service not initialized' }));
          }

          const order = await commerce.webhook(provider, { rawBody, signature, eventId });
          logger?.info({ provider, orderId: order.id, status: order.status }, 'payment webhook processed successfully');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ status: 'success', orderId: order.id }));
        } catch (err) {
          logger?.warn({ err: err.message, provider }, 'payment webhook verification failed');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return {
    server,
    listen: () =>
      new Promise((resolve, reject) => {
        server.listen(port, () => {
          logger?.info({ port }, 'HTTP webhook ingress server listening');
          resolve(server);
        });
        server.on('error', reject);
      }),
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}
