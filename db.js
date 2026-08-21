const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
  id: String,
  title: String,
  film: String,
  year: String,
  rotation: String,
  bpm: String,
  tags: [String],
  fileUrl: String,
  storageKey: String,
  duration: Number,
  order: Number,
  uploadedAt: String
});

const Song = mongoose.models.Song || mongoose.model('Song', songSchema);

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
};
