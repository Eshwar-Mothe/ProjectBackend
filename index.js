require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');


const sendMail = require('./mailService');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const mongoose = require('mongoose');
const userSchema = require('./models/User');
const adminSchema = require('./models/Admin');
const UserDocsSchema = require('./models/UserDocs');
const upload = require('./utils/upload')

const app = express();
const PORT = process.env.PORT || 5000;

const userConnection = mongoose.createConnection(process.env.MONGO_URI, { dbName: 'userData', });
const adminConnection = mongoose.createConnection(process.env.MONGO_URI, { dbName: 'admins', });

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
const UserDocs = userConnection.model('UserDocs', UserDocsSchema);


const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SECRET_KEY = "userAuthentication";


io.on('connection', (socket) => {
  console.log('Admin connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
  });
});


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
    // User Id generation
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');

    const shortDate = `${now.getFullYear().toString().slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;

    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();

    const uid = `ATS${shortDate}${randomStr}`;
    const newUser = new User({
      uid, name, email, phone, state, password: hashedPassword, role: "user",
    });
    await newUser.save();

    io.emit('newUserSignedUp', {
      uid: newUser.uid,
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


app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    let user = await User.findOne({ email });
    let role = "user";

    if (!user) {
      user = await Admin.findOne({ email });
      role = "admin";
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "Credentials not matched" });
    }


    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid password" });
    }

    const { password: _, ...userWithoutPassword } = user.toObject();

    return res.status(200).json({
      success: true,
      message: "Login successful",
      role,
      user: userWithoutPassword
    });

  } catch (err) {
    console.error("Error in /login:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});


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



// app.post('/user/docs', upload.array('docs', 10), async (req, res) => {
//   const { userId, docNames } = req.body;

//   try {
//     if (!req.files || req.files.length === 0) {
//       return res.status(400).json({ success: false, message: "No documents uploaded" });
//     }

//     const names = docNames?.split(',').map(n => n.trim()) || [];

//     if (names.length !== req.files.length) {
//       return res.status(400).json({ success: false, message: "Mismatch between doc names and files" });
//     }

//     const docs = req.files.map((file, index) => ({
//       name: names[index] || file.originalname,
//       url: file.location,
//     }));

//     const newDocEntry = new UserDocs({
//       userId,
//       documents: docs,
//     });

//     await newDocEntry.save();

//     res.status(201).json({
//       success: true,
//       message: 'Documents uploaded successfully',
//       documents: newDocEntry,
//     });
//   } catch (err) {
//     console.error("Error in /user/docs:", err.message);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

// app.post('/admin/create', async (req, res) => {
//   const { adminName, email, password } = req.body;
//   try {
//     const exists = await Admin.findOne({ email });
//     if (exists) return res.status(409).json({ success: false, message: "Admin already exists" });
//     const hashedPassword = await bcrypt.hash(password, 10);
//     const newAdmin = new Admin({ adminName, email, password: hashedPassword });
//     await newAdmin.save();
//     res.status(201).json({ success: true, message: "Admin created", admin: newAdmin });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// });


app.get('/data', async (req, res) => {
  try {
    const users = await User.find().lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch users' });
  }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todaySignups = await User.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } });

    const admins = await Admin.countDocuments();

    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email phone -_id')
      .lean();

    res.json({
      stats: { totalUsers, todaySignups, admins },
      recentUsers,
    });
  } catch (err) {
    console.error("Error in /api/admin/stats:", err);
    res.status(500).json({ error: 'Server error' });
  }
});


// app.get('/user/docs/:userId', async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const docs = await UserDocs.findOne({ userId });
//     if (!docs) {
//       return res.status(404).json({ success: false, message: 'No documents found' });
//     }
//     res.json({ success: true, documents: docs });
//   } catch (err) {
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// });

server.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});

