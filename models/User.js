const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    uid: { type: String, required: true, unique:true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    state: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, default: "user" },
    createdAt: { type: Date, default: Date.now }
});

module.exports = userSchema;