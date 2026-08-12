import { randomUUID } from 'node:crypto';

/**
 * Ephemeral store for pending destructive moderation actions awaiting
 * confirmation. Entries auto-expire so the map never grows unbounded.
 */
const store = new Map();
const TTL_MS = 2 * 60 * 1000; // 2 minutes to confirm

/** Save a pending action, returns a short token to embed in a button id. */
export function stash(data) {
  const token = randomUUID().slice(0, 8);
  const timeout = setTimeout(() => store.delete(token), TTL_MS);
  if (typeof timeout.unref === 'function') timeout.unref();
  store.set(token, { data, timeout });
  return token;
}

/** Retrieve + remove a pending action. Returns null if missing/expired. */
export function consume(token) {
  const entry = store.get(token);
  if (!entry) return null;
  clearTimeout(entry.timeout);
  store.delete(token);
  return entry.data;
}
