/* ==========================================================================
   Trivia Quiz Weekly Race — monthly quiz teams

   Seeded draw of 4–5 person teams, ringer handicap, day-1 naming, and the
   2–3 person daily play group. Shared with the API and the tests.
   ========================================================================== */

(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuizTeams = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
  'use strict';

  const CFG = root.QUIZ_CONFIG || {};

  const QUIZ_TEAMS_START = CFG.QUIZ_TEAMS_START || '2026-09-01';

  const PLAYERS = CFG.PLAYERS || [
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
  ];

  const RINGERS = CFG.RINGERS || [
    'Michael Holmes',
    'Kathy Kok',
    'Aidan Watson',
    'Gareth Simpson'
  ];

  const FUNNY_TEAM_NAMES = CFG.FUNNY_TEAM_NAMES || [
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
  ];

  const TEAM_SIZES = [5, 5, 5, 4];

  const NAME_ALIASES = CFG.NAME_ALIASES || { timba: 'Timba Le' };
  const nameKey = (s) => {
    const raw = String(s || '').trim().replace(/\s+/g, ' ');
    const mapped = NAME_ALIASES[raw.toLowerCase()] || raw;
    return mapped.replace(/\s+/g, ' ').toLowerCase();
  };

  function quizTeamsActive(dateKey) {
    return String(dateKey || '') >= QUIZ_TEAMS_START;
  }

  function quizMonth(monthKey) {
    return String(monthKey || '') >= QUIZ_TEAMS_START.slice(0, 7);
  }

  function isNamingDay(dateKey) {
    return quizTeamsActive(dateKey) && Number(String(dateKey).slice(8, 10)) === 1;
  }

  function isArchiveMonth(monthKey, dateKey) {
    return quizTeamsActive(dateKey) && !quizMonth(monthKey);
  }

  function canonicalPlayer(name, players) {
    const list = players || PLAYERS;
    const key = nameKey(name);
    return list.find((p) => nameKey(p) === key) || null;
  }

  function displayName(team) {
    if (!team) return '';
    if (team.name) return team.name;
    const n = String(team.id || '').replace(/^t/i, '');
    return n ? `Team ${n}` : 'Unnamed team';
  }

  function findPlayerTeam(roster, playerName) {
    if (!roster || !Array.isArray(roster.teams)) return null;
    const key = nameKey(playerName);
    return roster.teams.find((t) => (t.members || []).some((m) => nameKey(m) === key)) || null;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function rng() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedFromString(s) {
    let h = 2166136261;
    const str = String(s);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function generateTeams(monthKey, options) {
    const opts = options || {};
    const players = (opts.players || PLAYERS).slice();
    const sizes = opts.sizes || TEAM_SIZES;
    const rng = mulberry32(seedFromString(monthKey));

    const teams = sizes.map((size, i) => ({
      id: `t${i + 1}`,
      name: '',
      namedBy: null,
      namedAt: null,
      autoNamed: false,
      size,
      members: []
    }));

    const used = new Set();
    const takeNamed = (names) => {
      const out = [];
      for (const raw of names || []) {
        const p = canonicalPlayer(raw, players);
        if (!p || used.has(nameKey(p))) continue;
        used.add(nameKey(p));
        out.push(p);
      }
      return out;
    };

    const room = (ti) => sizes[ti] - teams[ti].members.length;

    const dealRoundRobin = (people) => {
      let cursor = 0;
      for (const p of people) {
        let placed = false;
        for (let k = 0; k < teams.length; k++) {
          const ti = (cursor + k) % teams.length;
          if (room(ti) > 0) {
            teams[ti].members.push(p);
            cursor = ti + 1;
            placed = true;
            break;
          }
        }
        if (!placed) teams[0].members.push(p);
      }
    };

    const tiers = opts.tiers;
    if (tiers && (tiers[1] || tiers[2] || tiers[3])) {
      const band1 = shuffle(takeNamed(tiers[1]), rng);
      const band2 = shuffle(takeNamed(tiers[2]), rng);
      const band3 = shuffle(
        takeNamed(tiers[3]).concat(players.filter((p) => !used.has(nameKey(p)))),
        rng
      );
      band1.forEach((p, i) => {
        if (teams[i]) teams[i].members.push(p);
      });
      dealRoundRobin(band2);
      dealRoundRobin(band3);
    } else {
      const ringers = opts.ringers || RINGERS;
      const ringerSet = new Set(ringers.map(nameKey));
      const ringerPlayers = shuffle(
        players.filter((p) => ringerSet.has(nameKey(p))),
        rng
      );
      const others = shuffle(
        players.filter((p) => !ringerSet.has(nameKey(p))),
        rng
      );
      ringerPlayers.forEach((p, i) => {
        if (teams[i]) teams[i].members.push(p);
      });
      dealRoundRobin(others);
    }

    for (const t of teams) {
      t.members.sort((a, b) => a.localeCompare(b));
    }

    return { monthKey, generatedAt: null, teams };
  }

  function applyFallbackNames(roster, dateKey, funnyNames) {
    if (!roster || !Array.isArray(roster.teams)) return { roster, changed: false };
    const day = Number(String(dateKey).slice(8, 10));
    if (!Number.isFinite(day) || day < 2) return { roster, changed: false };

    const names = funnyNames || FUNNY_TEAM_NAMES;
    const taken = new Set(roster.teams.filter((t) => t.name).map((t) => t.name));
    const rng = mulberry32(seedFromString(`${roster.monthKey}:fallback`));
    const pool = shuffle(
      names.filter((n) => !taken.has(n)),
      rng
    );

    let pi = 0;
    let changed = false;
    const teams = roster.teams.map((t) => {
      if (t.name) return t;
      changed = true;
      const name = pool[pi++] || `Team ${String(t.id).replace(/^t/i, '')}`;
      return {
        ...t,
        name,
        autoNamed: true,
        namedBy: null,
        namedAt: null
      };
    });

    return { roster: { ...roster, teams }, changed };
  }

  function fallbackDateKey(monthKey, todayDateKey) {
    if (String(todayDateKey).slice(0, 7) > monthKey) return `${monthKey}-28`;
    return todayDateKey;
  }

  function validateTeamName(raw) {
    const name = String(raw || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2) return { ok: false, error: 'Pick a team name of at least 2 characters.' };
    if (name.length > 40) return { ok: false, error: 'Keep the team name under 40 characters.' };
    return { ok: true, name };
  }

  function nameTeam(roster, teamId, memberName, rawName, players) {
    if (!roster || !Array.isArray(roster.teams)) {
      return { ok: false, error: 'No quiz teams this month.' };
    }
    const team = roster.teams.find((t) => t.id === teamId);
    if (!team) return { ok: false, error: 'Unknown team.' };
    if (team.name) {
      return { ok: false, error: 'That team already has a name.', status: 409 };
    }

    const v = validateTeamName(rawName);
    if (!v.ok) return v;

    const taken = roster.teams.some(
      (t) => t.id !== teamId && t.name && nameKey(t.name) === nameKey(v.name)
    );
    if (taken) return { ok: false, error: 'Another team already claimed that name.' };

    const namer = memberName ? canonicalPlayer(memberName, players) : null;
    const teams = roster.teams.map((t) =>
      t.id === teamId
        ? { ...t, name: v.name, namedBy: namer, namedAt: new Date().toISOString(), autoNamed: false }
        : t
    );
    return { ok: true, roster: { ...roster, teams }, name: v.name };
  }

  function validatePlayGroup(roster, submitterName, teammateNames, alreadyScoredKeys, players) {
    const submitter = canonicalPlayer(submitterName, players);
    if (!submitter) return { ok: false, error: 'Please pick your name from the list.' };

    const team = findPlayerTeam(roster, submitter);
    if (!team) return { ok: false, error: "You're not on a quiz team this month." };

    const rawMates = Array.isArray(teammateNames) ? teammateNames : [];
    const mates = rawMates.map((n) => canonicalPlayer(n, players));
    if (mates.some((m) => !m)) {
      return { ok: false, error: 'Please pick teammates from the list.' };
    }
    if (mates.length < 1 || mates.length > 2) {
      return { ok: false, error: 'Play with 1 or 2 teammates — never solo, never more than three of you.' };
    }

    const group = [submitter, ...mates];
    const keys = group.map(nameKey);
    if (new Set(keys).size !== keys.length) {
      return { ok: false, error: 'Each person can only appear once in the group.' };
    }

    const memberKeys = new Set((team.members || []).map(nameKey));
    const scored = alreadyScoredKeys || new Set();
    for (const person of group) {
      if (!memberKeys.has(nameKey(person))) {
        return { ok: false, error: `${person} is not on your quiz team.` };
      }
      if (scored.has(nameKey(person))) {
        return { ok: false, error: `${person} already has a score logged for today.` };
      }
    }

    return {
      ok: true,
      team,
      members: group,
      displayName: displayName(team)
    };
  }

  function availableTeammates(roster, playerName, alreadyScoredKeys) {
    const team = findPlayerTeam(roster, playerName);
    if (!team) return [];
    const self = nameKey(playerName);
    const scored = alreadyScoredKeys || new Set();
    return (team.members || []).filter((m) => {
      const k = nameKey(m);
      return k !== self && !scored.has(k);
    });
  }

  return {
    QUIZ_TEAMS_START,
    PLAYERS,
    RINGERS,
    FUNNY_TEAM_NAMES,
    TEAM_SIZES,
    nameKey,
    quizTeamsActive,
    quizMonth,
    isNamingDay,
    isArchiveMonth,
    canonicalPlayer,
    displayName,
    findPlayerTeam,
    generateTeams,
    applyFallbackNames,
    fallbackDateKey,
    validateTeamName,
    nameTeam,
    validatePlayGroup,
    availableTeammates
  };
});
