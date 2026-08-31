/* Trivia Quiz Weekly Race — shared config.
   Tweak these values and redeploy; nothing else needs to change. */
window.QUIZ_CONFIG = {
  // Stuff AM Quiz is 15 questions. Change if the quiz format changes.
  MAX_SCORE: 15,

  // Work teams — used before 1 Sep 2026 and for archived months.
  TEAMS: [
    'Customer Success',
    'Development',
    'Implementation',
    'Internal',
    'Marketing',
    'Product',
    'Sales'
  ],

  // Quiz-team league starts at 00:00 NZ on this date.
  QUIZ_TEAMS_START: '2026-09-01',

  PLAYERS: [
    'Timba Le',
    'Kathy Kok',
    'Michael Holmes',
    'Henry Zhang',
    'Di Wang',
    'Andrew Wise',
    'Matt Purcell',
    'Gareth Simpson',
    'Aidan Watson',
    'Rebecca Nunnery',
    'Dave Hewett',
    'Chris Jennings',
    'Chris Saunders',
    'Ella Stensness',
    'Mark Janssens',
    'Philippa Evans',
    'Nathan Jones',
    'Abigael Robertson',
    'Sabrina Huang'
  ],

  // No two of these can share a monthly quiz team.
  RINGERS: [
    'Michael Holmes',
    'Kathy Kok',
    'Aidan Watson',
    'Gareth Simpson'
  ],

  // Assigned when a team skips naming on the 1st.
  FUNNY_TEAM_NAMES: [
    'The Concrete Evidence',
    'Structurally Sound',
    'Quiznatra & the Rat Pack',
    'The Ledger Legends',
    'Footing the Bill',
    'The Compound Interest',
    'Load-Bearing Wall of Fame',
    'Balance Sheet Bandits',
    "The Foreman's Finest",
    'Overhead & Overqualified',
    'Quiz in My Pants',
    'The Factual Furies',
    'Alexa, Play Despacito',
    "Wait, That's Illegal?",
    'Sudden Onset Genius',
    'The Nervous Buzzer System',
    'We Googled It First',
    'Trivial Pursuits (Legal Team)',
    'Two Truths and a Guess',
    'The Confidently Incorrect',
    'Couch Potatoes United',
    'Squatters of the Couch',
    'The Couch Locks',
    'Best Seat, Worst Answers',
    'Reserved for Champions',
    'Lord of the Ringers',
    'The Nacho Average Team',
    'Sherlock Homies',
    'Quizzy Rascals',
    'Pun Intended'
  ],

  // Opening hours, NZ time. 0 = Sunday ... 6 = Saturday. null = closed.
  HOURS: {
    0: null,
    1: { open: 8, close: 17 },
    2: { open: 8, close: 17 },
    3: { open: 8, close: 17 },
    4: { open: 8, close: 17 },
    5: { open: 8, close: 15 },
    6: null
  },

  TIMEZONE: 'Pacific/Auckland',

  // On the week's reveal day the individual board stays blurred until this
  // NZ time. Reveal day is Friday, or Thursday (last open weekday) when
  // Friday is a public holiday.
  FRIDAY_REVEAL: { hour: 15, minute: 25 },

  // Best N of 5 days count toward the weekly total.
  // With MAX_SCORE 15 that puts a perfect week at 60.
  BEST_N_DAYS: 4,

  // Max screenshot size after client-side compression (bytes).
  MAX_IMAGE_BYTES: 400 * 1024,

  // How sure the screenshot checker has to be before a score can be logged.
  SHOT_MIN_CONFIDENCE: 60
};

window.QUIZ_CONFIG.WEEK_MAX = window.QUIZ_CONFIG.MAX_SCORE * window.QUIZ_CONFIG.BEST_N_DAYS;

// Local preview only — vercel dest / localhost pretends it's 1 Sep so you can
// click through quiz teams, naming day, and the new form. Production is unchanged.
if (typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname)) {
  window.QUIZ_CONFIG.DEV_DATE_KEY = '2026-09-01';
}
