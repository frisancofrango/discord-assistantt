import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigurationError, redactSecrets } from '../src/foundation/config.js';

test('configuration has safe development defaults', () => {
  const config = loadConfig({ NODE_ENV: 'test' });
  assert.equal(config.http.port, 3000);
  assert.equal(config.requireDependencies, false);
  assert.equal(config.database.ssl, false);
});
test('production requires a Discord token', () => assert.throws(() => loadConfig({ NODE_ENV: 'production' }), ConfigurationError));
test('production requires dependencies by default', () => assert.equal(loadConfig({ NODE_ENV: 'production', DISCORD_TOKEN: 'test-token' }).requireDependencies, true));
test('invalid ports fail validation', () => assert.throws(() => loadConfig({ NODE_ENV: 'test', HTTP_PORT: '0' }), ConfigurationError));
test('redaction recursively removes credentials', () => {
  const output = redactSecrets({ token: 'a', nested: { password: 'b', safe: 'yes' }, authorization: 'Bearer x' });
  assert.deepEqual(output, { token: '[REDACTED]', nested: { password: '[REDACTED]', safe: 'yes' }, authorization: '[REDACTED]' });
});
