import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import pino from 'pino';

const context = new AsyncLocalStorage();
const redact = ['discord.token', 'database.url', 'redis.url', '*.token', '*.password', '*.secret', '*.authorization', 'req.headers.authorization', 'req.headers.cookie'];

export function createLogger({ level = 'info', base = {} } = {}) {
  const root = pino({ level, base: { service: 'loop', ...base }, redact: { paths: redact, censor: '[REDACTED]' }, serializers: { err: pino.stdSerializers.err } });
  return new Proxy(root, { get(target, prop) {
    if (['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(prop)) {
      return (...args) => target[prop]({ ...context.getStore(), ...(typeof args[0] === 'object' ? args.shift() : {}) }, ...args);
    }
    return target[prop];
  }});
}

export function withCorrelation(correlationId, fn, fields = {}) {
  return context.run({ correlationId: correlationId || randomUUID(), ...fields }, fn);
}
export function correlationId() { return context.getStore()?.correlationId ?? null; }
