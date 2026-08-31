/* ==========================================================================
   NZ public holidays (observed dates)

   Sources: employment.govt.nz public holiday & anniversary dates.
   Includes nationwide holidays plus Canterbury Anniversary Day (Lentune's region).
   Dates are the observed weekdays when the office / form would be closed.
   ========================================================================== */

(function (root, factory) {
  const api = factory();
  // Always hang off globalThis so browser <script> and Node ESM side-effect
  // imports both see the same API (package.json is "type": "module").
  root.QUIZ_HOLIDAYS = api;
  if (typeof module === 'object' && module && module.exports) {
    try { module.exports = api; } catch (_) { /* ESM — ignore */ }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PUBLIC_HOLIDAYS = {
    // ---------- 2026 ----------
    '2026-01-01': "New Year's Day",
    '2026-01-02': "Day after New Year's Day",
    '2026-02-06': 'Waitangi Day',
    '2026-04-03': 'Good Friday',
    '2026-04-06': 'Easter Monday',
    '2026-04-27': 'Anzac Day', // observed (actual Sat 25 Apr)
    '2026-06-01': "King's Birthday",
    '2026-07-10': 'Matariki',
    '2026-10-26': 'Labour Day',
    '2026-11-13': 'Canterbury Anniversary Day',
    '2026-12-25': 'Christmas Day',
    '2026-12-28': 'Boxing Day', // observed (actual Sat 26 Dec)

    // ---------- 2027 ----------
    '2027-01-01': "New Year's Day",
    '2027-01-04': "Day after New Year's Day", // observed (actual Sat 2 Jan)
    '2027-02-08': 'Waitangi Day', // observed (actual Sat 6 Feb)
    '2027-03-26': 'Good Friday',
    '2027-03-29': 'Easter Monday',
    '2027-04-26': 'Anzac Day', // observed (actual Sun 25 Apr)
    '2027-06-07': "King's Birthday",
    '2027-06-25': 'Matariki',
    '2027-10-25': 'Labour Day',
    '2027-11-12': 'Canterbury Anniversary Day',
    '2027-12-27': 'Christmas Day', // observed (actual Sat 25 Dec)
    '2027-12-28': 'Boxing Day' // observed (actual Sun 26 Dec)
  };

  /** @returns {string|null} holiday name if dateKey is a closed public holiday */
  function holidayOn(dateKey) {
    return PUBLIC_HOLIDAYS[dateKey] || null;
  }

  function addDays(dateKey, days) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
  }

  /** Monday of the week a date falls in (Mon–Sun weeks). */
  function weekMonday(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = dt.getUTCDay(); // 0 Sun … 6 Sat
    dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
    return dt.toISOString().slice(0, 10);
  }

  /**
   * The day scores stay blurred until 3:25pm — normally Friday.
   * When Friday is a public holiday (short week), the reveal moves to the
   * last open weekday before it, almost always Thursday.
   */
  function revealDateKey(fromDateKey) {
    const monday = weekMonday(fromDateKey);
    const friday = addDays(monday, 4);
    if (!holidayOn(friday)) return friday;
    for (let back = 1; back <= 4; back++) {
      const candidate = addDays(friday, -back);
      if (!holidayOn(candidate)) return candidate;
    }
    return friday; // whole week off — keep Friday as the nominal day
  }

  /** Upcoming holidays from dateKey (inclusive), oldest first. */
  function upcomingHolidays(fromDateKey, limit = 8) {
    return Object.entries(PUBLIC_HOLIDAYS)
      .filter(([d]) => d >= fromDateKey)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([date, name]) => ({ date, name }));
  }

  return {
    PUBLIC_HOLIDAYS,
    holidayOn,
    upcomingHolidays,
    addDays,
    weekMonday,
    revealDateKey
  };
});
