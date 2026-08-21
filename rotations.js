// Defines the four clock-based rotations plus the on-request one, and works out,
// for any given moment, which rotation is live and exactly where in the playlist
// a listener joining right now should be dropped into - so everyone hears the same song
// at the same position, like a real radio station.

function nowIST() {
  // IST is UTC+5:30, no daylight saving
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 60 * 60 * 1000);
}

function getActiveRotationId(rotations) {
  if (!rotations || rotations.length === 0) return null;
  const hour = nowIST().getHours();
  for (const r of rotations) {
    if (r.startHour === null || r.startHour === undefined) continue; // on-request is never "active" automatically
    if (r.startHour < r.endHour) {
      if (hour >= r.startHour && hour < r.endHour) return r.id;
    } else {
      // wraps past midnight, e.g. 22 -> 5
      if (hour >= r.startHour || hour < r.endHour) return r.id;
    }
  }
  return rotations[0].id;
}

// Given a rotation's ordered songs (with duration in seconds) and a reference epoch,
// figure out which song is "live" right now and how many seconds into it we are.
// Reference epoch is fixed (server start time) so the position is deterministic and
// consistent across all listeners without needing a persistent running clock in memory.
const SERVER_EPOCH_MS = Date.now();

function getLivePosition(songs) {
  const playable = songs.filter((s) => s.duration && s.duration > 0);
  if (playable.length === 0) return null;

  const totalDuration = playable.reduce((sum, s) => sum + s.duration, 0);
  const elapsedSinceEpoch = Math.floor((Date.now() - SERVER_EPOCH_MS) / 1000);
  let position = elapsedSinceEpoch % totalDuration;

  for (const song of playable) {
    if (position < song.duration) {
      return { song, offsetSeconds: position };
    }
    position -= song.duration;
  }
  return { song: playable[0], offsetSeconds: 0 };
}

module.exports = { getActiveRotationId, getLivePosition, nowIST };
