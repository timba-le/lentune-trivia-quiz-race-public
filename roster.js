/**
 * Monthly quiz-team roster: lazy create at/after 00:00 on the 1st NZ,
 * persist in KV, fill funny names from the 2nd.
 */

import './teams.js';
import { PLAYER_TIERS } from './player-tiers.js';
import { readRoster, writeRoster, writeRosterIfAbsent } from './kv.js';

const T = globalThis.QuizTeams;

export { T as QuizTeams };

export function monthKeyFor(dateKey) {
  return String(dateKey || '').slice(0, 7);
}

/** vercel dest only — production keeps the real NZ calendar. */
export function devDateKey() {
  if (process.env.QUIZ_DEV_DATE) return process.env.QUIZ_DEV_DATE;
  if (process.env.VERCEL_ENV === 'development') return '2026-09-01';
  return '';
}

export function overlayDevDate(parts) {
  const fake = devDateKey();
  if (!fake || !/^\d{4}-\d{2}-\d{2}$/.test(fake)) return parts;
  const [y, m, d] = fake.split('-').map(Number);
  return {
    ...parts,
    dateKey: fake,
    dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  };
}

export async function loadRoster(monthKey, dateKey) {
  if (!monthKey || !T.quizMonth(monthKey)) return null;
  const today = dateKey || '';
  const currentMonth = monthKeyFor(today);
  if (currentMonth && monthKey > currentMonth) return null;

  const fillDate = T.fallbackDateKey(monthKey, today || `${monthKey}-28`);

  let roster = await readRoster(monthKey);
  if (!roster) {
    if (!T.quizTeamsActive(today)) return null;
    const generated = T.generateTeams(monthKey, { tiers: PLAYER_TIERS, players: T.PLAYERS });
    generated.generatedAt = new Date().toISOString();
    await writeRosterIfAbsent(monthKey, generated);
    roster = (await readRoster(monthKey)) || generated;
  }

  const filled = T.applyFallbackNames(roster, fillDate);
  if (filled.changed) {
    const latest = (await readRoster(monthKey)) || roster;
    const merged = T.applyFallbackNames(latest, fillDate);
    if (merged.changed) {
      await writeRoster(monthKey, merged.roster);
      return merged.roster;
    }
    return latest;
  }
  return roster;
}

export async function saveNamedRoster(monthKey, roster) {
  return writeRoster(monthKey, roster);
}
