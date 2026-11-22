import { logger } from '../utils/logger.js';

const clients = new Set();
let heartbeat = null;

function ensureHeartbeat() {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    for (const res of clients) {
      try {
        res.write(': ping\n\n');
      } catch {
        clients.delete(res);
      }
    }
  }, 25_000);
  heartbeat.unref?.();
}

export function addRealtimeClient(req, res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const client = { res, connectedAt: new Date().toISOString() };
  clients.add(res);
  ensureHeartbeat();

  res.write(
    `event: ready\ndata: ${JSON.stringify({ connectedAt: client.connectedAt, clients: clients.size })}\n\n`,
  );

  const cleanup = () => {
    clients.delete(res);
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);
  res.on('finish', cleanup);
}

export function broadcast(event, payload = {}) {
  if (!clients.size) return;
  const frame = `event: ${event}\ndata: ${JSON.stringify({
    ...payload,
    emittedAt: new Date().toISOString(),
  })}\n\n`;

  for (const res of clients) {
    try {
      res.write(frame);
    } catch (error) {
      clients.delete(res);
      logger.warn('Realtime client disconnected', { message: error.message });
    }
  }
}

export function realtimeStats() {
  return { clients: clients.size };
}
