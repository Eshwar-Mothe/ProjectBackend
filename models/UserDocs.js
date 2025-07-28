const mongoose = require('mongoose');

const docSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  documents: [
    {
      name: String,
      url: String,
    },
  ],
  uploadedAt: { type: Date, default: Date.now },
});

module.exports = docSchema;
