// @ts-check
const { errors } = require('../errors');

const DAY_MS = 24 * 60 * 60 * 1000;
const CHART_DAYS = 7;

/**
 * @typedef {import('../types/contract').components['schemas']['UserStats']} UserStats
 * @typedef {ReturnType<import('../repositories/scans').createScanRepository>} ScanRepository
 */

/** @param {string} date YYYY-MM-DD */
const toDayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

/** @param {number} dayNumber */
const toDate = (dayNumber) => new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);

/**
 * Today's date in a time zone. Throws an API error if the zone does not exist.
 * @param {string} timeZone
 * @param {Date} now
 * @returns {string} YYYY-MM-DD
 */
function todayIn(timeZone, now) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    throw errors.invalidData();
  }
}

/**
 * The current streak survives until the end of today: a user who scanned
 * yesterday but not yet today has not lost it.
 * @param {string[]} dates Dates with scans, oldest first, without repeats.
 * @param {string} today
 * @returns {{ current: number, longest: number }}
 */
function calculateStreaks(dates, today) {
  const days = dates.map(toDayNumber);
  const todayNumber = toDayNumber(today);

  let longest = 0;
  let run = 0;
  days.forEach((day, index) => {
    run = index > 0 && day === days[index - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  });

  const last = days[days.length - 1];
  const isAlive = last === todayNumber || last === todayNumber - 1;
  return { current: isAlive ? run : 0, longest };
}

/**
 * @param {{ date: string, count: number }[]} daily
 * @param {string} today
 * @returns {{ date: string, count: number }[]} The last seven days, oldest first, including empty days.
 */
function buildLastSevenDays(daily, today) {
  const counts = new Map(daily.map(({ date, count }) => [date, count]));
  const todayNumber = toDayNumber(today);
  return Array.from({ length: CHART_DAYS }, (_, index) => {
    const date = toDate(todayNumber - (CHART_DAYS - 1 - index));
    return { date, count: counts.get(date) ?? 0 };
  });
}

/** @param {{ scans: ScanRepository, now?: () => Date }} dependencies */
function createStatsService({ scans, now = () => new Date() }) {
  return {
    /**
     * @param {number} userId
     * @param {string} timeZone
     * @returns {Promise<UserStats>}
     */
    async getForUser(userId, timeZone) {
      const today = todayIn(timeZone, now());
      const { byCategory, daily } = await scans.getStatsData(userId, timeZone);
      const { current, longest } = calculateStreaks(daily.map((day) => day.date), today);

      return {
        totalScans: daily.reduce((total, day) => total + day.count, 0),
        currentStreak: current,
        longestStreak: longest,
        byCategory,
        lastSevenDays: buildLastSevenDays(daily, today)
      };
    }
  };
}

module.exports = { createStatsService, calculateStreaks, buildLastSevenDays };
