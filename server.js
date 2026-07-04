const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'db.json');

app.use(express.json());
// Serve client static files with zero-caching headers for clean development and deployment
app.use(express.static(__dirname, {
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));


// ==========================================================================
// 1. Database Init and Helpers
// ==========================================================================

const DEFAULT_DB = {
  users: [],
  groups: [],
  subjects: [
    { id: 's1', name: 'คณิตศาสตร์', color: '#3b82f6' },
    { id: 's2', name: 'ฟิสิกส์', color: '#8b5cf6' },
    { id: 's3', name: 'เคมี', color: '#10b981' },
    { id: 's4', name: 'ชีววิทยา', color: '#ec4899' },
    { id: 's5', name: 'ภาษาอังกฤษ', color: '#f59e0b' },
    { id: 's6', name: 'ภาษาไทย', color: '#f43f5e' }
  ],
  homeworks: [],
  chats: {},
  activities: []
};

// Read Database
function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
      return DEFAULT_DB;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database:', error);
    return DEFAULT_DB;
  }
}

// Write Database
function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing database:', error);
    return false;
  }
}

// ==========================================================================
// 2. REST API Routes
// ==========================================================================

// GET /api/users - Get all users
app.get('/api/users', (req, res) => {
  const db = readDB();
  const safeUsers = db.users.map(u => ({ id: u.id, username: u.username, name: u.name, avatarColor: u.avatarColor, status: u.status }));
  res.json(safeUsers);
});

// POST /api/auth/register - Register
app.post('/api/auth/register', (req, res) => {
  const { username, name, password, avatarColor } = req.body;
  if (!username || !name || !password) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  const db = readDB();
  const normalizedUsername = username.trim().toLowerCase();
  
  const existing = db.users.find(u => u.username === normalizedUsername);
  if (existing) {
    return res.status(400).json({ error: 'ชื่อผู้ใช้งานนี้ถูกใช้ไปแล้ว' });
  }

  const newUser = {
    id: 'u_' + Date.now() + '_' + Math.floor(Math.random()*100),
    username: normalizedUsername,
    name: name.trim(),
    password,
    avatarColor: avatarColor || '#8b5cf6',
    status: 'online'
  };

  db.users.push(newUser);
  writeDB(db);

  // Return safe user object
  const { password: _, ...safeUser } = newUser;
  res.status(201).json(safeUser);
});

// POST /api/auth/login - Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  const db = readDB();
  const normalizedUsername = username.trim().toLowerCase();

  const userIndex = db.users.findIndex(u => u.username === normalizedUsername && u.password === password);
  if (userIndex === -1) {
    return res.status(400).json({ error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
  }

  db.users[userIndex].status = 'online';
  writeDB(db);

  const { password: _, ...safeUser } = db.users[userIndex];
  res.json(safeUser);
});

// POST /api/auth/logout - Logout
app.post('/api/auth/logout', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.sendStatus(200);

  const db = readDB();
  const userIndex = db.users.findIndex(u => u.id === userId);
  if (userIndex !== -1) {
    db.users[userIndex].status = 'offline';
    writeDB(db);
  }
  res.sendStatus(200);
});

// PUT /api/users/:id - Update profile
app.put('/api/users/:id', (req, res) => {
  const userId = req.params.id;
  const { name, password, avatarColor } = req.body;

  const db = readDB();
  const userIndex = db.users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'ไม่พบผู้ใช้นี้' });
  }

  if (name) db.users[userIndex].name = name.trim();
  if (avatarColor) db.users[userIndex].avatarColor = avatarColor;
  if (password && password.trim() !== '') db.users[userIndex].password = password;

  writeDB(db);
  const { password: _, ...safeUser } = db.users[userIndex];
  res.json(safeUser);
});

// DELETE /api/users/:id - Delete account
app.delete('/api/users/:id', (req, res) => {
  const userId = req.params.id;
  const db = readDB();

  const userExists = db.users.some(u => u.id === userId);
  if (!userExists) {
    return res.status(404).json({ error: 'ไม่พบผู้ใช้นี้' });
  }

  db.users = db.users.filter(u => u.id !== userId);
  writeDB(db);
  res.json({ message: 'ลบบัญชีผู้ใช้สำเร็จ' });
});

// GET /api/groups - Get all groups
app.get('/api/groups', (req, res) => {
  const db = readDB();
  res.json(db.groups);
});

// POST /api/groups - Create a group
app.post('/api/groups', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อกลุ่ม' });

  const db = readDB();
  const newGroup = {
    id: 'g_' + Date.now(),
    name: name.trim()
  };

  db.groups.push(newGroup);
  writeDB(db);
  res.status(201).json(newGroup);
});

