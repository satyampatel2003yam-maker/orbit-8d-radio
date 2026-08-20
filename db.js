// Lightweight JSON-file "database". No native modules, works anywhere Node runs.
// For a bigger catalogue later, swap this file for a real DB without touching the routes much -
// every function here just needs to keep returning/accepting the same shapes.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function readDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const initial = { songs: [], rotationState: {} };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getAllSongs() {
  return readDB().songs;
}

function getSongsByRotation(rotationId) {
  return readDB().songs.filter((s) => s.rotation === rotationId);
}

function getSongById(id) {
  return readDB().songs.find((s) => s.id === id);
}

function addSong(song) {
  const data = readDB();
  data.songs.push(song);
  writeDB(data);
  return song;
}

function updateSong(id, updates) {
  const data = readDB();
  const idx = data.songs.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  data.songs[idx] = { ...data.songs[idx], ...updates };
  writeDB(data);
  return data.songs[idx];
}

function deleteSong(id) {
  const data = readDB();
  const before = data.songs.length;
  data.songs = data.songs.filter((s) => s.id !== id);
  writeDB(data);
  return data.songs.length < before;
}

function reorderRotation(rotationId, orderedIds) {
  const data = readDB();
  // Assign an "order" field within that rotation based on the new sequence
  orderedIds.forEach((id, index) => {
    const song = data.songs.find((s) => s.id === id && s.rotation === rotationId);
    if (song) song.order = index;
  });
  writeDB(data);
  return data.songs.filter((s) => s.rotation === rotationId).sort((a, b) => a.order - b.order);
}

module.exports = {
  getAllSongs,
  getSongsByRotation,
  getSongById,
  addSong,
  updateSong,
  deleteSong,
  reorderRotation,
};
