import test from 'node:test';
import assert from 'node:assert/strict';
import { OperatingHoursService } from '../src/native/schedule.js';

function createMockScheduleDb() {
  const hoursMap = new Map();
  const schedules = [];

  return {
    hoursMap,
    schedules,
    async query(sql, params) {
      const lower = sql.toLowerCase().replace(/\s+/g, ' ');

      if (lower.includes('from guild_operating_hours where guild_id = $1')) {
        const row = hoursMap.get(params[0]);
        return { rows: row ? [row] : [] };
      }

      if (lower.includes('insert into guild_operating_hours')) {
        const row = {
          guild_id: params[0],
          enabled: params[1],
          days: params[2],
          start_time: params[3],
          end_time: params[4],
          timezone: params[5],
          out_of_office_message: params[6],
        };
        hoursMap.set(params[0], row);
        return { rows: [row] };
      }

      if (lower.includes('insert into channel_schedules')) {
        const row = {
          id: `sch_${schedules.length + 1}`,
          guild_id: params[0],
          channel_id: params[1],
          lock_time: params[2],
          unlock_time: params[3],
          timezone: params[4],
          enabled: true,
        };
        schedules.push(row);
        return { rows: [row] };
      }

      if (lower.includes('from channel_schedules where guild_id = $1')) {
        const rows = schedules.filter((s) => s.guild_id === params[0]);
        return { rows };
      }

      if (lower.includes('insert into audit')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  };
}

const mockCtx = {
  guildId: 'g1',
  actor: { id: 'u1', authenticated: true, guildMember: true, isOwner: true, permissions: ['ManageGuild', 'ManageChannels'] },
  autonomy: 'operator',
  approval: { status: 'approved' },
};

test('OperatingHoursService: getOperatingHours returns default if unconfigured', async () => {
  const db = createMockScheduleDb();
  const svc = new OperatingHoursService({ db });

  const hours = await svc.getOperatingHours('g1');
  assert.equal(hours.enabled, true);
  assert.equal(hours.startTime, '09:00');
  assert.equal(hours.endTime, '22:00');
});

test('OperatingHoursService: setOperatingHours persists custom shift hours', async () => {
  const db = createMockScheduleDb();
  const svc = new OperatingHoursService({ db });

  const updated = await svc.setOperatingHours(
    'g1',
    {
      enabled: true,
      days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      startTime: '08:00',
      endTime: '20:00',
      timezone: 'UTC',
      outOfOfficeMessage: 'Staff away until morning.',
    },
    mockCtx
  );

  assert.equal(updated.startTime, '08:00');
  assert.equal(updated.endTime, '20:00');
  assert.equal(updated.days.length, 5);
  assert.equal(updated.outOfOfficeMessage, 'Staff away until morning.');
});
