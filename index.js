require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const sendMail = require('./mailService');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const userSchema = require('./models/User');
const adminSchema = require('./models/Admin');

const app = express();
const PORT = process.env.PORT || 5000;

const userConnection = mongoose.createConnection(process.env.MONGO_URI, { dbName: 'users', });
const adminConnection = mongoose.createConnection(process.env.MONGO_URI, { dbName: 'adminData', });

function monitorConnection(connection, name) {
  connection.on('connected', () => {
    console.log(`${name} database connected successfully.`);
  });

  connection.on('error', (err) => {
    console.error(`${name} database connection error:`, err);
  });

  connection.on('disconnected', () => {
    console.log(`${name} database disconnected.`);
  });
}

monitorConnection(userConnection, 'UserDB');
monitorConnection(adminConnection, 'AdminDB');

const User = userConnection.model('User', userSchema);
const Admin = adminConnection.model('Admin', adminSchema);

// 3. Server and Socket setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SECRET_KEY = "userAuthentication";

// Socket.io connection
io.on('connection', (socket) => {
  console.log('Admin connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
  });
});

// User registration
app.post('/newUser', async (req, res) => {
  const { name, email, phone, state, password } = req.body;
  try {
    if (!name || !email || !phone || !state || !password) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "User already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      name, email, phone, state, password: hashedPassword, role: "user",
    });
    await newUser.save();

    io.emit('newUserSignedUp', {
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      state: newUser.state,
      createdAt: newUser.createdAt
    });

    return res.status(201).json({ success: true, message: "User registered successfully", user: newUser });
  } catch (err) {
    console.error("Error in /newUser:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// User login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid password" });
    }
    const { password: _, ...userWithoutPassword } = user.toObject();
    return res.status(200).json({ success: true, message: "Login successful", user: userWithoutPassword });
  } catch (err) {
    console.error("Error in /login:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Send mail (checks user DB for existing email)
app.post('/sendMail', async (req, res) => {
  const { to, subject, html } = req.body;
  try {
    const isUserExist = await User.findOne({ email: to });
    if (isUserExist) {
      return res.status(409).json({ success: false, message: "User already exists" });
    }
    const payload = { to, subject, html };
    const response = await sendMail(payload);
    res.status(200).json(response);
  } catch (err) {
    console.error("Error in /sendMail:", err.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// Statistics (user DB)
app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const todaySignups = await User.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } });
    const admins = await User.countDocuments({ role: 'admin' });
    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5).select('name email -_id').lean();
    res.json({
      stats: { totalUsers, todaySignups, admins },
      recentUsers,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all users
app.get('/data', async (req, res) => {
  try {
    const users = await User.find().lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch users' });
  }
});

// EXAMPLE ADMIN ROUTE (repeat above logic but with Admin model if needed)
app.post('/admin/create', async (req, res) => {
  const { adminName, email, password } = req.body;
  try {
    const exists = await Admin.findOne({ email });
    if (exists) return res.status(409).json({ success: false, message: "Admin already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new Admin({ adminName, email, password: hashedPassword });
    await newAdmin.save();
    res.status(201).json({ success: true, message: "Admin created", admin: newAdmin });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Server listen
server.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});

