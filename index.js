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
const UserDocsSchema = require('./models/UserDocs');
const referralSchema = require('./models/Referral');
const { upload } = require('./utils/upload');
const UserDocs = require('./models/UserDocs');
const { getSignedFileUrl } = require('./utils/s3Utils');

const app = express();
const PORT = process.env.PORT || 5000;

const userConnection = mongoose.createConnection(process.env.MONGO_URI, { dbName: 'userData', });
const adminConnection = mongoose.createConnection(process.env.MONGO_URI, { dbName: 'admins', });
const referralConnection = mongoose.createConnection(process.env.MONGO_URI, { dbName: 'referralsData', });


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
monitorConnection(referralConnection, 'ReferralDB');


const User = userConnection.model('User', userSchema);
const Admin = adminConnection.model('Admin', adminSchema);
const Referral = referralConnection.model('Referral', referralSchema)



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

app.post('/users/isExist', async (req, res) => {
  const { email } = req.body;
  try {
    if (!email) return res.status(400).json({ message: "Email is required" })

    const isUserExist = await User.findOne({ email })

    if (!isUserExist) return res.status(404).json({ message: "User not found" })

    return res.status(200).json({ userDetails: isUserExist })

  } catch (err) {
    console.error("Error in /users/isExist:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
})


app.post('/referralData', async (req, res) => {
  const { user, referrals } = req.body
  console.log(user, referrals, "received@backend")
  try {
    if (!user || !referrals) return res.status(400).json({ message: "User and referrals are required" })

    const isExistingUser = await User.findOne({ email: user.email })

    const referralDoc = new Referral({
      user,
      referrals,
      isExistingUser: !!isExistingUser
    })

    await referralDoc.save()

    return res.status(200).json({ message: "Referral Saved Successfully", data: referralDoc })
  } catch (err) {
    console.log("Error in /referralData", err)
    return res.status(500).json({ message: "Internal Server Error" })
  }
})

app.post('/user/docs', upload.array('docs', 10), async (req, res) => {
  const { userId, docs } = req.body;

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "No documents uploaded" });
    }


    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid userId format" });
    }


    const names = docs ? docs.split(',').map(n => n.trim()) : req.files.map(f => f.originalname);
    if (names.length !== req.files.length) {
      return res.status(400).json({ success: false, message: "Mismatch between doc names and files" });
    }


    const uploadedDocs = req.files.map((file, index) => ({
      name: names[index] || file.originalname,
      url: file.location,
      s3Key: file.key,
    }));


    const updatedUserDocs = await UserDocs.findOneAndUpdate(
      { userId },
      { $push: { documents: { $each: uploadedDocs } } },
      { new: true, upsert: true }
    );

    res.status(201).json({
      success: true,
      message: "Documents uploaded successfully",
      documents: updatedUserDocs.documents,
    });
  } catch (err) {
    console.error("Error in /user/docs:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


app.post('/adminData', async (req, res) => {
  const { adminName, email, password } = req.body;
  console.log(adminName, email, password)
  try {
    const exists = await Admin.findOne({ email });
    if (exists) return res.status(409).json({ success: false, message: "Admin already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new Admin({ adminName, email, password: hashedPassword });
    await newAdmin.save();
    res.json({ status: 201, message: "Admin created", admin: newAdmin });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


app.get('/data', async (req, res) => {
  try {
    const users = await User.find().lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch users' });
  }
});

app.get('/users/referralData', async (req, res) => {
  try {
    const referralData = await Referral.find().lean()
    res.json(referralData)
  } catch (err) {
    console.log("Failed to fetch referrals", err)
    res.status(500).json({ message: "Internal Server error, Try again later" })
  }
})

// API call to fetch the urls uploaded by the users

app.get('/admin/user/docs/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log("userId", userId);

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ success: false, message: "Invalid userId format" });
  }

  try {
    const userDocsList = await UserDocs.find({ userId }).lean();

    if (!userDocsList || userDocsList.length === 0) {
      return res.status(404).json({ success: false, message: 'No documents found for this user' });
    }

    // Combine all document arrays into one flat array
    const allDocuments = userDocsList.flatMap(docRecord => docRecord.documents);

    // ✅ Generate signed URLs correctly and return only name + signedUrl
    const docsWithSignedUrls = await Promise.all(
      allDocuments.map(async (doc) => {
        const key = doc.s3Key || doc.url.split('.com/')[1];
        const signedUrl = await getSignedFileUrl(key);
        return { _id: doc._id, name: doc.name, signedUrl, uploadedAt: doc.uploadedAt };
      })
    );

    console.log("All docs fetched from AWS:", docsWithSignedUrls);
    res.json({ success: true, documents: docsWithSignedUrls });

  } catch (err) {
    console.error("Error in /admin/user/docs/:userId:", err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/viewDoc/:docId', async (req, res) => {
  try {
    const docId = req.params.docId;
    console.log("DocId", docId)

    const userDocs = await UserDocs.findOne({ "documents._id": docId });
    const doc = userDocs?.documents.id(docId);

    if (!doc) {
      return res.status(404).json({ error: "File not found" });
    }

    const signedUrl = await getSignedFileUrl(doc.s3Key);
    console.log(signedUrl)
    res.redirect(signedUrl);
  } catch (err) {
    console.error("❌ Error generating signed URL:", err);
    res.status(500).json({ error: "Failed to fetch document" });
  }
})

app.get('/api/userDocs/all', async (req, res) => {
  try {
    // Fetch all userDocs (without populate)
    const allDocs = await UserDocs.find().lean();

    // Manually attach user details
    const result = await Promise.all(
      allDocs.map(async (entry) => {
        const user = await User.findById(entry.userId).select('name email uid');
        return { ...entry, user };
      })
    );
    console.log(result)
    res.status(200).json(result);
  } catch (err) {
    console.error("❌ Error while fetching the userDocs:", err);
    res.status(500).json({ message: "Error fetching documents", err });
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

server.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});

