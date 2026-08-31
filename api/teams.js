/**
 * Trivia Quiz Weekly Race — monthly quiz-team roster
 *
 * GET  /api/teams?month=YYYY-MM  — current (or requested) month's teams
 * POST /api/teams                — name a team, day 1 only
 */

import { loadRoster, monthKeyFor, saveNamedRoster, QuizTeams as T, overlayDevDate } from '../roster.js';

function nzDateKey(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const over = overlayDevDate({
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    dow: weekdayMap[parts.weekday]
  });
  return over.dateKey;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const dateKey = nzDateKey();
    const quizOn = T.quizTeamsActive(dateKey);

    if (req.method === 'GET') {
      const requested = String(req.query?.month || monthKeyFor(dateKey));
      const roster = quizOn ? await loadRoster(requested, dateKey) : null;
      return res.status(200).json({
        dateKey,
        quizTeamsActive: quizOn,
        namingOpen: T.isNamingDay(dateKey) && roster && requested === monthKeyFor(dateKey),
        roster
      });
    }

    if (req.method === 'POST') {
      if (!quizOn) {
        return res.status(400).json({ error: 'Quiz teams start on 1 September.' });
      }
      if (!T.isNamingDay(dateKey)) {
        return res.status(403).json({ error: 'Team names can only be picked on the 1st of the month.' });
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const monthKey = monthKeyFor(dateKey);
      const roster = await loadRoster(monthKey, dateKey);
      if (!roster) return res.status(400).json({ error: 'No quiz teams this month yet.' });

      const result = T.nameTeam(roster, body.teamId, body.memberName, body.name);
      if (!result.ok) {
        return res.status(result.status || 400).json({ error: result.error });
      }
      await saveNamedRoster(monthKey, result.roster);
      return res.status(200).json({ ok: true, roster: result.roster, name: result.name });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error('teams error', err);
    return res.status(500).json({ error: 'Something broke on our end. Try again in a moment.' });
  }
}
