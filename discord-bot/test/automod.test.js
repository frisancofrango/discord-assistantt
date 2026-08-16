import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomodService } from '../src/native/automod.js';

test('AutomodService: scanMessage detects phishing domains', () => {
  const svc = new AutomodService({ db: null });
  const result = svc.scanMessage('Hey check out this free discord nitro: https://discorcl.gift/nitro-drop');
  assert.equal(result.flagged, true);
  assert.equal(result.ruleType, 'anti_phishing');
});

test('AutomodService: scanMessage detects unauthorized discord invites', () => {
  const svc = new AutomodService({ db: null });
  const result = svc.scanMessage('Join our backup server discord.gg/supersecret');
  assert.equal(result.flagged, true);
  assert.equal(result.ruleType, 'anti_invites');
});

test('AutomodService: scanMessage detects mass mentions', () => {
  const svc = new AutomodService({ db: null });
  const result = svc.scanMessage('Attention <@111> <@222> <@333> <@444> <@555> raid time');
  assert.equal(result.flagged, true);
  assert.equal(result.ruleType, 'mass_mentions');
});

test('AutomodService: scanMessage permits clean normal chat', () => {
  const svc = new AutomodService({ db: null });
  const result = svc.scanMessage('hello everyone how is everyone doing today?');
  assert.equal(result.flagged, false);
});
