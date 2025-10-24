const mongoose = require('mongoose');

// ✅ Create a dedicated connection for the 'userDocs' database
const docsConnection = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'userDocs',
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// ✅ Monitor connection status
docsConnection.on('connected', () => {
  console.log('📦 DocsDB connected successfully.');
});

docsConnection.on('error', (err) => {
  console.error('❌ DocsDB connection error:', err);
});

// ✅ Define schema
const docSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String },
  s3Key: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
});

const userDocsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
  documents: [docSchema],
  createdAt: { type: Date, default: Date.now },
});

// ✅ Create model on this connection
const UserDocs = docsConnection.model('UserDocs', userDocsSchema);

module.exports = UserDocs;
