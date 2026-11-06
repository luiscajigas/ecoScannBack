const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildLastSevenDays, calculateStreaks, createStatsService } = require('../services/stats');

describe('calculateStreaks', () => {
  const TODAY = '2026-11-06';

  test('without scans both streaks are zero', () => {
    assert.deepEqual(calculateStreaks([], TODAY), { current: 0, longest: 0 });
  });

  test('counts consecutive days up to today', () => {
    assert.deepEqual(calculateStreaks(['2026-11-04', '2026-11-05', '2026-11-06'], TODAY), { current: 3, longest: 3 });
  });

  test('a streak that ended yesterday is still alive', () => {
    assert.deepEqual(calculateStreaks(['2026-11-04', '2026-11-05'], TODAY), { current: 2, longest: 2 });
  });

  test('a streak that ended two days ago is lost, but the longest remains', () => {
    assert.deepEqual(calculateStreaks(['2026-11-03', '2026-11-04'], TODAY), { current: 0, longest: 2 });
  });

  test('a gap restarts the current streak', () => {
    const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-11-05', '2026-11-06'];
    assert.deepEqual(calculateStreaks(dates, TODAY), { current: 2, longest: 3 });
  });

  test('works across month and year boundaries', () => {
    assert.equal(calculateStreaks(['2026-12-31', '2027-01-01'], '2027-01-01').current, 2);
  });
});

describe('buildLastSevenDays', () => {
  test('returns seven days, oldest first, filling empty days with zero', () => {
    const days = buildLastSevenDays([{ date: '2026-11-06', count: 2 }, { date: '2026-11-01', count: 1 }, { date: '2026-10-01', count: 9 }], '2026-11-06');
    assert.deepEqual(days.map((d) => d.date), ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    assert.deepEqual(days.map((d) => d.count), [0, 1, 0, 0, 0, 0, 2]);
  });
});

describe('createStatsService', () => {
  const scans = {
    getStatsData: async () => ({
      byCategory: [{ categoryKey: 'plastic', count: 3 }],
      daily: [{ date: '2026-11-05', count: 1 }, { date: '2026-11-06', count: 2 }]
    })
  };
  // 03:00 UTC on the 6th is still the 5th in Bogota
  const service = createStatsService({ scans, now: () => new Date('2026-11-06T03:00:00Z') });

  test('adds up the totals', async () => {
    const stats = await service.getForUser(1, 'UTC');
    assert.equal(stats.totalScans, 3);
    assert.equal(stats.currentStreak, 2);
  });

  test('the day depends on the time zone', async () => {
    const utc = await service.getForUser(1, 'UTC');
    const bogota = await service.getForUser(1, 'America/Bogota');
    assert.equal(utc.lastSevenDays.at(-1).date, '2026-11-06');
    assert.equal(bogota.lastSevenDays.at(-1).date, '2026-11-05');
  });

  test('an unknown time zone is an invalid-data error', async () => {
    await assert.rejects(service.getForUser(1, 'Mars/Olympus'), (err) => err.code === 'INVALID_DATA');
  });
});
