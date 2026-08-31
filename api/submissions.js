/**
 * Trivia Quiz Weekly Race — submissions API
 *
 * Storage: Upstash Redis (formerly Vercel KV) via its REST API — no npm deps.
 * Set KV_REST_API_URL + KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL +
 * UPSTASH_REDIS_REST_TOKEN, and it just works. Without those env vars it falls
 * back to in-memory storage (data resets when the function goes cold).
 *
 * Score rows live in one Redis key; screenshots are stored separately so the
 * list never grows past Upstash's request-size limit.
 */

import '../holidays.js';
import { kvEnabled, readRows, writeRows, writeShot, deleteShot } from '../kv.js';
import { loadRoster, monthKeyFor, QuizTeams as T, overlayDevDate } from '../roster.js';

const { holidayOn } = globalThis.QUIZ_HOLIDAYS;

const ADMIN_KEY = process.env.ADMIN_KEY || '';

const HOURS = {
  0: null,
  1: { open: 8, close: 17 },
  2: { open: 8, close: 17 },
  3: { open: 8, close: 17 },
  4: { open: 8, close: 17 },
  5: { open: 8, close: 15 },
  6: null
};

const TEAMS = [
  'Customer Success',
  'Development',
  'Implementation',
  'Internal',
  'Marketing',
  'Product',
  'Sales'
];

const MAX_SCORE = 15;
const MAX_BODY_BYTES = 1.2 * 1024 * 1024;

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- time helpers (NZ time, server-side authority) ----------

function nzParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return overlayDevDate({
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    dow: weekdayMap[parts.weekday],
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  });
}

function windowState(now = new Date()) {
  const { dow, hour, minute, dateKey } = nzParts(now);
  const holiday = holidayOn(dateKey);
  if (holiday) return { open: false, reason: 'holiday', dateKey, holiday };
  const win = HOURS[dow];
  if (!win) return { open: false, reason: 'weekend', dateKey };
  const mins = hour * 60 + minute;
  if (mins < win.open * 60) return { open: false, reason: 'early', dateKey, win };
  if (mins >= win.close * 60) return { open: false, reason: 'late', dateKey, win };
  return { open: true, dateKey, win };
}

// Monday-based ISO-ish week key, derived from the NZ calendar date.
function weekKeyFor(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const shift = dow === 0 ? -6 : 1 - dow; // back to Monday
  dt.setUTCDate(dt.getUTCDate() + shift);
  return dt.toISOString().slice(0, 10);
}

const nameKey = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase();

// ---------- handler ----------

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      const rows = await readRows();
      const state = windowState();
      const quizOn = T.quizTeamsActive(state.dateKey);
      const roster = quizOn ? await loadRoster(monthKeyFor(state.dateKey), state.dateKey) : null;
      const light = rows.map(({ screenshot, ...rest }) => ({
        ...rest,
        hasScreenshot: Boolean(screenshot || rest.hasScreenshot)
      }));
      return res.status(200).json({
        submissions: light,
        window: state,
        storage: kvEnabled() ? 'kv' : 'memory',
        quizTeamsActive: quizOn,
        namingOpen: T.isNamingDay(state.dateKey),
        roster
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

      if (JSON.stringify(body).length > MAX_BODY_BYTES) {
        return res.status(413).json({ error: 'That screenshot is too big. Try a smaller crop.' });
      }

      const state = windowState();
      if (!state.open) {
        const msg =
          state.reason === 'holiday'
            ? `The form is closed for ${state.holiday}. Public holidays are a freebie — no score needed today.`
            : state.reason === 'weekend'
              ? "The form is closed at weekends — the race runs Monday to Friday."
              : state.reason === 'early'
                ? `Too keen! Submissions open at ${state.win.open}:00 NZ time.`
                : `Submissions closed at ${state.win.close}:00 NZ time today. Catch you tomorrow.`;
        return res.status(423).json({ error: msg });
      }

      const name = String(body.name || '').trim().replace(/\s+/g, ' ');
      const score = Number(body.score);
      const quizOn = T.quizTeamsActive(state.dateKey);

      if (quizOn) {
        if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
          return res.status(400).json({ error: `Score must be a whole number from 0 to ${MAX_SCORE}.` });
        }
        if (!body.screenshot || typeof body.screenshot !== 'string') {
          return res.status(400).json({ error: 'A screenshot of your score is required.' });
        }

        const roster = await loadRoster(monthKeyFor(state.dateKey), state.dateKey);
        if (!roster) return res.status(400).json({ error: 'Quiz teams are not ready yet. Refresh and try again.' });

        const rows = await readRows();
        const scoredToday = new Set(
          rows.filter((r) => r.dateKey === state.dateKey).map((r) => nameKey(r.name))
        );
        const group = T.validatePlayGroup(roster, name, body.teammates, scoredToday);
        if (!group.ok) {
          const status = group.error && group.error.includes('already has a score') ? 409 : 400;
          return res.status(status).json({ error: group.error });
        }

        const submittedAt = new Date().toISOString();
        const groupId = newId();
        const created = [];
        for (const person of group.members) {
          const row = {
            id: newId(),
            name: person,
            team: group.displayName,
            teamId: group.team.id,
            groupId,
            playedWith: group.members.filter((p) => nameKey(p) !== nameKey(person)),
            score,
            dateKey: state.dateKey,
            weekKey: weekKeyFor(state.dateKey),
            submittedAt,
            shotConfidence: Number.isFinite(body.shotConfidence) ? body.shotConfidence : null,
            shotRead: Number.isFinite(body.shotRead) ? body.shotRead : null,
            hasScreenshot: true
          };
          await writeShot(row.id, body.screenshot);
          rows.push(row);
          created.push(row);
        }
        await writeRows(rows);
        return res.status(201).json({ ok: true, submissions: created, submission: created[0] });
      }

      const team = String(body.team || '').trim();

      if (name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
      if (!TEAMS.includes(team)) return res.status(400).json({ error: 'Please pick your work team.' });
      if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
        return res.status(400).json({ error: `Score must be a whole number from 0 to ${MAX_SCORE}.` });
      }
      if (!body.screenshot || typeof body.screenshot !== 'string') {
        return res.status(400).json({ error: 'A screenshot of your score is required.' });
      }

      const rows = await readRows();
      const key = nameKey(name);
      const already = rows.find((r) => nameKey(r.name) === key && r.dateKey === state.dateKey);
      if (already) {
        return res.status(409).json({
          error: `${name} already has a score logged for today. One quiz per person per day!`
        });
      }

      const row = {
        id: newId(),
        name,
        team,
        score,
        dateKey: state.dateKey,
        weekKey: weekKeyFor(state.dateKey),
        submittedAt: new Date().toISOString(),
        shotConfidence: Number.isFinite(body.shotConfidence) ? body.shotConfidence : null,
        shotRead: Number.isFinite(body.shotRead) ? body.shotRead : null,
        hasScreenshot: true
      };

      await writeShot(row.id, body.screenshot);
      rows.push(row);
      await writeRows(rows);

      return res.status(201).json({ ok: true, submission: row });
    }

    if (req.method === 'DELETE') {
      if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) {
        return res.status(401).json({ error: 'Not authorised.' });
      }
      const id = req.query?.id;
      if (!id) return res.status(400).json({ error: 'Missing id.' });
      const rows = await readRows();
      const next = rows.filter((r) => r.id !== id);
      await writeRows(next);
      if (next.length !== rows.length) await deleteShot(id);
      return res.status(200).json({ ok: true, removed: rows.length - next.length });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error('submissions error', err);
    return res.status(500).json({ error: 'Something broke on our end. Try again in a moment.' });
  }
}