// GET /api/homeworks - Get all homeworks
app.get('/api/homeworks', (req, res) => {
  const db = readDB();
  const homeworksWithCounts = db.homeworks.map(hw => ({
    ...hw,
    commentsCount: (db.chats[hw.id] || []).length
  }));
  res.json(homeworksWithCounts);
});

// POST /api/homeworks - Create homework
app.post('/api/homeworks', (req, res) => {
  const { groupId, title, subjectId, priority, dueDate, dueTime, description, assignees, createdBy } = req.body;
  if (!groupId || !title || !subjectId) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
  }

  const db = readDB();
  const newHw = {
    id: 'hw_' + Date.now() + '_' + Math.floor(Math.random()*100),
    groupId,
    title: title.trim(),
    subjectId,
    priority: priority || 'medium',
    dueDate,
    dueTime: dueTime || '08:30',
    description,
    assignees: assignees || [],
    status: 'todo',
    createdBy,
    createdAt: new Date().toISOString()
  };

  db.homeworks.unshift(newHw);
  writeDB(db);
  res.status(201).json(newHw);
});

// PUT /api/homeworks/:id - Update homework status or details
app.put('/api/homeworks/:id', (req, res) => {
  const hwId = req.params.id;
  const db = readDB();
  const hwIndex = db.homeworks.findIndex(h => h.id === hwId);
  if (hwIndex === -1) {
    return res.status(404).json({ error: 'ไม่พบการบ้านชิ้นนี้' });
  }

  db.homeworks[hwIndex] = {
    ...db.homeworks[hwIndex],
    ...req.body
  };

  writeDB(db);
  res.json(db.homeworks[hwIndex]);
});

// DELETE /api/homeworks/:id - Delete homework
app.delete('/api/homeworks/:id', (req, res) => {
  const hwId = req.params.id;
  const db = readDB();
  
  const hwIndex = db.homeworks.findIndex(h => h.id === hwId);
  if (hwIndex === -1) {
    return res.status(404).json({ error: 'ไม่พบการบ้านชิ้นนี้' });
  }

  db.homeworks = db.homeworks.filter(h => h.id !== hwId);
  // Also clean up chats related to it
  if (db.chats[hwId]) {
    delete db.chats[hwId];
  }

  writeDB(db);
  res.json({ message: 'ลบการบ้านสำเร็จ' });
});

// GET /api/chats/:homeworkId - Get chats
app.get('/api/chats/:homeworkId', (req, res) => {
  const hwId = req.params.homeworkId;
  const db = readDB();
  res.json(db.chats[hwId] || []);
});

// POST /api/chats - Send comment
app.post('/api/chats', (req, res) => {
  const { homeworkId, senderId, text, link } = req.body;
  if (!homeworkId || !senderId || (!text && !link)) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
  }

  const db = readDB();
  const newMsg = {
    id: 'msg_' + Date.now(),
    senderId,
    text: text || `แชร์ลิงก์: ${link.label}`,
    link,
    timestamp: new Date().toISOString()
  };

  if (!db.chats[homeworkId]) {
    db.chats[homeworkId] = [];
  }

  db.chats[homeworkId].push(newMsg);
  writeDB(db);
  res.status(201).json(newMsg);
});

// GET /api/activities - Get all activity logs
app.get('/api/activities', (req, res) => {
  const db = readDB();
  res.json(db.activities);
});

// POST /api/activities - Log activity
app.post('/api/activities', (req, res) => {
  const { groupId, userId, type, hwTitle, details } = req.body;
  if (!groupId || !userId || !type || !hwTitle) {
    return res.sendStatus(400);
  }

  const db = readDB();
  const newAct = {
    id: 'act_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    groupId,
    userId,
    type,
    hwTitle,
    details,
    timestamp: new Date().toISOString()
  };

  db.activities.unshift(newAct);
  if (db.activities.length > 100) {
    db.activities = db.activities.slice(0, 100);
  }

  writeDB(db);
  res.status(201).json(newAct);
});

// GET /api/subjects - Get all subjects
app.get('/api/subjects', (req, res) => {
  const db = readDB();
  res.json(db.subjects);
});

// POST /api/subjects - Create a subject
app.post('/api/subjects', (req, res) => {
  const { name, color } = req.body;
  if (!name || !color) return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });

  const db = readDB();
  const duplicate = db.subjects.find(s => s.name.toLowerCase() === name.trim().toLowerCase());
  if (duplicate) {
    return res.status(400).json({ error: 'มีวิชานี้อยู่ในระบบแล้ว' });
  }

  const newSubj = {
    id: 'subj_' + Date.now(),
    name: name.trim(),
    color
  };

  db.subjects.push(newSubj);
  writeDB(db);
  res.status(201).json(newSubj);
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`HomeworkSpace Production Server running on port ${PORT}`);
});
