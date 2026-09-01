/* ==========================================================================
   Trivia Quiz Weekly Race — scoring

   The league maths, kept away from the rendering so it can be tested on its
   own: best N of 5 days for individuals; monthly teams sum every daily score
   in the calendar month (no weekly drop).
   ========================================================================== */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuizScoring = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const DEFAULT_BEST_N_DAYS = 4;

  // Short names that should count as the same racer as a canonical player.
  const DEFAULT_NAME_ALIASES = { timba: 'Timba Le' };

  function nameAliases() {
    const cfg = (typeof globalThis !== 'undefined' && globalThis.QUIZ_CONFIG) || {};
    return cfg.NAME_ALIASES || DEFAULT_NAME_ALIASES;
  }

  function resolveName(s) {
    const raw = String(s || '').trim().replace(/\s+/g, ' ');
    const hit = nameAliases()[raw.toLowerCase()];
    return hit || raw;
  }

  const nameKey = (s) => resolveName(s).toLowerCase();

  const round1 = (n) => Math.round(n * 10) / 10;

  /** Monday of the week a date falls in, as YYYY-MM-DD. */
  function weekKeyFor(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = dt.getUTCDay();
    dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
    return dt.toISOString().slice(0, 10);
  }

  /** Monday index 0 … Friday index 4; -1 for weekend dates. */
  function dayIndex(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return dow >= 1 && dow <= 5 ? dow - 1 : -1;
  }

  const monthKeyFor = (dateKey) => dateKey.slice(0, 7);

  /**
   * Weekly individual scores: sum of the best N daily scores.
   * Once a fifth day is logged, the single lowest day is dropped automatically
   * and excluded from the weekly total.
   */
  function weeklyRows(submissions, weekKey, options) {
    const bestN = (options && options.bestNDays) || DEFAULT_BEST_N_DAYS;
    const byPlayer = new Map();

    for (const s of submissions) {
      if (s.weekKey !== weekKey) continue;
      const di = dayIndex(s.dateKey);
      if (di < 0) continue;
      const key = nameKey(s.name);
      if (!byPlayer.has(key)) {
        byPlayer.set(key, {
          name: resolveName(s.name),
          team: s.team,
          teamId: s.teamId || null,
          days: Array(5).fill(null)
        });
      }
      const p = byPlayer.get(key);
      p.name = resolveName(s.name);
      p.team = s.team; // latest submission wins for display
      if (s.teamId) p.teamId = s.teamId;
      p.days[di] = {
        score: s.score,
        id: s.id,
        dateKey: s.dateKey,
        hasScreenshot: s.hasScreenshot,
        submittedAt: s.submittedAt || null
      };
    }

    const rows = [];
    for (const p of byPlayer.values()) {
      const played = p.days
        .map((d, i) => (d ? { ...d, i } : null))
        .filter(Boolean);

      // Drop the lowest day(s) once more than bestN have been played.
      // Stable on ties: earliest weekday kept when scores match.
      const ranked = [...played].sort((a, b) => b.score - a.score || a.i - b.i);
      const counted = ranked.slice(0, bestN);
      const dropped = ranked.slice(bestN);
      const countedIdx = new Set(counted.map((d) => d.i));
      const droppedIdx = new Set(dropped.map((d) => d.i));

      // Earliest log this week — used to break total ties on the board.
      const times = played
        .map((d) => (d.submittedAt ? Date.parse(d.submittedAt) : NaN))
        .filter(Number.isFinite);
      const firstSubmittedAt = times.length ? Math.min(...times) : null;

      rows.push({
        ...p,
        countedIdx,
        droppedIdx,
        droppedScore: dropped.length ? dropped[0].score : null,
        daysPlayed: played.length,
        firstSubmittedAt,
        total: counted.reduce((sum, d) => sum + d.score, 0)
      });
    }

    // Equal totals: whoever submitted first stays above. Missing timestamps
    // fall through to the name so the order stays deterministic.
    rows.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (a.firstSubmittedAt != null && b.firstSubmittedAt != null) {
        if (a.firstSubmittedAt !== b.firstSubmittedAt) {
          return a.firstSubmittedAt - b.firstSubmittedAt;
        }
      } else if (a.firstSubmittedAt != null) return -1;
      else if (b.firstSubmittedAt != null) return 1;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }

  function workTeamRows(submissions, monthKey, teams) {
    const byTeam = new Map();
    for (const team of teams) {
      byTeam.set(team, { team, teamId: null, members: [], dayScores: [], players: new Set() });
    }

    for (const s of submissions) {
      if (monthKeyFor(s.dateKey) !== monthKey) continue;
      if (dayIndex(s.dateKey) < 0) continue;
      if (!byTeam.has(s.team)) {
        byTeam.set(s.team, { team: s.team, teamId: null, members: [], dayScores: [], players: new Set() });
      }
      const t = byTeam.get(s.team);
      t.dayScores.push(s.score);
      t.players.add(nameKey(s.name));
    }

    return Array.from(byTeam.values()).map((t) => ({
      team: t.team,
      teamId: t.teamId,
      members: t.members,
      players: t.players.size,
      entries: t.dayScores.length,
      total: t.dayScores.reduce((a, b) => a + b, 0)
    }));
  }

  function quizTeamRows(submissions, monthKey, roster) {
    const byTeam = new Map();
    for (const t of roster.teams || []) {
      const label = t.name || `Team ${String(t.id || '').replace(/^t/i, '')}`;
      byTeam.set(t.id, {
        team: label,
        teamId: t.id,
        members: t.members || [],
        dayScores: [],
        players: new Set()
      });
    }

    for (const s of submissions) {
      if (monthKeyFor(s.dateKey) !== monthKey) continue;
      if (dayIndex(s.dateKey) < 0) continue;
      const id = s.teamId;
      if (!id || !byTeam.has(id)) continue;
      const t = byTeam.get(id);
      t.dayScores.push(s.score);
      t.players.add(nameKey(s.name));
    }

    return Array.from(byTeam.values()).map((t) => ({
      team: t.team,
      teamId: t.teamId,
      members: t.members,
      players: t.players.size,
      entries: t.dayScores.length,
      total: t.dayScores.reduce((a, b) => a + b, 0)
    }));
  }

  /**
   * Team monthly score: sum of every daily score logged by members from
   * the 1st through the last day of the calendar month. The weekly individual
   * drop does not apply — every quiz day in the month counts toward the rally.
   *
   * From September 2026, pass options.roster to score by quiz team rather
   * than work team. Pre-September months still use work-team strings.
   */
  function teamRows(submissions, monthKey, options) {
    const opts = options || {};
    const startMonth = String(opts.quizTeamsStart || '2026-09-01').slice(0, 7);
    const useQuiz = monthKey >= startMonth && opts.roster && Array.isArray(opts.roster.teams);

    const rows = useQuiz
      ? quizTeamRows(submissions, monthKey, opts.roster)
      : workTeamRows(submissions, monthKey, opts.teams || []);

    rows.sort((a, b) => b.total - a.total || b.players - a.players || a.team.localeCompare(b.team));
    return rows;
  }

  return { nameKey, resolveName, round1, weekKeyFor, dayIndex, monthKeyFor, weeklyRows, teamRows };
});
