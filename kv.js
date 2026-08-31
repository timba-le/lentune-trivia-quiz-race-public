/**
 * Upstash Redis helpers for the quiz API (server-only, no npm deps).
 *
 * Screenshots used to live inside one giant `quizrace:submissions` JSON blob.
 * That blob eventually exceeded Upstash's request size, so SET started 413ing
 * and nobody could log a score. Metadata stays in that key; each screenshot
 * is its own `quizrace:shot:{id}` value.
 */

const LIST_KEY = 'quizrace:submissions';
const shotKey = (id) => `quizrace:shot:${id}`;

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

globalThis.__quizStore = globalThis.__quizStore || {
  rows: [],
  shots: Object.create(null),
  rosters: Object.create(null)
};
if (!globalThis.__quizStore.rosters) globalThis.__quizStore.rosters = Object.create(null);

const rosterKey = (monthKey) => `quizrace:roster:${monthKey}`;

export const kvEnabled = () => Boolean(KV_URL && KV_TOKEN);

function stripShot(row) {
  const { screenshot, ...rest } = row;
  return {
    ...rest,
    hasScreenshot: Boolean(screenshot || rest.hasScreenshot)
  };
}

async function redis(cmd) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(cmd)
  });
  if (!res.ok) throw new Error(`KV ${cmd[0]} failed (${res.status})`);
  return res.json();
}

async function redisPipeline(commands) {
  const res = await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  if (!res.ok) throw new Error(`KV pipeline failed (${res.status})`);
  return res.json();
}

async function kvGetRaw(key) {
  const body = await redis(['GET', key]);
  if (!body || body.result == null) return null;
  if (typeof body.result !== 'string') return body.result;
  // Screenshots are data-URL strings — don't try to JSON.parse those.
  if (body.result.startsWith('data:')) return body.result;
  try {
    return JSON.parse(body.result);
  } catch {
    return body.result;
  }
}

async function kvSet(key, value) {
  await redis(['SET', key, typeof value === 'string' ? value : JSON.stringify(value)]);
}

async function kvSetNx(key, value) {
  const payload = typeof value === 'string' ? value : JSON.stringify(value);
  const body = await redis(['SET', key, payload, 'NX']);
  return body && body.result === 'OK';
}

async function kvDel(key) {
  await redis(['DEL', key]);
}

async function writeMeta(rows) {
  const slim = rows.map(stripShot);
  if (!kvEnabled()) {
    globalThis.__quizStore.rows = slim;
    return slim;
  }
  await kvSet(LIST_KEY, slim);
  return slim;
}

/**
 * Copy any inline screenshots out to their own keys, then rewrite the list
 * without image data. Safe to call on every read — it's a no-op once migrated.
 */
async function migrateInline(rows) {
  const pending = rows.filter((r) => r && r.screenshot && r.id);
  if (!pending.length) return rows.map(stripShot);

  const BATCH = 8;
  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH);
    await redisPipeline(chunk.map((r) => ['SET', shotKey(r.id), r.screenshot]));
  }
  return writeMeta(rows);
}

export async function readRows() {
  if (!kvEnabled()) return globalThis.__quizStore.rows.map(stripShot);
  const parsed = await kvGetRaw(LIST_KEY);
  const rows = Array.isArray(parsed) ? parsed : [];
  return migrateInline(rows);
}

export async function writeRows(rows) {
  return writeMeta(rows);
}

export async function readShot(id) {
  if (!id) return null;
  if (!kvEnabled()) return globalThis.__quizStore.shots[id] || null;

  const own = await kvGetRaw(shotKey(id));
  if (typeof own === 'string' && own) return own;

  // Legacy fallback: screenshot still sitting on the list row.
  const parsed = await kvGetRaw(LIST_KEY);
  const rows = Array.isArray(parsed) ? parsed : [];
  const row = rows.find((r) => r && r.id === id);
  return row && typeof row.screenshot === 'string' ? row.screenshot : null;
}

export async function writeShot(id, dataUrl) {
  if (!id || typeof dataUrl !== 'string') return;
  if (!kvEnabled()) {
    globalThis.__quizStore.shots[id] = dataUrl;
    return;
  }
  await kvSet(shotKey(id), dataUrl);
}

export async function deleteShot(id) {
  if (!id) return;
  if (!kvEnabled()) {
    delete globalThis.__quizStore.shots[id];
    return;
  }
  await kvDel(shotKey(id));
}

export async function readRoster(monthKey) {
  if (!monthKey) return null;
  if (!kvEnabled()) return globalThis.__quizStore.rosters[monthKey] || null;
  const parsed = await kvGetRaw(rosterKey(monthKey));
  return parsed && typeof parsed === 'object' ? parsed : null;
}

export async function writeRoster(monthKey, roster) {
  if (!monthKey || !roster) return roster;
  if (!kvEnabled()) {
    globalThis.__quizStore.rosters[monthKey] = roster;
    return roster;
  }
  await kvSet(rosterKey(monthKey), roster);
  return roster;
}

export async function writeRosterIfAbsent(monthKey, roster) {
  if (!monthKey || !roster) return false;
  if (!kvEnabled()) {
    if (globalThis.__quizStore.rosters[monthKey]) return false;
    globalThis.__quizStore.rosters[monthKey] = roster;
    return true;
  }
  return kvSetNx(rosterKey(monthKey), roster);
}
