import test from 'node:test';
import assert from 'node:assert/strict';
import { RobloxService } from '../src/native/roblox.js';

test('RobloxService: 70/30 fee calculation from target net Robux', () => {
  const svc = new RobloxService({ db: {} });

  // 1,000 Net Robux calculation (classic example from dossier)
  const calc1000 = svc.calculateFee(1000, true);
  assert.equal(calc1000.targetNet, 1000);
  assert.equal(calc1000.grossPrice, 1429); // Math.ceil(1000 / 0.7) = 1429
  assert.equal(calc1000.feeAmount, 429);
  assert.equal(calc1000.effectiveNet, 1000);
  assert.equal(calc1000.feePercentage, 30);

  // 500 Net Robux
  const calc500 = svc.calculateFee(500, true);
  assert.equal(calc500.targetNet, 500);
  assert.equal(calc500.grossPrice, 715); // Math.ceil(500 / 0.7) = 715
  assert.equal(calc500.effectiveNet, 500);

  // 100 Net Robux
  const calc100 = svc.calculateFee(100, true);
  assert.equal(calc100.targetNet, 100);
  assert.equal(calc100.grossPrice, 143); // Math.ceil(100 / 0.7) = 143
  assert.equal(calc100.effectiveNet, 100);
});

test('RobloxService: 70/30 fee calculation from gross listing price', () => {
  const svc = new RobloxService({ db: {} });

  const calcGross = svc.calculateFee(1429, false);
  assert.equal(calcGross.grossPrice, 1429);
  assert.equal(calcGross.effectiveNet, 1000); // Math.floor(1429 * 0.7) = 1000
  assert.equal(calcGross.feeAmount, 429);
});

test('RobloxService: lookupUser parses Roblox API payload', async () => {
  const mockFetch = async (url, opts) => {
    return {
      ok: true,
      json: async () => ({
        data: [
          {
            id: 123456789,
            name: 'Builderman',
            displayName: 'Builderman_Official',
            hasVerifiedBadge: true,
          },
        ],
      }),
    };
  };

  const svc = new RobloxService({ db: {}, fetchFn: mockFetch });
  const user = await svc.lookupUser('Builderman');

  assert.equal(user.id, 123456789);
  assert.equal(user.name, 'Builderman');
  assert.equal(user.displayName, 'Builderman_Official');
  assert.equal(user.hasVerifiedBadge, true);
});
