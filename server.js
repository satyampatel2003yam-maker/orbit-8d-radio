require('dotenv').config();
const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { parseBuffer } = require('music-metadata');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const db = require('./db');
const { getActiveRotationId, getLivePosition } = require('./rotations');
const { requireAdmin } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Apply basic HTTP security headers
app.use(helmet({ contentSecurityPolicy: false }));

// Rate limiter for login route to prevent brute-force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  message: { error: 'Too many login attempts from this IP, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Global API rate limiter to prevent DDoS attacks
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 150, // Limit each IP to 150 requests per minute
  message: { error: 'Too many requests from this IP, please try again after a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

if (!process.env.JWT_SECRET || !process.env.ADMIN_PASSWORD_HASH) {
  console.warn(
    '\n[warning] .env is missing JWT_SECRET or ADMIN_PASSWORD_HASH.\n' +
    'Copy .env.example to .env, then run "npm run setup-admin" to generate your password hash.\n'
  );
}

// S3 Client configuration for Cloudflare R2
const s3Client = process.env.R2_ACCOUNT_ID ? new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
}) : null;

if (!s3Client) {
  console.warn('\n[warning] Cloudflare R2 env vars missing. Audio uploads will fail. See README.\n');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- File upload setup ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per track
  fileFilter: (req, file, cb) => {
    const okTypes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/ogg', 'audio/x-m4a'];
    if (okTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only audio files (mp3, wav, m4a, ogg) are allowed.'));
  },
});

// =====================================================
// PUBLIC ROUTES
// =====================================================

app.get('/api/rotations', async (req, res) => {
  const rotations = await db.getRotations();
  res.json(rotations);
});

app.get('/api/rotations/active', async (req, res) => {
  const rotations = await db.getRotations();
  res.json({ activeRotation: getActiveRotationId(rotations) });
});

app.get('/api/playlists', async (req, res) => {
  const playlists = await db.getPlaylists();
  res.json(playlists);
});

app.get('/api/songs', async (req, res) => {
  const { rotation } = req.query;
  let songs = rotation ? await db.getSongsByRotation(rotation) : await db.getAllSongs();
  songs = songs.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  res.json(songs);
});

app.get('/api/live/:rotationId', async (req, res) => {
  const rotationSongs = await db.getSongsByRotation(req.params.rotationId);
  const songs = rotationSongs
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const live = getLivePosition(songs);
  if (!live) return res.status(404).json({ error: 'No songs in this rotation yet.' });

  res.json({
    song: live.song,
    offsetSeconds: live.offsetSeconds,
    playlist: songs,
  });
});

// Track active listeners
const activeListeners = new Map();

app.get('/api/listeners', (req, res) => {
  const now = Date.now();
  const clientId = req.query.clientId || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  if (clientId) {
    activeListeners.set(clientId, now);
  }
  
  // Clean up inactive listeners (not seen in the last 35 seconds)
  for (const [key, timestamp] of activeListeners.entries()) {
    if (now - timestamp > 35000) {
      activeListeners.delete(key);
    }
  }
  
  res.json({ count: activeListeners.size });
});

// User Song Requests
app.post('/api/requests', apiLimiter, async (req, res) => {
  const { songName } = req.body;
  if (!songName || songName.trim().length === 0) {
    return res.status(400).json({ error: 'Song name is required.' });
  }
  if (songName.length > 100) {
    return res.status(400).json({ error: 'Song name is too long.' });
  }
  try {
    const request = await db.addRequest(songName.trim());
    res.status(201).json(request);
  } catch (err) {
    console.error('Error adding request:', err);
    res.status(500).json({ error: 'Failed to submit request.' });
  }
});

