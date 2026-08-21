const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
  id: String,
  title: String,
  film: String,
  year: String,
  rotation: String, // refers to Section
  playlistId: String, // refers to Playlist
  bpm: String,
  tags: [String],
  fileUrl: String,
  storageKey: String,
  duration: Number,
  order: Number,
  uploadedAt: String
});

const requestSchema = new mongoose.Schema({
  songName: String,
  submittedAt: String
});

const rotationSchema = new mongoose.Schema({
  id: String,
  name: String,
  startHour: Number,
  endHour: Number,
  description: String,
  bgImageUrl: String,
  order: Number
});

const playlistSchema = new mongoose.Schema({
  id: String,
  name: String,
  sectionId: String, // refers to rotation.id
  order: Number
});

const Song = mongoose.models.Song || mongoose.model('Song', songSchema);
const Request = mongoose.models.Request || mongoose.model('Request', requestSchema);
const Rotation = mongoose.models.Rotation || mongoose.model('Rotation', rotationSchema);
const Playlist = mongoose.models.Playlist || mongoose.model('Playlist', playlistSchema);

let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is missing in .env! Cannot connect to database.");
    return;
  }
  await mongoose.connect(process.env.MONGO_URI);
  isConnected = true;
  console.log("Connected to MongoDB!");
  
  // Seed default rotations if none exist
  const count = await Rotation.countDocuments();
  if (count === 0) {
    const defaults = [
      { id: 'night-bass', name: 'Night Bass', startHour: 22, endHour: 5, description: 'For the stretch between two towns at 2am', bgImageUrl: '/images/night-bass-bg.jpg', order: 0 },
      { id: 'study-8d', name: 'Study 8D', startHour: 9, endHour: 18, description: "What's actually playing while you focus", bgImageUrl: '/images/study-8d-bg.jpg', order: 1 },
      { id: 'chill-evening', name: 'Chill Evening', startHour: 18, endHour: 22, description: 'The wind-down hours', bgImageUrl: '/images/chill-evening-bg.jpg', order: 2 },
      { id: 'sunrise', name: 'Sunrise', startHour: 5, endHour: 9, description: 'Loud half, generator on, speakers out', bgImageUrl: '/images/sunrise-bg.jpg', order: 3 },
      { id: 'on-request', name: 'On Request', startHour: null, endHour: null, description: 'Plays only when you ask for it', bgImageUrl: '/images/on-request-bg.jpg', order: 4 },
    ];
    await Rotation.insertMany(defaults);
    console.log("Seeded default rotations.");
  }
}

// Playlist Methods
async function getPlaylists() {
  await connectDB();
  return Playlist.find({}).sort({ order: 1 }).lean();
}

async function addPlaylist(data) {
  await connectDB();
  const count = await Playlist.countDocuments({ sectionId: data.sectionId });
  data.order = count;
  const pl = new Playlist(data);
  await pl.save();
  return pl.toObject();
}

async function updatePlaylist(id, updates) {
  await connectDB();
  return Playlist.findOneAndUpdate({ id }, updates, { new: true }).lean();
}

async function deletePlaylist(id) {
  await connectDB();
  const result = await Playlist.deleteOne({ id });
  return result.deletedCount > 0;
}

// Rotation Methods
async function getRotations() {
  await connectDB();
  return Rotation.find({}).sort({ order: 1 }).lean();
}

async function addRotation(data) {
  await connectDB();
  const count = await Rotation.countDocuments();
  data.order = count;
  const rot = new Rotation(data);
  await rot.save();
  return rot.toObject();
}

async function updateRotation(id, updates) {
  await connectDB();
  return Rotation.findOneAndUpdate({ id }, updates, { new: true }).lean();
}

async function deleteRotation(id) {
  await connectDB();
  const result = await Rotation.deleteOne({ id });
  return result.deletedCount > 0;
}

async function addRequest(songName) {
  await connectDB();
  const req = new Request({ songName, submittedAt: new Date().toISOString() });
  await req.save();
  return req.toObject();
}

async function getRequests() {
  await connectDB();
  return Request.find({}).sort({ submittedAt: -1 }).lean();
}

async function deleteRequest(id) {
  await connectDB();
  const result = await Request.deleteOne({ _id: id });
  return result.deletedCount > 0;
}

async function getAllSongs() {
  await connectDB();
  return Song.find({}).lean();
}

async function getSongsByRotation(rotationId) {
  await connectDB();
  return Song.find({ rotation: rotationId }).sort({ order: 1 }).lean();
}

async function getSongById(id) {
  await connectDB();
  return Song.findOne({ id }).lean();
}

async function addSong(songData) {
  await connectDB();
  const song = new Song(songData);
  await song.save();
  return song.toObject();
}

async function updateSong(id, updates) {
  await connectDB();
  const song = await Song.findOneAndUpdate({ id }, updates, { new: true }).lean();
  return song;
}

async function deleteSong(id) {
  await connectDB();
  const result = await Song.deleteOne({ id });
  return result.deletedCount > 0;
}

async function reorderRotation(rotationId, orderedIds) {
  await connectDB();
  const bulkOps = orderedIds.map((id, index) => ({
    updateOne: {
      filter: { id, rotation: rotationId },
      update: { order: index }
    }
  }));
  if (bulkOps.length > 0) {
    await Song.bulkWrite(bulkOps);
  }
  return getSongsByRotation(rotationId);
}

module.exports = {
  connectDB,
  getAllSongs,
  getSongsByRotation,
  getSongById,
  addSong,
  updateSong,
  deleteSong,
  reorderRotation,
  addRequest,
  getRequests,
  deleteRequest,
  getRotations,
  addRotation,
  updateRotation,
  deleteRotation,
  getPlaylists,
  addPlaylist,
  updatePlaylist,
  deletePlaylist
};
