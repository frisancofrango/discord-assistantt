import { createServer } from 'node:http';

export function createHealthServer({ config, checks, logger, state }) {
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store');
    if (req.url === '/live') { res.statusCode = state.shuttingDown ? 503 : 200; return res.end(JSON.stringify({ status: state.shuttingDown ? 'stopping' : 'alive' })); }
    if (req.url === '/ready') {
      const results = {}; let ok = state.started && !state.shuttingDown;
      for (const [name, check] of Object.entries(checks)) { try { await check(); results[name] = 'ok'; } catch (err) { ok = false; results[name] = 'unavailable'; logger.warn({ err, dependency: name }, 'readiness check failed'); } }
      res.statusCode = ok ? 200 : 503; return res.end(JSON.stringify({ status: ok ? 'ready' : 'not_ready', dependencies: results }));
    }
    res.statusCode = 404; res.end(JSON.stringify({ error: 'not_found' }));
  });
  return { start: () => new Promise((resolve, reject) => server.once('error', reject).listen(config.http.port, config.http.host, () => { server.off('error', reject); logger.info({ address: server.address() }, 'health server listening'); resolve(); })), close: () => new Promise((resolve) => server.close(() => resolve())) };
}
