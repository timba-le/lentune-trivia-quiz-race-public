/**
 * Returns the stored screenshot for one submission, so the leaderboard can
 * link out to proof without shipping every image in the list payload.
 */

import { readShot } from '../kv.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: 'Missing id.' });

  try {
    const screenshot = await readShot(id);
    if (!screenshot) return res.status(404).json({ error: 'No screenshot found.' });

    const match = /^data:(image\/[a-zA-Z+]+);base64,(.*)$/s.exec(screenshot);
    if (!match) return res.status(415).json({ error: 'Stored image is not readable.' });

    const buffer = Buffer.from(match[2], 'base64');
    res.setHeader('Content-Type', match[1]);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('screenshot error', err);
    return res.status(500).json({ error: 'Could not load that screenshot.' });
  }
}
