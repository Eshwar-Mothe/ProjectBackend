const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const sendMail = require('./mailService');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SECRET_KEY = "userAuthentication";

let userData = [];
const dataFilePath = path.join(__dirname, 'data.json');

try {
  const fileContent = fs.readFileSync(dataFilePath, 'utf-8');
  userData = JSON.parse(fileContent);
  console.log("Loaded user data:", userData);
} catch (err) {
  console.error('Error reading data.json:', err.message);
}

io.on('connection', (socket) => {
  console.log('Admin connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
  });
});

app.post('/sendMail', async (req, res) => {
  const { to, subject, html } = req.body;
  console.log("Email request received:", { to, subject });

  try {
    const isUserExist = userData.find(user => user.email === to);

    if (isUserExist) {
      console.log("User already exists:", to);
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

app.post('/newUser', async (req, res) => {
  const { name, email, phone, state, password } = req.body;

  try {
    if (!name || !email || !phone || !state || !password) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const existingUser = userData.find(user => user.email === email);
    if (existingUser) {
      return res.status(409).json({ success: false, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const time = date.getTime();
    const userId = `AT${year}${month}${time}`;

    const newUser = {
      id: userId,
      name,
      email,
      phone,
      state,
      password: hashedPassword,
      role: "user",
      createdAt: new Date()
    };

    userData.push(newUser);

    fs.writeFileSync(dataFilePath, JSON.stringify(userData, null, 2), 'utf-8');

    io.emit('newUserSignedUp', {
      id: userId,
      name,
      email,
      phone,
      state,
      createdAt: newUser.createdAt
    });

    return res.status(201).json({ success: true, message: "User registered successfully", user: newUser });
  } catch (err) {
    console.error("Error in /newUser:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const user = userData.find(user => user.email === email);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid password" });
    }

    const { password: _, ...userWithoutPassword } = user;
    return res.status(200).json({ success: true, message: "Login successful", user: userWithoutPassword });
  } catch (err) {
    console.error("Error in /login:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get('/api/admin/stats', (req, res) => {
  const totalUsers = userData.length;
  const today = new Date().toDateString();
  const todaySignups = userData.filter(user => new Date(user.createdAt).toDateString() === today).length;
  const admins = userData.filter(user => user.role === 'admin').length;

  const recentUsers = userData
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)
    .map(({ name, email }) => ({ name, email }));

  res.json({
    stats: {
      totalUsers,
      todaySignups,
      admins,
    },
    recentUsers,
  });
});

app.get('/data', (req, res) => {
  fs.readFile(dataFilePath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Could not read file' });
    res.json(JSON.parse(data));
  });
});

server.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
