const express = require('express');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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
// 1. Database Init and Helpers (Asynchronous & Safe Mutex Queue)
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
async function readDBAsync() {
  try {
    const exists = await fsPromises.access(DB_FILE).then(() => true).catch(() => false);
    if (!exists) {
      await fsPromises.writeFile(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
      return DEFAULT_DB;
    }
    const data = await fsPromises.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database:', error);
    return DEFAULT_DB;
  }
}

// Write Database
async function writeDBAsync(data) {
  try {
    await fsPromises.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing database:', error);
    return false;
  }
}

// Mutex lock for serialization
let dbLock = Promise.resolve();

async function runTransaction(fn) {
  const currentLock = dbLock;
  let resolveLock;
  dbLock = new Promise(resolve => {
    resolveLock = resolve;
  });

  try {
    await currentLock;
    const db = await readDBAsync();
    const result = await fn(db);
    if (result && result.write) {
      await writeDBAsync(db);
    }
    return result ? result.data : null;
  } finally {
    resolveLock();
  }
}

// Helper to notify clients via Socket.io
function notifyClients(type) {
  io.emit('update', { type });
}

// Handle WebSocket connections
io.on('connection', (socket) => {
  console.log('User connected to socket:', socket.id);
  socket.on('disconnect', () => {
    console.log('User disconnected from socket:', socket.id);
  });
});

// ==========================================================================
// 2. REST API Routes
// ==========================================================================

// GET /api/users - Get all users
app.get('/api/users', async (req, res) => {
  try {
    const safeUsers = await runTransaction(async (db) => {
      const users = db.users.map(u => ({ id: u.id, username: u.username, name: u.name, avatarColor: u.avatarColor, status: u.status }));
      return { write: false, data: users };
    });
    res.json(safeUsers);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/auth/register - Register
app.post('/api/auth/register', async (req, res) => {
  const { username, name, password, avatarColor } = req.body;
  if (!username || !name || !password) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  const db = await readDBAsync();
  const normalizedUsername = username.trim().toLowerCase();

  try {
    const response = await runTransaction(async (db) => {
      const existing = db.users.find(u => u.username === normalizedUsername);
      if (existing) {
        return { write: false, data: { status: 400, body: { error: 'ชื่อผู้ใช้งานนี้ถูกใช้ไปแล้ว' } } };
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
      
      const { password: _, ...safeUser } = newUser;
      return { write: true, data: { status: 201, body: safeUser } };
    });

    if (response.status === 201) {
      notifyClients('users');
    }
    res.status(response.status).json(response.body);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/auth/login - Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  const normalizedUsername = username.trim().toLowerCase();

  try {
    const response = await runTransaction(async (db) => {
      const userIndex = db.users.findIndex(u => u.username === normalizedUsername && u.password === password);
      if (userIndex === -1) {
        return { write: false, data: { status: 400, body: { error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' } } };
      }

      db.users[userIndex].status = 'online';
      const { password: _, ...safeUser } = db.users[userIndex];
      return { write: true, data: { status: 200, body: safeUser } };
    });

    if (response.status === 200) {
      notifyClients('users');
    }
    res.status(response.status).json(response.body);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/auth/logout - Logout
app.post('/api/auth/logout', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.sendStatus(200);

  try {
    const changed = await runTransaction(async (db) => {
      const userIndex = db.users.findIndex(u => u.id === userId);
      if (userIndex !== -1) {
        db.users[userIndex].status = 'offline';
        return { write: true, data: true };
      }
      return { write: false, data: false };
    });

    if (changed) {
      notifyClients('users');
    }
    res.sendStatus(200);
  } catch (error) {
    res.sendStatus(500);
  }
});

// PUT /api/users/:id - Update profile
app.put('/api/users/:id', async (req, res) => {
  const userId = req.params.id;
  const { name, password, avatarColor } = req.body;

  try {
    const response = await runTransaction(async (db) => {
      const userIndex = db.users.findIndex(u => u.id === userId);
      if (userIndex === -1) {
        return { write: false, data: { status: 404, body: { error: 'ไม่พบผู้ใช้นี้' } } };
      }

      if (name) db.users[userIndex].name = name.trim();
      if (avatarColor) db.users[userIndex].avatarColor = avatarColor;
      if (password && password.trim() !== '') db.users[userIndex].password = password;

      const { password: _, ...safeUser } = db.users[userIndex];
      return { write: true, data: { status: 200, body: safeUser } };
    });

    if (response.status === 200) {
      notifyClients('users');
    }
    res.status(response.status).json(response.body);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/users/:id - Delete account & Clean up assignments & Group memberships
app.delete('/api/users/:id', async (req, res) => {
  const userId = req.params.id;

  try {
    const success = await runTransaction(async (db) => {
      const userExists = db.users.some(u => u.id === userId);
      if (!userExists) {
        return { write: false, data: false };
      }

      // Remove user
      db.users = db.users.filter(u => u.id !== userId);

      // Clean up assignees (Remove this deleted user ID from all homework assignees)
      db.homeworks.forEach(hw => {
        if (hw.assignees && Array.isArray(hw.assignees)) {
          hw.assignees = hw.assignees.filter(id => id !== userId);
        }
      });

      // Clean up group members (Remove this deleted user ID from all group memberships)
      db.groups.forEach(g => {
        if (g.members && Array.isArray(g.members)) {
          g.members = g.members.filter(id => id !== userId);
        }
      });

      return { write: true, data: true };
    });

    if (success) {
      notifyClients('users');
      notifyClients('homeworks');
      notifyClients('groups');
      res.json({ message: 'ลบบัญชีผู้ใช้สำเร็จ' });
    } else {
      res.status(404).json({ error: 'ไม่พบผู้ใช้นี้' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/groups - Get all groups (filtered by user membership if userId provided)
app.get('/api/groups', async (req, res) => {
  const { userId } = req.query;
  try {
    const groups = await runTransaction(async (db) => {
      const filtered = db.groups.filter(g => {
        // Backward compatibility: if no members field, everyone is a member.
        if (!g.members || !Array.isArray(g.members)) return true;
        if (!userId) return true;
        return g.members.includes(userId);
      });
      return { write: false, data: filtered };
    });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/groups - Create a group with members selection
app.post('/api/groups', async (req, res) => {
  const { name, members } = req.body;
  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อกลุ่ม' });

  try {
    const newGroup = await runTransaction(async (db) => {
      const g = {
        id: 'g_' + Date.now(),
        name: name.trim(),
        members: members || []
      };
      db.groups.push(g);
      return { write: true, data: g };
    });

    notifyClients('groups');
    res.status(201).json(newGroup);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/groups/:id - Delete a group, its homeworks, chats, activities
app.delete('/api/groups/:id', async (req, res) => {
  const groupId = req.params.id;

  try {
    const success = await runTransaction(async (db) => {
      const groupExists = db.groups.some(g => g.id === groupId);
      if (!groupExists) return { write: false, data: false };

      db.groups = db.groups.filter(g => g.id !== groupId);
      // Clean up homeworks
      db.homeworks = db.homeworks.filter(h => h.groupId !== groupId);
      // Clean up chats for the group itself and all its homeworks
      if (db.chats[groupId]) delete db.chats[groupId];
      
      // Clean up chats for homeworks in this group
      db.homeworks.forEach(hw => {
        if (hw.groupId === groupId && db.chats[hw.id]) {
          delete db.chats[hw.id];
        }
      });

      // Clean up activities
      db.activities = db.activities.filter(a => a.groupId !== groupId);

      return { write: true, data: true };
    });

    if (success) {
      notifyClients('groups');
      notifyClients('homeworks');
      notifyClients('activities');
      res.json({ message: 'ลบกลุ่มเรียนสำเร็จ' });
    } else {
      res.status(404).json({ error: 'ไม่พบกลุ่มเรียนนี้' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/homeworks - Get all homeworks
app.get('/api/homeworks', async (req, res) => {
  try {
    const homeworksWithCounts = await runTransaction(async (db) => {
      const hwList = db.homeworks.map(hw => ({
        ...hw,
        commentsCount: (db.chats[hw.id] || []).length
      }));
      return { write: false, data: hwList };
    });
    res.json(homeworksWithCounts);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/homeworks - Create homework
app.post('/api/homeworks', async (req, res) => {
  const { groupId, title, subjectId, priority, dueDate, dueTime, description, assignees, createdBy } = req.body;
  if (!groupId || !title || !subjectId) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
  }

  try {
    const newHw = await runTransaction(async (db) => {
      const hw = {
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
      db.homeworks.unshift(hw);
      return { write: true, data: hw };
    });

    notifyClients('homeworks');
    res.status(201).json(newHw);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /api/homeworks/:id - Update homework status or details
app.put('/api/homeworks/:id', async (req, res) => {
  const hwId = req.params.id;

  try {
    const updatedHw = await runTransaction(async (db) => {
      const hwIndex = db.homeworks.findIndex(h => h.id === hwId);
      if (hwIndex === -1) return { write: false, data: null };

      db.homeworks[hwIndex] = {
        ...db.homeworks[hwIndex],
        ...req.body
      };
      return { write: true, data: db.homeworks[hwIndex] };
    });

    if (updatedHw) {
      notifyClients('homeworks');
      res.json(updatedHw);
    } else {
      res.status(404).json({ error: 'ไม่พบการบ้านชิ้นนี้' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/homeworks/:id - Delete homework
app.delete('/api/homeworks/:id', async (req, res) => {
  const hwId = req.params.id;

  try {
    const success = await runTransaction(async (db) => {
      const hwIndex = db.homeworks.findIndex(h => h.id === hwId);
      if (hwIndex === -1) return { write: false, data: false };

      db.homeworks = db.homeworks.filter(h => h.id !== hwId);
      if (db.chats[hwId]) {
        delete db.chats[hwId];
      }
      return { write: true, data: true };
    });

    if (success) {
      notifyClients('homeworks');
      notifyClients('chats');
      res.json({ message: 'ลบการบ้านสำเร็จ' });
    } else {
      res.status(404).json({ error: 'ไม่พบการบ้านชิ้นนี้' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/chats/:homeworkId - Get chats
app.get('/api/chats/:homeworkId', async (req, res) => {
  const hwId = req.params.homeworkId;
  try {
    const chats = await runTransaction(async (db) => {
      return { write: false, data: db.chats[hwId] || [] };
    });
    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/chats - Send comment
app.post('/api/chats', async (req, res) => {
  const { homeworkId, senderId, text, link } = req.body;
  if (!homeworkId || !senderId || (!text && !link)) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
  }

  try {
    const newMsg = await runTransaction(async (db) => {
      const msg = {
        id: 'msg_' + Date.now(),
        senderId,
        text: text || `แชร์ลิงก์: ${link.label}`,
        link,
        timestamp: new Date().toISOString()
      };

      if (!db.chats[homeworkId]) {
        db.chats[homeworkId] = [];
      }
      db.chats[homeworkId].push(msg);
      return { write: true, data: msg };
    });

    notifyClients('chats');
    res.status(201).json(newMsg);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/activities - Get all activity logs
app.get('/api/activities', async (req, res) => {
  try {
    const activities = await runTransaction(async (db) => {
      return { write: false, data: db.activities };
    });
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/activities - Log activity
app.post('/api/activities', async (req, res) => {
  const { groupId, userId, type, hwTitle, details } = req.body;
  if (!groupId || !userId || !type || !hwTitle) {
    return res.sendStatus(400);
  }

  try {
    const newAct = await runTransaction(async (db) => {
      const act = {
        id: 'act_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        groupId,
        userId,
        type,
        hwTitle,
        details,
        timestamp: new Date().toISOString()
      };

      db.activities.unshift(act);
      if (db.activities.length > 100) {
        db.activities = db.activities.slice(0, 100);
      }
      return { write: true, data: act };
    });

    notifyClients('activities');
    res.status(201).json(newAct);
  } catch (error) {
    res.sendStatus(500);
  }
});

// GET /api/subjects - Get all subjects
app.get('/api/subjects', async (req, res) => {
  try {
    const subjects = await runTransaction(async (db) => {
      return { write: false, data: db.subjects };
    });
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/subjects - Create a subject
app.post('/api/subjects', async (req, res) => {
  const { name, color } = req.body;
  if (!name || !color) return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });

  try {
    const response = await runTransaction(async (db) => {
      const duplicate = db.subjects.find(s => s.name.toLowerCase() === name.trim().toLowerCase());
      if (duplicate) {
        return { write: false, data: { status: 400, body: { error: 'มีวิชานี้อยู่ในระบบแล้ว' } } };
      }

      const newSubj = {
        id: 'subj_' + Date.now(),
        name: name.trim(),
        color
      };

      db.subjects.push(newSubj);
      return { write: true, data: { status: 201, body: newSubj } };
    });

    if (response.status === 201) {
      notifyClients('subjects');
    }
    res.status(response.status).json(response.body);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`HomeworkSpace Production Server running on port ${PORT}`);
});