// =====================================================
// ADMIN AUTH
// =====================================================

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const validUsername = username === process.env.ADMIN_USERNAME;
  const validPassword = process.env.ADMIN_PASSWORD_HASH
    ? bcrypt.compareSync(password, process.env.ADMIN_PASSWORD_HASH)
    : false;

  if (!validUsername || !validPassword) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  const token = jwt.sign({ role: 'admin', username }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

// =====================================================
// ADMIN ROUTES (protected)
// =====================================================

app.post('/api/admin/songs', requireAdmin, upload.single('audio'), async (req, res) => {
  try {
    if (!s3Client) return res.status(500).json({ error: 'R2 storage is not configured on this server.' });
    if (!req.file) return res.status(400).json({ error: 'No audio file was uploaded.' });

    const { title, film, year, rotation, playlistId, bpm, tags } = req.body;
    if (!title || !rotation || !playlistId) {
      return res.status(400).json({ error: 'Title, Section, and Playlist are required.' });
    }

    let duration = 0;
    try {
      const metadata = await parseBuffer(req.file.buffer, req.file.mimetype);
      duration = Math.round(metadata.format.duration || 0);
    } catch (e) {
      console.warn('Could not read audio duration:', e.message);
    }

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `songs/${Date.now()}-${Math.floor(Math.random() * 1000)}-${safeName}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: storageKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const fileUrl = `${process.env.R2_PUBLIC_URL}/${storageKey}`;
    const existingInRotation = await db.getSongsByRotation(rotation); // Or by playlist? We'll keep order by rotation for live stream

    const song = {
      id: 'song_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      title,
      film: film || '',
      year: year || '',
      rotation,
      playlistId,
      bpm: bpm || '',
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      fileUrl,
      storageKey,
      duration,
      order: existingInRotation.length,
      uploadedAt: new Date().toISOString(),
    };

    await db.addSong(song);
    res.status(201).json(song);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

app.put('/api/admin/songs/:id', requireAdmin, async (req, res) => {
  const { title, film, year, rotation, playlistId, bpm, tags } = req.body;
  const updates = {};
  if (title !== undefined) updates.title = title;
  if (film !== undefined) updates.film = film;
  if (year !== undefined) updates.year = year;
  if (rotation !== undefined) updates.rotation = rotation;
  if (playlistId !== undefined) updates.playlistId = playlistId;
  if (bpm !== undefined) updates.bpm = bpm;
  if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : String(tags).split(',').map((t) => t.trim()).filter(Boolean);

  const updated = await db.updateSong(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Song not found.' });
  res.json(updated);
});

app.delete('/api/admin/songs/:id', requireAdmin, async (req, res) => {
  const song = await db.getSongById(req.params.id);
  if (!song) return res.status(404).json({ error: 'Song not found.' });

  if (s3Client && song.storageKey) {
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: song.storageKey,
      }));
    } catch (e) {
      console.warn('Could not delete file from R2:', e.message);
    }
  } else if (!song.storageKey) {
    // Fallback for local files
    const filePath = path.join(__dirname, song.fileUrl);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) { console.warn('Could not delete file:', e.message); }
    }
  }

  await db.deleteSong(req.params.id);
  res.json({ deleted: true });
});

app.post('/api/admin/rotations/:rotationId/reorder', requireAdmin, async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds must be an array of song ids.' });
  }
  const result = await db.reorderRotation(req.params.rotationId, orderedIds);
  res.json(result);
});

app.get('/api/admin/songs', requireAdmin, async (req, res) => {
  res.json(await db.getAllSongs());
});

app.get('/api/admin/requests', requireAdmin, async (req, res) => {
  res.json(await db.getRequests());
});

app.delete('/api/admin/requests/:id', requireAdmin, async (req, res) => {
  await db.deleteRequest(req.params.id);
  res.json({ deleted: true });
});

// Manage Rotations
app.post('/api/admin/rotations', requireAdmin, upload.single('bgImage'), async (req, res) => {
  try {
    const { name, startHour, endHour, description } = req.body;
    let bgImageUrl = '/images/night-bass-bg.jpg'; // default fallback
    
    if (req.file && s3Client) {
      const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageKey = `bg/${Date.now()}-${Math.floor(Math.random() * 1000)}-${safeName}`;
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: storageKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }));
      bgImageUrl = `${process.env.R2_PUBLIC_URL}/${storageKey}`;
    }

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const newRot = await db.addRotation({
      id,
      name,
      startHour: startHour === '' ? null : Number(startHour),
      endHour: endHour === '' ? null : Number(endHour),
      description,
      bgImageUrl
    });
    res.status(201).json(newRot);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create rotation' });
  }
});

app.put('/api/admin/rotations/:id', requireAdmin, upload.single('bgImage'), async (req, res) => {
  try {
    const { name, startHour, endHour, description } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (startHour !== undefined) updates.startHour = startHour === '' ? null : Number(startHour);
    if (endHour !== undefined) updates.endHour = endHour === '' ? null : Number(endHour);
    if (description !== undefined) updates.description = description;

    if (req.file && s3Client) {
      const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageKey = `bg/${Date.now()}-${Math.floor(Math.random() * 1000)}-${safeName}`;
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: storageKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }));
      updates.bgImageUrl = `${process.env.R2_PUBLIC_URL}/${storageKey}`;
    }

    const updated = await db.updateRotation(req.params.id, updates);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update rotation' });
  }
});

// Manage Playlists
app.post('/api/admin/playlists', requireAdmin, async (req, res) => {
  try {
    const { name, sectionId } = req.body;
    if (!name || !sectionId) return res.status(400).json({ error: 'Name and sectionId are required.' });
    
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
    const newPl = await db.addPlaylist({ id, name, sectionId });
    res.status(201).json(newPl);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

app.put('/api/admin/playlists/:id', requireAdmin, async (req, res) => {
  try {
    const { name, sectionId } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (sectionId) updates.sectionId = sectionId;
    const updated = await db.updatePlaylist(req.params.id, updates);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update playlist' });
  }
});

app.delete('/api/admin/playlists/:id', requireAdmin, async (req, res) => {
  await db.deletePlaylist(req.params.id);
  res.json({ deleted: true });
});

db.connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\nOrbit is running -> http://localhost:${PORT}`);
    console.log(`Admin panel      -> http://localhost:${PORT}/admin.html\n`);
  });
}).catch(err => {
  console.error("Failed to connect to MongoDB on startup:", err);
});
