/**
 * HomeworkSpace - Core Client Application Logic
 * Communicates with the Express API to synchronize and persist data
 * to a shared database in real-time. Optimized for performance and lag-free UI.
 */

// ==========================================================================
// 1. Client State
// ==========================================================================

let state = {
  users: [],
  groups: [],
  subjects: [],
  homeworks: [],
  chats: {},
  activities: [],
  loggedInUserId: null,
  activeGroupId: null,
  activeHomeworkId: null,
  activeAttachLink: null,
  activeGroupAttachLink: null,
  groupChatOpen: false,
  searchQuery: '',
  filterSubject: 'all',
  filterPriority: 'all',
  filterAssignee: 'all',
  notifs: []
};

// Local cache variables to detect server updates and avoid unnecessary DOM redraws
let cache = {
  usersStr: '',
  groupsStr: '',
  subjectsStr: '',
  homeworksStr: '',
  activitiesStr: '',
  chatsStr: '',
  groupChatsStr: ''
};

// Load saved session
function initSession() {
  const savedLogin = localStorage.getItem('hwspace_logged_in_user');
  
  // Wipe everything else from client localStorage to prevent development stale cache problems
  localStorage.clear();
  
  if (savedLogin) {
    state.loggedInUserId = savedLogin;
    localStorage.setItem('hwspace_logged_in_user', savedLogin);
  } else {
    state.loggedInUserId = null;
  }
  
  state.activeGroupId = null;
}


// ==========================================================================
// 2. REST API Fetch & Synchronization Engine
// ==========================================================================

// Initial loading of all datasets from server
async function loadDataFromServer() {
  try {
    const [users, groups, subjects, homeworks, activities] = await Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch('/api/groups').then(r => r.json()),
      fetch('/api/subjects').then(r => r.json()),
      fetch('/api/homeworks').then(r => r.json()),
      fetch('/api/activities').then(r => r.json())
    ]);

    state.users = users;
    state.groups = groups;
    state.subjects = subjects;
    state.homeworks = homeworks;
    state.activities = activities;

    // Cache initial states
    cache.usersStr = JSON.stringify(users);
    cache.groupsStr = JSON.stringify(groups);
    cache.subjectsStr = JSON.stringify(subjects);
    cache.homeworksStr = JSON.stringify(homeworks);
    cache.activitiesStr = JSON.stringify(activities);

    // Auto set active group if empty
    if (!state.activeGroupId && groups.length > 0) {
      state.activeGroupId = groups[0].id;
    }
  } catch (error) {
    console.error('Error fetching data from server:', error);
    showToast('การเชื่อมต่อขัดข้อง', 'ไม่สามารถโหลดข้อมูลจากเซิร์ฟเวอร์ได้ในขณะนี้', 'danger');
  }
}

// Real-time synchronization check (Runs every 4 seconds)
async function syncDataFromServer() {
  if (!state.loggedInUserId) return;

  try {
    // Perform parallel quick fetch checks
    const [users, groups, homeworks, activities] = await Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch('/api/groups').then(r => r.json()),
      fetch('/api/homeworks').then(r => r.json()),
      fetch('/api/activities').then(r => r.json())
    ]);

    const usersStr = JSON.stringify(users);
    const groupsStr = JSON.stringify(groups);
    const homeworksStr = JSON.stringify(homeworks);
    const activitiesStr = JSON.stringify(activities);

    let needsBoardRedraw = false;
    let needsSidebarRedraw = false;
    let needsDropdownUpdate = false;

    // 1. Detect Homework updates (e.g. status shifted by classmate, new task added)
    if (homeworksStr !== cache.homeworksStr) {
      // Find what was changed to show a friendly deadline toast if needed
      detectAndToastNewServerActivities(homeworks, JSON.parse(cache.homeworksStr || '[]'));
      
      state.homeworks = homeworks;
      cache.homeworksStr = homeworksStr;
      needsBoardRedraw = true;
    }

    // 2. Detect User updates (e.g. profile edit, new member registration)
    if (usersStr !== cache.usersStr) {
      state.users = users;
      cache.usersStr = usersStr;
      needsSidebarRedraw = true;
      needsDropdownUpdate = true;
    }

    // 3. Detect Group updates
    if (groupsStr !== cache.groupsStr) {
      state.groups = groups;
      cache.groupsStr = groupsStr;
      needsDropdownUpdate = true;
      
      // Handle active group deleted
      if (state.activeGroupId && !groups.some(g => g.id === state.activeGroupId)) {
        state.activeGroupId = groups.length > 0 ? groups[0].id : null;
        needsBoardRedraw = true;
      }
    }

    // 4. Detect Activity Logs updates
    if (activitiesStr !== cache.activitiesStr) {
      state.activities = activities;
      cache.activitiesStr = activitiesStr;
      needsSidebarRedraw = true;
    }

    // Apply redraws selectively to avoid thrashing CSS styles/lagging inputs
    if (needsDropdownUpdate) {
      populateDropdowns();
      updateNavbarUserProfile();
    }
    if (needsBoardRedraw) {
      renderKanbanBoard();
    }
    if (needsSidebarRedraw) {
      renderSidebar();
    }

    // 5. If details modal is open, sync comment messages
    if (state.activeHomeworkId) {
      const chats = await fetch(`/api/chats/${state.activeHomeworkId}`).then(r => r.json());
      const chatsStr = JSON.stringify(chats);
      if (chatsStr !== cache.chatsStr) {
        cache.chatsStr = chatsStr;
        renderChatMessages(chats);
      }
    }

    // 6. If group chat modal is open, sync group messages
    if (state.groupChatOpen && state.activeGroupId) {
      const chats = await fetch(`/api/chats/${state.activeGroupId}`).then(r => r.json());
      const chatsStr = JSON.stringify(chats);
      if (chatsStr !== cache.groupChatsStr) {
        cache.groupChatsStr = chatsStr;
        renderGroupChatMessages(chats);
      }
    }

  } catch (error) {
    console.warn('Sync connection timed out. Retrying in next cycle...');
  }
}

// Compare current and previous homework sets to notify users of additions
function detectAndToastNewServerActivities(newHws, oldHws) {
  if (oldHws.length === 0) return; // Ignore startup syncs
  
  newHws.forEach(nh => {
    const oh = oldHws.find(o => o.id === nh.id);
    if (!oh) {
      // Homework added by someone else
      if (nh.createdBy !== state.loggedInUserId && nh.groupId === state.activeGroupId) {
        showToast('การบ้านถูกเพิ่มเข้ามาใหม่', `เพื่อนในกลุ่มเพิ่มการบ้าน: "${nh.title}"`, 'info');
        addNotification('มีงานเข้าใหม่!', `เพื่อนในกลุ่มเพิ่มการบ้าน "${nh.title}"`, nh.id);
      }
    } else if (oh.status !== nh.status) {
      // Homework status changed by someone else
      if (nh.groupId === state.activeGroupId) {
        const statusNames = { todo: 'ต้องทำ', progress: 'กำลังทำ', done: 'เสร็จสิ้น' };
        showToast('อัปเดตสถานะงานกลุ่ม', `การบ้าน "${nh.title}" ถูกย้ายไปที่ [${statusNames[nh.status]}]`, 'success');
      }
    }
  });
}

// Write activity log to server
async function logActivityToServer(type, hwTitle, details) {
  if (!state.loggedInUserId || !state.activeGroupId) return;

  try {
    const res = await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: state.activeGroupId,
        userId: state.loggedInUserId,
        type,
        hwTitle,
        details
      })
    });
    
    if (res.ok) {
      const newAct = await res.json();
      state.activities.unshift(newAct);
      cache.activitiesStr = JSON.stringify(state.activities);
      renderSidebar();
    }
  } catch (err) {
    console.error('Error logging activity:', err);
  }
}

// ==========================================================================
// 3. UI Helpers & Formatting
// ==========================================================================

function getUser(userId) {
  return state.users.find(u => u.id === userId) || { name: 'สมาชิกทั่วไป', avatarColor: '#64748b', status: 'offline' };
}

function getAvatarHTML(userId, sizeClass = '') {
  const user = getUser(userId);
  const initial = user.name.charAt(0);
  return `
    <div class="user-avatar ${sizeClass}" 
         style="background-color: ${user.avatarColor}; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;" 
         title="${user.name}">
      ${initial}
    </div>
  `;
}

function formatFriendlyDeadline(dueDateStr, dueTimeStr) {
  if (!dueDateStr) return 'ไม่กำหนดส่ง';
  
  const targetDate = new Date(`${dueDateStr}T${dueTimeStr || '00:00'}`);
  const now = new Date();
  const diffTime = targetDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const timeFormatted = dueTimeStr ? `${dueTimeStr} น.` : '';
  const formatOptions = { day: 'numeric', month: 'short', year: '2-digit' };
  const thaiFormattedDate = targetDate.toLocaleDateString('th-TH', formatOptions);

  if (diffTime < 0) {
    const overdueDays = Math.floor(Math.abs(diffTime) / (1000 * 60 * 60 * 24));
    if (overdueDays === 0) return `เลยกำหนดส่งแล้ววันนี้เมื่อ ${timeFormatted}`;
    return `เลยกำหนดส่ง ${overdueDays} วัน (${thaiFormattedDate})`;
  }

  if (diffDays === 1 && targetDate.getDate() === now.getDate()) {
    return `ส่งวันนี้ ภายใน ${timeFormatted}`;
  } else if (diffDays <= 2 && targetDate.getDate() === (now.getDate() + 1)) {
    return `ส่งพรุ่งนี้ ภายใน ${timeFormatted}`;
  } else if (diffDays <= 3) {
    return `อีก ${diffDays} วัน (${thaiFormattedDate} ${timeFormatted})`;
  }
  
  return `${thaiFormattedDate} เวลา ${timeFormatted}`;
}

function getDeadlineUrgency(dueDateStr, dueTimeStr) {
  if (!dueDateStr) return 'normal';
  
  const targetDate = new Date(`${dueDateStr}T${dueTimeStr || '00:00'}`);
  const now = new Date();
  const diffTime = targetDate - now;
  
  if (diffTime < 0) return 'overdue';
  if (diffTime <= 1000 * 60 * 60 * 48) return 'near';
  return 'normal';
}

function formatChatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getSubject(subjectId) {
  return state.subjects.find(s => s.id === subjectId) || { name: 'ทั่วไป', color: '#64748b' };
}

function showToast(title, desc, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconClass = 'fa-circle-info';
  if (type === 'success') iconClass = 'fa-circle-check';
  if (type === 'warning') iconClass = 'fa-triangle-exclamation';
  if (type === 'danger') iconClass = 'fa-circle-exclamation';

  toast.innerHTML = `
    <i class="fa-solid ${iconClass} toast-icon"></i>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-desc">${desc}</div>
    </div>
    <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());

  setTimeout(() => {
    toast.style.animation = 'toastIn 0.2s ease-out reverse forwards';
    setTimeout(() => toast.remove(), 200);
  }, 4000);

  container.appendChild(toast);
}

// ==========================================================================
// 4. UI Rendering Functions
// ==========================================================================

function populateDropdowns() {
  const groupSelect = document.getElementById('active-group-select');
  groupSelect.innerHTML = state.groups.map(g => 
    `<option value="${g.id}" ${g.id === state.activeGroupId ? 'selected' : ''}>${g.name}</option>`
  ).join('');

  if (state.groups.length === 0) {
    groupSelect.innerHTML = `<option value="">-- ยังไม่มีกลุ่มเรียน --</option>`;
  }

  const filterSubj = document.getElementById('filter-subject');
  filterSubj.innerHTML = `<option value="all">ทุกวิชา</option>` + state.subjects.map(s => 
    `<option value="${s.id}">${s.name}</option>`
  ).join('');

  const filterAssign = document.getElementById('filter-assignee');
  filterAssign.innerHTML = `<option value="all">ทุกคนที่ได้รับมอบหมาย</option>` + state.users.map(u => 
    `<option value="${u.id}">${u.name}</option>`
  ).join('');

  const formSubjSelect = document.getElementById('hw-subject');
  formSubjSelect.innerHTML = state.subjects.map(s => 
    `<option value="${s.id}">${s.name}</option>`
  ).join('');

  const assigneesContainer = document.getElementById('assignees-checkboxes');
  assigneesContainer.innerHTML = state.users.map(u => `
    <label class="checkbox-item" id="chk-label-${u.id}">
      <input type="checkbox" name="hw-assignees-check" value="${u.id}">
      <span>${u.name}</span>
    </label>
  `).join('');

  // Handle checked status class highlights for pills
  assigneesContainer.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', () => {
      const label = document.getElementById(`chk-label-${chk.value}`);
      if (label) {
        label.classList.toggle('checked', chk.checked);
      }
    });
  });
}

function updateNavbarUserProfile() {
  const currentAvatarDiv = document.getElementById('current-user-avatar');
  const currentNameSpan = document.getElementById('current-user-name');
  
  if (!state.loggedInUserId) return;

  const user = getUser(state.loggedInUserId);
  const initial = user.name.charAt(0);
  
  currentAvatarDiv.style.backgroundColor = user.avatarColor;
  currentAvatarDiv.innerHTML = initial;
  currentNameSpan.textContent = user.name;
}

function renderNotifications() {
  const notifCountBadge = document.getElementById('notif-count');
  const notifListDiv = document.getElementById('notif-list');
  
  const unreadCount = state.notifs.filter(n => n.unread).length;
  notifCountBadge.textContent = unreadCount;
  notifCountBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
  
  if (state.notifs.length === 0) {
    notifListDiv.innerHTML = `<div class="empty-notif">ไม่มีการแจ้งเตือนการบ้านในขณะนี้</div>`;
    return;
  }
  
  notifListDiv.innerHTML = state.notifs.map(n => {
    const timeStr = new Date(n.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="notif-item ${n.unread ? 'unread' : ''}" data-id="${n.id}" onclick="handleNotifClick('${n.hwId}', '${n.id}')">
        <div class="notif-item-title">${n.title}</div>
        <div class="notif-item-desc">${n.desc}</div>
        <div class="notif-item-time">${timeStr}</div>
      </div>
    `;
  }).join('');
}

function renderSidebar() {
  // 1. Members list
  const friendsList = document.getElementById('friends-list');
  if (state.users.length === 0) {
    friendsList.innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted); padding:4px 0;">ยังไม่มีสมาชิกลงทะเบียน</div>`;
  } else {
    friendsList.innerHTML = state.users.map(u => {
      const isCurrentUser = u.id === state.loggedInUserId;
      const displayName = isCurrentUser ? `${u.name} (คุณ)` : u.name;
      const statusText = u.status === 'online' ? 'ออนไลน์' : 'ออฟไลน์';
      
      return `
        <div class="friend-item">
          <div class="friend-info">
            <div class="friend-avatar-wrapper">
              <div class="friend-avatar" style="background-color: ${u.avatarColor}; display:flex; align-items:center; justify-content:center; color:white; font-size: 0.8rem; font-weight:700;">
                ${u.name.charAt(0)}
              </div>
              <span class="status-dot ${u.status === 'online' ? 'online' : 'offline'}"></span>
            </div>
            <div>
              <div class="friend-name">${displayName}</div>
              <div class="friend-status-text">${statusText}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 2. Scoreboard (Leaderboard)
  const leaderboardDiv = document.getElementById('leaderboard-list');
  
  const userScores = state.users.map(u => {
    const score = state.homeworks.filter(hw => 
      hw.groupId === state.activeGroupId && 
      hw.status === 'done' && 
      hw.assignees.includes(u.id)
    ).length;
    return { name: u.name, score };
  });

  userScores.sort((a, b) => b.score - a.score);

  if (userScores.length === 0) {
    leaderboardDiv.innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted); padding:4px 0;">ไม่มีสถิติที่เสร็จสมบูรณ์</div>`;
  } else {
    leaderboardDiv.innerHTML = userScores.map((u, index) => `
      <div class="leaderboard-item">
        <div class="leaderboard-rank-wrapper">
          <span class="rank-badge">${index + 1}</span>
          <span class="leaderboard-name">${u.name}</span>
        </div>
        <span class="score-badge">${u.score} ชิ้นเสร็จ</span>
      </div>
    `).join('');
  }

  // 3. Activity Feed widget
  const feedDiv = document.getElementById('activity-feed');
  const groupActs = state.activities.filter(a => a.groupId === state.activeGroupId);
  
  if (groupActs.length === 0) {
    feedDiv.innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:16px;">ยังไม่มีความเคลื่อนไหวในกลุ่มนี้</div>`;
    return;
  }

  feedDiv.innerHTML = groupActs.slice(0, 15).map(a => {
    const actor = getUser(a.userId);
    const actionTime = formatChatTime(a.timestamp);
    let itemClass = 'act-info';
    if (a.type === 'add') itemClass = 'act-add';
    if (a.type === 'status') itemClass = 'act-done';
    if (a.type === 'comment') itemClass = 'act-chat';

    return `
      <div class="activity-item ${itemClass}">
        <div class="activity-content">
          <span class="activity-text">
            <strong>${actor.name}</strong> ${a.details} 
            <span style="color:#c084fc;">"${a.hwTitle}"</span>
          </span>
          <span class="activity-time">${actionTime} น.</span>
        </div>
      </div>
    `;
  }).join('');
}

// Render Core Kanban Board (Filters & Render Cards)
function renderKanbanBoard() {
  const listTodo = document.getElementById('list-todo');
  const listProgress = document.getElementById('list-progress');
  const listDone = document.getElementById('list-done');

  if (state.groups.length === 0) {
    document.getElementById('group-title').textContent = 'กรุณาสร้างกลุ่มการบ้านใหม่';
    listTodo.innerHTML = `<div class="empty-notif">สร้างกลุ่มใหม่ที่แถบเมนูด้านบนเพื่อเริ่มใช้งาน</div>`;
    listProgress.innerHTML = '';
    listDone.innerHTML = '';
    
    document.getElementById('count-todo').textContent = '0';
    document.getElementById('count-progress').textContent = '0';
    document.getElementById('count-done').textContent = '0';
    updateDashboardStats();
    return;
  }

  listTodo.innerHTML = '';
  listProgress.innerHTML = '';
  listDone.innerHTML = '';

  let hws = state.homeworks.filter(h => h.groupId === state.activeGroupId);

  if (state.searchQuery.trim() !== '') {
    const q = state.searchQuery.toLowerCase();
    hws = hws.filter(h => h.title.toLowerCase().includes(q) || h.description.toLowerCase().includes(q));
  }

  if (state.filterSubject !== 'all') {
    hws = hws.filter(h => h.subjectId === state.filterSubject);
  }

  if (state.filterPriority !== 'all') {
    hws = hws.filter(h => h.priority === state.filterPriority);
  }

  if (state.filterAssignee !== 'all') {
    hws = hws.filter(h => h.assignees.includes(state.filterAssignee));
  }

  let countTodo = 0;
  let countProgress = 0;
  let countDone = 0;

  let todoHTML = '';
  let progressHTML = '';
  let doneHTML = '';

  hws.forEach(hw => {
    const subject = getSubject(hw.subjectId);
    const dateFriendly = formatFriendlyDeadline(hw.dueDate, hw.dueTime);
    const urgency = getDeadlineUrgency(hw.dueDate, hw.dueTime);

    let urgencyClass = '';
    let glowClass = '';
    if (urgency === 'overdue' && hw.status !== 'done') {
      urgencyClass = 'overdue';
      glowClass = 'urgent-glowing';
    } else if (urgency === 'near' && hw.status !== 'done') {
      urgencyClass = 'near-due';
    }

    const assigneesAvatarsHTML = hw.assignees.map(uid => getAvatarHTML(uid, 'mini-avatar')).join('');

    const cardHTML = `
      <div class="hw-card prio-${hw.priority} ${glowClass}" 
           draggable="true" 
           data-id="${hw.id}" 
           id="card-${hw.id}">
        <div class="hw-card-header">
          <span class="hw-subject-badge" style="background-color: rgba(${hexToRgb(subject.color)}, 0.12); color: ${subject.color};">
            ${subject.name}
          </span>
          <span class="hw-prio-dot ${hw.priority}" title="ความสำคัญ: ${hw.priority}"></span>
        </div>
        <div class="hw-card-body">
          <h3>${escapeHTML(hw.title)}</h3>
          <p>${escapeHTML(hw.description || 'ไม่มีรายละเอียดเพิ่มเติม')}</p>
        </div>
        <div class="hw-card-footer" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <span class="hw-due-info ${urgencyClass}" style="flex-shrink: 0;">
            <i class="fa-regular fa-clock"></i> ${dateFriendly}
          </span>
          <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            <span class="hw-card-chat-badge" data-id="${hw.id}" title="เปิดคุยงานแชทกลุ่ม" style="cursor: pointer; font-size: 0.75rem; color: var(--text-secondary); background: rgba(255, 255, 255, 0.05); padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; transition: var(--transition-fast);">
              <i class="fa-regular fa-comment"></i> ${hw.commentsCount || 0}
            </span>
            <div class="hw-assignees" style="margin-top: 0;">
              ${assigneesAvatarsHTML}
            </div>
          </div>
        </div>
      </div>
    `;

    if (hw.status === 'todo') {
      todoHTML += cardHTML;
      countTodo++;
    } else if (hw.status === 'progress') {
      progressHTML += cardHTML;
      countProgress++;
    } else if (hw.status === 'done') {
      doneHTML += cardHTML;
      countDone++;
    }
  });

  listTodo.innerHTML = todoHTML || `<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:16px; width:100%;">ไม่มีงาน</div>`;
  listProgress.innerHTML = progressHTML || `<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:16px; width:100%;">ไม่มีงาน</div>`;
  listDone.innerHTML = doneHTML || `<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:16px; width:100%;">ไม่มีงาน</div>`;

  document.getElementById('count-todo').textContent = countTodo;
  document.getElementById('count-progress').textContent = countProgress;
  document.getElementById('count-done').textContent = countDone;

  setupCardEvents();
  updateDashboardStats();
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? 
    `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` 
    : '255, 255, 255';
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function setupCardEvents() {
  document.querySelectorAll('.hw-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.mini-avatar')) return;
      if (e.target.closest('.hw-card-chat-badge')) return;
      const hwId = card.getAttribute('data-id');
      openHomeworkDetails(hwId);
    });

  document.querySelectorAll('.hw-card-chat-badge').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const hwId = badge.getAttribute('data-id');
      openHomeworkDetails(hwId, true);
    });
  });

    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
      card.style.opacity = '0.4';
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.style.opacity = '1';
      card.classList.remove('dragging');
    });
  });
}

function updateDashboardStats() {
  if (state.groups.length === 0) {
    document.getElementById('stat-pending').textContent = '0';
    document.getElementById('stat-urgent').textContent = '0';
    document.getElementById('stat-ratio').textContent = '0 จาก 0 ชิ้น';
    document.getElementById('stat-progress-percent').textContent = '0%';
    const circle = document.getElementById('stat-progress-circle');
    if (circle) circle.style.strokeDashoffset = '251.2';
    return;
  }

  const activeGroupHws = state.homeworks.filter(h => h.groupId === state.activeGroupId);
  const total = activeGroupHws.length;
  const done = activeGroupHws.filter(h => h.status === 'done').length;
  const pending = total - done;

  const urgent = activeGroupHws.filter(h => 
    h.status !== 'done' && 
    getDeadlineUrgency(h.dueDate, h.dueTime) === 'near'
  ).length;

  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-urgent').textContent = urgent;
  
  document.getElementById('stat-ratio').textContent = `${done} จาก ${total} ชิ้น`;

  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById('stat-progress-percent').textContent = `${percent}%`;

  const circle = document.getElementById('stat-progress-circle');
  if (circle) {
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDashoffset = offset;
  }
  
  const currentGroup = state.groups.find(g => g.id === state.activeGroupId);
  if (currentGroup) {
    document.getElementById('group-title').textContent = currentGroup.name;
  }

  // Update welcoming greeting subtitle dynamically
  if (state.loggedInUserId) {
    const me = getUser(state.loggedInUserId);
    const greetingEl = document.getElementById('dashboard-user-greeting');
    if (greetingEl) {
      if (state.groups.length === 0) {
        greetingEl.innerHTML = `สวัสดี, <strong>${me.name}</strong>! เริ่มสร้างกลุ่มเรียนแรกเพื่อใช้งานบอร์ดการบ้านกับกลุ่มเพื่อนของคุณ`;
      } else {
        greetingEl.innerHTML = `สวัสดี, <strong>${me.name}</strong>! วันนี้ในกลุ่มเรียนมีงานที่ยังไม่เสร็จทั้งหมด <strong>${pending}</strong> ชิ้น`;
      }
    }
  }
}

function setupDragAndDrop() {
  const columns = document.querySelectorAll('.kanban-column');
  
  columns.forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
    });

    col.addEventListener('dragleave', () => {
      col.classList.remove('drag-over');
    });

    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const hwId = e.dataTransfer.getData('text/plain');
      const newStatus = col.getAttribute('data-status');
      
      handleHomeworkStatusChange(hwId, newStatus);
    });
  });
}

// PUT homework status to server
async function handleHomeworkStatusChange(hwId, newStatus) {
  const hw = state.homeworks.find(h => h.id === hwId);
  if (!hw) return;

  const oldStatus = hw.status;
  if (oldStatus === newStatus) return;

  try {
    const res = await fetch(`/api/homeworks/${hwId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    if (res.ok) {
      const updatedHw = await res.json();
      
      // Update local state
      const idx = state.homeworks.findIndex(h => h.id === hwId);
      if (idx !== -1) state.homeworks[idx] = updatedHw;
      cache.homeworksStr = JSON.stringify(state.homeworks);

      const statusTexts = { todo: 'ต้องทำ', progress: 'กำลังทำ', done: 'เสร็จสมบูรณ์' };
      await logActivityToServer('status', hw.title, `เปลี่ยนสถานะเป็น ${statusTexts[newStatus]}`);
      showToast('อัปเดตสถานะสำเร็จ', `ย้าย "${hw.title}" ไปที่ "${statusTexts[newStatus]}"`, 'success');
      
      renderKanbanBoard();
    }
  } catch (err) {
    showToast('ปรับปรุงข้อมูลล้มเหลว', 'เกิดข้อผิดพลาดในการบันทึกสถานะงาน', 'danger');
  }
}

// ==========================================================================
// 5. Modals Management
// ==========================================================================

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('show');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('show');
}

document.querySelectorAll('.modal-overlay').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
      if (modal.id === 'group-chat-modal') {
        state.groupChatOpen = false;
      }
      if (modal.id === 'detail-modal') {
        state.activeHomeworkId = null;
      }
    }
  });
});

function setupModalButtons() {
  // Add Homework modal
  document.getElementById('add-homework-btn').addEventListener('click', () => {
    if (state.groups.length === 0) {
      showToast('ไม่สามารถจดการบ้านได้', 'กรุณาสร้างกลุ่มการบ้านอย่างน้อย 1 กลุ่มก่อนจดการบ้าน', 'warning');
      return;
    }

    document.getElementById('homework-form').reset();
    document.getElementById('homework-id-input').value = '';
    document.getElementById('modal-title').textContent = 'จดการบ้านชิ้นใหม่';
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const pad = (n) => String(n).padStart(2, '0');
    document.getElementById('hw-due-date').value = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth()+1)}-${pad(tomorrow.getDate())}`;
    
    // Reset checked states visually
    const checkboxes = document.getElementsByName('hw-assignees-check');
    checkboxes.forEach(chk => {
      chk.checked = false;
      const label = document.getElementById(`chk-label-${chk.value}`);
      if (label) label.classList.remove('checked');
    });

    openModal('homework-modal');
  });
  document.getElementById('close-homework-modal-btn').addEventListener('click', () => closeModal('homework-modal'));
  document.getElementById('cancel-homework-btn').addEventListener('click', () => closeModal('homework-modal'));

  // Add Subject modal
  document.getElementById('create-subject-btn').addEventListener('click', () => {
    document.getElementById('subject-form').reset();
    openModal('subject-modal');
  });
  document.getElementById('close-subject-modal-btn').addEventListener('click', () => closeModal('subject-modal'));
  document.getElementById('cancel-subject-btn').addEventListener('click', () => closeModal('subject-modal'));

  // Add Group modal
  document.getElementById('add-group-btn').addEventListener('click', () => {
    document.getElementById('group-form').reset();
    openModal('group-modal');
  });
  document.getElementById('close-group-modal-btn').addEventListener('click', () => closeModal('group-modal'));
  document.getElementById('cancel-group-btn').addEventListener('click', () => closeModal('group-modal'));

  // Detail view modal
  document.getElementById('close-detail-modal-btn').addEventListener('click', () => {
    closeModal('detail-modal');
    state.activeHomeworkId = null;
  });

  document.getElementById('edit-homework-btn').addEventListener('click', () => {
    if (!state.activeHomeworkId) return;
    closeModal('detail-modal');
    fillAndOpenEditHomeworkModal(state.activeHomeworkId);
  });

  document.getElementById('delete-homework-btn').addEventListener('click', async () => {
    if (!state.activeHomeworkId) return;
    if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบการบ้านชิ้นนี้? เพื่อนๆ ในกลุ่มจะไม่เห็นการบ้านนี้แล้วนะ')) {
      const hw = state.homeworks.find(h => h.id === state.activeHomeworkId);
      
      try {
        const res = await fetch(`/api/homeworks/${state.activeHomeworkId}`, { method: 'DELETE' });
        if (res.ok) {
          state.homeworks = state.homeworks.filter(h => h.id !== state.activeHomeworkId);
          cache.homeworksStr = JSON.stringify(state.homeworks);

          await logActivityToServer('delete', hw.title, 'ลบการบ้านออก');
          showToast('ลบการบ้านแล้ว', `ลบการบ้าน "${hw.title}" ออกจากกลุ่ม`, 'danger');
          
          closeModal('detail-modal');
          state.activeHomeworkId = null;
          renderKanbanBoard();
        }
      } catch (err) {
        showToast('ลบไม่สำเร็จ', 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'danger');
      }
    }
  });

  // Mobile Tabs inside Details Modal
  const btnTabInfo = document.getElementById('btn-detail-tab-info');
  const btnTabChat = document.getElementById('btn-detail-tab-chat');
  const detailWrapper = document.getElementById('detail-content-wrapper');

  btnTabInfo.addEventListener('click', () => {
    btnTabInfo.classList.add('active');
    btnTabChat.classList.remove('active');
    detailWrapper.classList.add('show-info');
    detailWrapper.classList.remove('show-chat');
  });

  btnTabChat.addEventListener('click', () => {
    btnTabChat.classList.add('active');
    btnTabInfo.classList.remove('active');
    detailWrapper.classList.add('show-chat');
    detailWrapper.classList.remove('show-info');
    
    // Scroll chat messages to bottom now that it's visible
    const container = document.getElementById('chat-messages-container');
    if (container) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 50);
    }
  });

  // Mobile Specific Open Chat button action
  const btnMobileOpenChat = document.getElementById('btn-mobile-open-chat');
  if (btnMobileOpenChat) {
    btnMobileOpenChat.addEventListener('click', () => {
      btnTabChat.click();
    });
  }


  // Attach link inside chat
  document.getElementById('attach-link-btn').addEventListener('click', () => {
    document.getElementById('link-url-input').value = 'https://';
    document.getElementById('link-label-input').value = 'แชร์ลิ้งก์ส่งงาน/สรุป';
    openModal('link-attach-modal');
  });
  document.getElementById('close-link-modal-btn').addEventListener('click', () => closeModal('link-attach-modal'));
  document.getElementById('cancel-link-btn').addEventListener('click', () => closeModal('link-attach-modal'));
  document.getElementById('save-link-btn').addEventListener('click', handleSaveAttachedLink);
  document.getElementById('remove-attach-btn').addEventListener('click', handleRemoveAttachedLink);

  // Profile Dropdown Actions
  const profileMenuBtn = document.getElementById('user-profile-menu-btn');
  profileMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    profileMenuBtn.classList.toggle('open');
  });

  document.getElementById('manage-account-btn-dropdown').addEventListener('click', (e) => {
    e.stopPropagation();
    profileMenuBtn.classList.remove('open');
    openAccountManagementModal();
  });

  document.getElementById('logout-btn-dropdown').addEventListener('click', (e) => {
    e.stopPropagation();
    profileMenuBtn.classList.remove('open');
    handleLogout();
  });

  document.getElementById('close-account-modal-btn').addEventListener('click', () => closeModal('account-modal'));
  document.getElementById('cancel-account-btn').addEventListener('click', () => closeModal('account-modal'));
  document.getElementById('delete-account-btn').addEventListener('click', handleDeleteAccount);

  // Group Chat Modal Triggers
  const openGroupChat = async () => {
    if (!state.activeGroupId) {
      showToast('กรุณาเลือกกลุ่มก่อน', 'ไม่สามารถคุยแชทห้องเรียนได้หากไม่มีกลุ่มการบ้าน', 'warning');
      return;
    }
    const group = state.groups.find(g => g.id === state.activeGroupId);
    if (!group) return;

    const modalTitle = document.getElementById('group-chat-title-text');
    if (modalTitle) modalTitle.innerHTML = `<i class="fa-regular fa-comments"></i> ห้องแชทกลุ่ม: ${escapeHTML(group.name)}`;
    
    state.groupChatOpen = true;

    try {
      const chats = await fetch(`/api/chats/${state.activeGroupId}`).then(r => r.json());
      cache.groupChatsStr = JSON.stringify(chats);
      renderGroupChatMessages(chats);
    } catch (err) {
      console.error('Error fetching group chats:', err);
    }

    handleRemoveGroupAttachedLink();
    openModal('group-chat-modal');
  };

  const btnNavbarGroupChat = document.getElementById('open-group-chat-btn');
  if (btnNavbarGroupChat) {
    btnNavbarGroupChat.addEventListener('click', openGroupChat);
  }

  const btnDashboardGroupChat = document.getElementById('dashboard-group-chat-btn');
  if (btnDashboardGroupChat) {
    btnDashboardGroupChat.addEventListener('click', openGroupChat);
  }

  document.getElementById('close-group-chat-modal-btn').addEventListener('click', () => {
    closeModal('group-chat-modal');
    state.groupChatOpen = false;
  });

  const btnGroupChatAttachLink = document.getElementById('group-chat-attach-link-btn');
  if (btnGroupChatAttachLink) {
    btnGroupChatAttachLink.addEventListener('click', () => {
      document.getElementById('link-url-input').value = 'https://';
      document.getElementById('link-label-input').value = 'แชร์ลิงก์ส่งงาน/สรุป';
      openModal('link-attach-modal');
    });
  }

  const btnGroupChatRemoveAttach = document.getElementById('group-chat-remove-attach-btn');
  if (btnGroupChatRemoveAttach) {
    btnGroupChatRemoveAttach.addEventListener('click', handleRemoveGroupAttachedLink);
  }

  // POST Group Chat Message
  const groupChatSendForm = document.getElementById('group-chat-send-form');
  if (groupChatSendForm) {
    groupChatSendForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('group-chat-input');
      const text = input.value.trim();
      
      if (text === '' && !state.activeGroupAttachLink) return;
      if (!state.activeGroupId || !state.loggedInUserId) return;

      const payload = {
        homeworkId: state.activeGroupId,
        senderId: state.loggedInUserId,
        text: text || `แชร์ลิงก์: ${state.activeGroupAttachLink.label}`,
        link: state.activeGroupAttachLink
      };

      try {
        const res = await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const newMsg = await res.json();
          
          if (!state.chats[state.activeGroupId]) {
            state.chats[state.activeGroupId] = [];
          }
          state.chats[state.activeGroupId].push(newMsg);
          cache.groupChatsStr = JSON.stringify(state.chats[state.activeGroupId]);

          const group = state.groups.find(g => g.id === state.activeGroupId);
          await logActivityToServer('comment', group.name, 'แสดงความคิดเห็นในห้องเรียน');
          
          input.value = '';
          handleRemoveGroupAttachedLink();
          renderGroupChatMessages(state.chats[state.activeGroupId]);
        }
      } catch (err) {
        showToast('ส่งแชทไม่สำเร็จ', 'ไม่สามารถคุยงานได้ชั่วคราวเนื่องจากปัญหาทางเครือข่าย', 'danger');
      }
    });
  }

  document.addEventListener('click', () => {
    profileMenuBtn.classList.remove('open');
  });
}

async function openHomeworkDetails(hwId, openChatDirectly = false) {
  const hw = state.homeworks.find(h => h.id === hwId);
  if (!hw) return;

  state.activeHomeworkId = hwId;
  
  // Reset mobile tabs based on selection
  const btnTabInfo = document.getElementById('btn-detail-tab-info');
  const btnTabChat = document.getElementById('btn-detail-tab-chat');
  const detailWrapper = document.getElementById('detail-content-wrapper');
  if (btnTabInfo && btnTabChat && detailWrapper) {
    if (openChatDirectly) {
      btnTabChat.classList.add('active');
      btnTabInfo.classList.remove('active');
      detailWrapper.classList.add('show-chat');
      detailWrapper.classList.remove('show-info');
      setTimeout(() => {
        const container = document.getElementById('chat-messages-container');
        if (container) container.scrollTop = container.scrollHeight;
      }, 50);
    } else {
      btnTabInfo.classList.add('active');
      btnTabChat.classList.remove('active');
      detailWrapper.classList.add('show-info');
      detailWrapper.classList.remove('show-chat');
    }
  }
  
  const subject = getSubject(hw.subjectId);
  const detailHeader = document.getElementById('detail-subject-header');
  detailHeader.style.setProperty('--bg-subject', subject.color);

  document.getElementById('detail-subject-tag').textContent = subject.name;
  document.getElementById('detail-title').textContent = hw.title;
  
  const formattedDue = formatFriendlyDeadline(hw.dueDate, hw.dueTime);
  document.getElementById('detail-due').innerHTML = `<i class="fa-regular fa-calendar"></i> กำหนดส่ง: ${formattedDue}`;

  const prioLabels = { high: 'สูงมาก (ส่งด่วน)', medium: 'ปานกลาง', low: 'ต่ำ' };
  const detailPriority = document.getElementById('detail-priority');
  detailPriority.textContent = prioLabels[hw.priority];
  detailPriority.className = `meta-value prio-${hw.priority}`;

  document.getElementById('detail-desc').textContent = hw.description || 'ไม่มีรายละเอียดเพิ่มเติม';
  
  const statusSelect = document.getElementById('detail-status-select');
  statusSelect.value = hw.status;
  
  statusSelect.onchange = (e) => {
    handleHomeworkStatusChange(hw.id, e.target.value);
  };

  const assigneesContainer = document.getElementById('detail-assignees');
  assigneesContainer.innerHTML = hw.assignees.map(uid => {
    const u = getUser(uid);
    return `
      <div class="detail-assignee-card">
        <div class="avatar" style="background-color: ${u.avatarColor}; width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:0.6rem; font-weight:700;">
          ${u.name.charAt(0)}
        </div>
        <span>${u.name}</span>
      </div>
    `;
  }).join('');

  try {
    const chats = await fetch(`/api/chats/${hwId}`).then(r => r.json());
    cache.chatsStr = JSON.stringify(chats);
    renderChatMessages(chats);
  } catch (err) {
    console.error('Error fetching chats:', err);
  }

  handleRemoveAttachedLink();
  openModal('detail-modal');
}

function renderChatMessages(msgs = []) {
  const container = document.getElementById('chat-messages-container');
  if (!container || !state.activeHomeworkId) return;

  // Update chat badge count on mobile tab
  const badge = document.getElementById('detail-chat-count-badge');
  if (badge) badge.textContent = msgs.length;
  
  if (msgs.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 32px 16px;">
        <i class="fa-regular fa-comment-dots" style="font-size: 2rem; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
        ยังไม่มีบันทึกข้อความสำหรับงานนี้<br>คุย แนะนำ หรือแชร์เฉลยการบ้านกับเพื่อนเลย!
      </div>
    `;
    return;
  }

  let messagesHTML = '';
  msgs.forEach(m => {
    const isMine = m.senderId === state.loggedInUserId;
    const sender = getUser(m.senderId);
    const bubbleClass = isMine ? 'mine' : '';
    const sentTime = formatChatTime(m.timestamp);

    let linkHTML = '';
    if (m.link && m.link.url) {
      linkHTML = `
        <a href="${m.link.url}" target="_blank" class="chat-msg-link">
          <i class="fa-solid fa-link"></i> ${escapeHTML(m.link.label || 'เปิดลิงก์ที่แนบ')}
        </a>
      `;
    }

    messagesHTML += `
      <div class="chat-bubble ${bubbleClass}">
        <div class="chat-bubble-avatar" style="background-color: ${sender.avatarColor}; display:flex; align-items:center; justify-content:center; color:white; font-size: 0.8rem; font-weight:700;">
          ${sender.name.charAt(0)}
        </div>
        <div class="chat-bubble-content">
          <span class="chat-sender-name">${sender.name}</span>
          <div class="chat-msg-text-wrapper">
            <div>${escapeHTML(m.text)}</div>
            ${linkHTML}
          </div>
          <span class="chat-msg-time">${sentTime} น.</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = messagesHTML;
  container.scrollTop = container.scrollHeight;
}

function fillAndOpenEditHomeworkModal(hwId) {
  const hw = state.homeworks.find(h => h.id === hwId);
  if (!hw) return;

  document.getElementById('homework-id-input').value = hw.id;
  document.getElementById('hw-title').value = hw.title;
  document.getElementById('hw-subject').value = hw.subjectId;
  document.getElementById('hw-priority').value = hw.priority;
  document.getElementById('hw-due-date').value = hw.dueDate;
  document.getElementById('hw-due-time').value = hw.dueTime;
  document.getElementById('hw-desc').value = hw.description || '';

  const checkboxes = document.getElementsByName('hw-assignees-check');
  checkboxes.forEach(chk => {
    chk.checked = hw.assignees.includes(chk.value);
    const label = document.getElementById(`chk-label-${chk.value}`);
    if (label) {
      label.classList.toggle('checked', chk.checked);
    }
  });

  document.getElementById('modal-title').textContent = 'แก้ไขข้อมูลการบ้าน';
  openModal('homework-modal');
}

function handleSaveAttachedLink() {
  const url = document.getElementById('link-url-input').value.trim();
  const label = document.getElementById('link-label-input').value.trim() || 'แชร์ลิงก์';
  
  if (url === '' || url === 'https://') {
    alert('กรุณากรอก URL ลิงก์ที่ถูกต้อง');
    return;
  }

  if (state.groupChatOpen) {
    state.activeGroupAttachLink = { url, label };
    const previewDiv = document.getElementById('group-chat-attached-link-preview');
    const previewText = document.getElementById('group-chat-attached-link-text');
    if (previewText) previewText.textContent = `📎 ${label}`;
    if (previewDiv) previewDiv.classList.remove('hidden');
  } else {
    state.activeAttachLink = { url, label };
    const previewDiv = document.getElementById('attached-link-preview');
    const previewText = document.getElementById('attached-link-text');
    if (previewText) previewText.textContent = `📎 ${label}`;
    if (previewDiv) previewDiv.classList.remove('hidden');
  }
  
  closeModal('link-attach-modal');
}

function handleRemoveAttachedLink() {
  state.activeAttachLink = null;
  const previewDiv = document.getElementById('attached-link-preview');
  if (previewDiv) previewDiv.classList.add('hidden');
}

function handleRemoveGroupAttachedLink() {
  state.activeGroupAttachLink = null;
  const previewDiv = document.getElementById('group-chat-attached-link-preview');
  if (previewDiv) previewDiv.classList.add('hidden');
}

function renderGroupChatMessages(msgs = []) {
  const container = document.getElementById('group-chat-messages-container');
  if (!container || !state.activeGroupId) return;

  if (msgs.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 32px 16px;">
        <i class="fa-regular fa-comment-dots" style="font-size: 2rem; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
        ยังไม่มีการพูดคุยกันในห้องเรียนนี้<br>ส่งข้อความทักทาย แชร์ไฟล์การเรียน หรือพูดคุยกับเพื่อนเลย!
      </div>
    `;
    return;
  }

  let messagesHTML = '';
  msgs.forEach(m => {
    const isMine = m.senderId === state.loggedInUserId;
    const sender = getUser(m.senderId);
    const bubbleClass = isMine ? 'mine' : '';
    const sentTime = formatChatTime(m.timestamp);

    let linkHTML = '';
    if (m.link && m.link.url) {
      linkHTML = `
        <a href="${m.link.url}" target="_blank" class="chat-msg-link">
          <i class="fa-solid fa-link"></i> ${escapeHTML(m.link.label || 'เปิดลิงก์ที่แนบ')}
        </a>
      `;
    }

    messagesHTML += `
      <div class="chat-bubble ${bubbleClass}">
        <div class="chat-bubble-avatar" style="background-color: ${sender.avatarColor}; display:flex; align-items:center; justify-content:center; color:white; font-size: 0.8rem; font-weight:700;">
          ${sender.name.charAt(0)}
        </div>
        <div class="chat-bubble-content">
          <span class="chat-sender-name">${sender.name}</span>
          <div class="chat-msg-text-wrapper">
            <div>${escapeHTML(m.text)}</div>
            ${linkHTML}
          </div>
          <span class="chat-msg-time">${sentTime} น.</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = messagesHTML;
  container.scrollTop = container.scrollHeight;
}

function handleNotifClick(hwId, notifId) {
  const notif = state.notifs.find(n => n.id === notifId);
  if (notif) notif.unread = false;
  
  document.getElementById('notif-dropdown').classList.remove('show');
  
  renderNotifications();
  
  if (hwId) {
    openHomeworkDetails(hwId);
  }
}

// ==========================================================================
// 6. REAL AUTHENTICATION ENGINE (Server REST API integration)
// ==========================================================================

function setupAuthTabs() {
  const tabLogin = document.getElementById('tab-login-btn');
  const tabRegister = document.getElementById('tab-register-btn');
  const formLogin = document.getElementById('login-form');
  const formRegister = document.getElementById('register-form');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.classList.remove('hidden');
    formRegister.classList.add('hidden');
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.classList.remove('hidden');
    formLogin.classList.add('hidden');
  });
}

// POST login request
async function handleLoginSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (res.ok) {
      const user = await res.json();
      state.loggedInUserId = user.id;
      localStorage.setItem('hwspace_logged_in_user', user.id);
      
      // Load and switch view
      await loadDataFromServer();
      enterAppView();
      showToast('เข้าสู่ระบบสำเร็จ', `ยินดีต้อนรับกลับมา, คุณ ${user.name}!`, 'success');
    } else {
      const err = await res.json();
      showToast('เข้าสู่ระบบล้มเหลว', err.error || 'ชื่อหรือรหัสผ่านไม่ถูกต้อง', 'danger');
    }
  } catch (err) {
    showToast('การเชื่อมต่อล้มเหลว', 'เกิดข้อผิดพลาดในการติดต่อกับฐานข้อมูล', 'danger');
  }
}

// POST register request
async function handleRegisterSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('register-username').value.trim();
  const name = document.getElementById('register-name').value.trim();
  const password = document.getElementById('register-password').value;
  const avatarColor = document.querySelector('input[name="reg-avatar-color"]:checked').value;

  if (username.length < 3) {
    showToast('กรอกข้อมูลไม่ถูกต้อง', 'ชื่อผู้ใช้ต้องมีความยาวอย่างน้อย 3 ตัวอักษร', 'warning');
    return;
  }
  if (password.length < 4) {
    showToast('กรอกข้อมูลไม่ถูกต้อง', 'รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, name, password, avatarColor })
    });

    if (res.ok) {
      const user = await res.json();
      state.loggedInUserId = user.id;
      localStorage.setItem('hwspace_logged_in_user', user.id);
      
      document.getElementById('register-form').reset();
      
      await loadDataFromServer();
      enterAppView();
      showToast('สมัครสมาชิกสำเร็จ', `ยินดีต้อนรับสมาชิกใหม่, คุณ ${user.name}!`, 'success');
    } else {
      const err = await res.json();
      showToast('สมัครสมาชิกไม่สำเร็จ', err.error || 'กรุณาลองเปลี่ยนชื่อผู้ใช้งานใหม่', 'warning');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อระบบเซิร์ฟเวอร์ได้ในขณะนี้', 'danger');
  }
}

// POST logout request
async function handleLogout() {
  if (!state.loggedInUserId) return;

  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: state.loggedInUserId })
    });
  } catch (err) {
    // Ignore offline logout errors
  }

  state.loggedInUserId = null;
  localStorage.removeItem('hwspace_logged_in_user');
  
  exitAppView();
  showToast('ออกจากระบบแล้ว', 'คุณได้ทำการออกจากระบบเรียบร้อยแล้ว', 'info');
}

function enterAppView() {
  document.getElementById('auth-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');
  
  populateDropdowns();
  updateNavbarUserProfile();
  renderKanbanBoard();
  renderSidebar();
  renderNotifications();
}

function exitAppView() {
  document.getElementById('app-view').classList.add('hidden');
  document.getElementById('auth-view').classList.remove('hidden');
  
  document.getElementById('login-form').reset();
  document.getElementById('register-form').reset();

  if (state.users.length === 0) {
    document.getElementById('tab-register-btn').click();
  } else {
    document.getElementById('tab-login-btn').click();
  }
}

// ==========================================================================
// 7. ACCOUNT MANAGEMENT ENGINE (Edit Profile, Delete Profile)
// ==========================================================================

function openAccountManagementModal() {
  if (!state.loggedInUserId) return;

  const user = getUser(state.loggedInUserId);
  
  document.getElementById('account-username').value = user.username;
  document.getElementById('account-name').value = user.name;
  document.getElementById('account-new-password').value = '';

  const radios = document.getElementsByName('acc-avatar-color');
  radios.forEach(rad => {
    rad.checked = (rad.value === user.avatarColor);
  });

  openModal('account-modal');
}

// PUT user update request
async function handleAccountSettingsSubmit(e) {
  e.preventDefault();
  if (!state.loggedInUserId) return;

  const name = document.getElementById('account-name').value.trim();
  const newPassword = document.getElementById('account-new-password').value;
  const avatarColor = document.querySelector('input[name="acc-avatar-color"]:checked').value;

  if (name === '') {
    alert('กรุณากรอกชื่อแสดงผล');
    return;
  }

  const payload = { name, avatarColor };
  if (newPassword.trim() !== '') {
    if (newPassword.length < 4) {
      showToast('อัปเดตล้มเหลว', 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร', 'warning');
      return;
    }
    payload.password = newPassword;
  }

  try {
    const res = await fetch(`/api/users/${state.loggedInUserId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const updatedUser = await res.json();
      
      // Update local state list
      const idx = state.users.findIndex(u => u.id === state.loggedInUserId);
      if (idx !== -1) state.users[idx] = updatedUser;
      cache.usersStr = JSON.stringify(state.users);

      closeModal('account-modal');
      
      updateNavbarUserProfile();
      renderKanbanBoard();
      renderSidebar();
      
      showToast('ปรับปรุงโปรไฟล์เรียบร้อย', 'ข้อมูลบัญชีผู้ใช้ใหม่บันทึกเข้าสู่ระบบส่วนกลางแล้ว', 'success');
    } else {
      showToast('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้ในขณะนี้', 'danger');
    }
  } catch (err) {
    showToast('การเชื่อมต่อขัดข้อง', 'เกิดปัญหาทางเครือข่าย', 'danger');
  }
}

// DELETE user request
async function handleDeleteAccount() {
  if (!state.loggedInUserId) return;

  const user = getUser(state.loggedInUserId);
  const textConfirm = prompt(`⚠️ คำเตือน: คุณต้องการลบบัญชีผู้ใช้นี้จริงหรือไม่?\nพิมพ์ชื่อเล่นของคุณ "${user.name}" เพื่อยืนยันการลบถาวร:`);
  
  if (textConfirm === user.name) {
    const oldUserId = state.loggedInUserId;
    
    try {
      const res = await fetch(`/api/users/${oldUserId}`, { method: 'DELETE' });
      if (res.ok) {
        state.users = state.users.filter(u => u.id !== oldUserId);
        cache.usersStr = JSON.stringify(state.users);

        state.loggedInUserId = null;
        localStorage.removeItem('hwspace_logged_in_user');

        exitAppView();
        showToast('ลบบัญชีถาวรแล้ว', 'ข้อมูลบัญชีของคุณถูกทำลายออกจากเซิร์ฟเวอร์เรียบร้อยแล้ว', 'danger');
      }
    } catch (err) {
      showToast('ดำเนินการล้มเหลว', 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'danger');
    }
  } else if (textConfirm !== null) {
    alert('การยืนยันล้มเหลว ชื่อเล่นที่พิมพ์ไม่ถูกต้อง');
  }
}

// ==========================================================================
// 8. Form Submission Handlers
// ==========================================================================

function setupFormSubmitListeners() {
  document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
  document.getElementById('register-form').addEventListener('submit', handleRegisterSubmit);
  document.getElementById('account-form').addEventListener('submit', handleAccountSettingsSubmit);

  // POST/PUT Homework
  document.getElementById('homework-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const hwId = document.getElementById('homework-id-input').value;
    const title = document.getElementById('hw-title').value.trim();
    const subjectId = document.getElementById('hw-subject').value;
    const priority = document.getElementById('hw-priority').value;
    const dueDate = document.getElementById('hw-due-date').value;
    const dueTime = document.getElementById('hw-due-time').value;
    const description = document.getElementById('hw-desc').value.trim();

    const checkboxes = document.getElementsByName('hw-assignees-check');
    const assignees = [];
    checkboxes.forEach(chk => {
      if (chk.checked) assignees.push(chk.value);
    });

    if (assignees.length === 0 && state.loggedInUserId) {
      assignees.push(state.loggedInUserId);
    }

    const payload = {
      groupId: state.activeGroupId,
      title,
      subjectId,
      priority,
      dueDate,
      dueTime,
      description,
      assignees,
      createdBy: state.loggedInUserId
    };

    try {
      if (hwId) {
        // EDIT MODE
        const res = await fetch(`/api/homeworks/${hwId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (res.ok) {
          const updatedHw = await res.json();
          const idx = state.homeworks.findIndex(h => h.id === hwId);
          if (idx !== -1) state.homeworks[idx] = updatedHw;
          cache.homeworksStr = JSON.stringify(state.homeworks);

          await logActivityToServer('edit', title, 'อัปเดตรายละเอียดการบ้าน');
          showToast('ปรับปรุงการบ้านแล้ว', `ปรับปรุงรายละเอียดของ "${title}"`, 'success');
        }
      } else {
        // ADD MODE
        const res = await fetch('/api/homeworks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (res.ok) {
          const newHw = await res.json();
          state.homeworks.unshift(newHw);
          cache.homeworksStr = JSON.stringify(state.homeworks);

          await logActivityToServer('add', title, 'เพิ่มการบ้านชิ้นใหม่');
          showToast('จดการบ้านสำเร็จ', `เพิ่ม "${title}" ลงในบอร์ดของกลุ่มแล้ว`, 'success');
        }
      }

      closeModal('homework-modal');
      renderKanbanBoard();

    } catch (err) {
      showToast('ดำเนินการล้มเหลว', 'เกิดข้อผิดพลาดในการบันทึกข้อมูลลงระบบฐานข้อมูล', 'danger');
    }
  });

  // POST Subject
  document.getElementById('subject-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('subj-name').value.trim();
    const checkedColor = document.querySelector('input[name="subj-color"]:checked').value;
    
    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: checkedColor })
      });

      if (res.ok) {
        const newSub = await res.json();
        state.subjects.push(newSub);
        cache.subjectsStr = JSON.stringify(state.subjects);
        
        showToast('เพิ่มวิชาใหม่สำเร็จ', `เพิ่มวิชา "${name}" เรียบร้อยแล้ว`, 'success');
        closeModal('subject-modal');
        populateDropdowns();
      } else {
        const err = await res.json();
        alert(err.error || 'เกิดข้อผิดพลาด');
      }
    } catch (err) {
      showToast('บันทึกล้มเหลว', 'เกิดปัญหาทางระบบเครือข่าย', 'danger');
    }
  });

  // POST Group
  document.getElementById('group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('group-name-input').value.trim();

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });

      if (res.ok) {
        const newGroup = await res.json();
        state.groups.push(newGroup);
        cache.groupsStr = JSON.stringify(state.groups);
        
        state.activeGroupId = newGroup.id;
        
        showToast('สร้างกลุ่มใหม่สำเร็จ', `ยินดีต้อนรับสู่ห้องเรียน "${name}"`, 'success');
        closeModal('group-modal');
        
        populateDropdowns();
        renderKanbanBoard();
        renderSidebar();
      }
    } catch (err) {
      showToast('สร้างกลุ่มเรียนล้มเหลว', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'danger');
    }
  });

  // POST Chat Message
  document.getElementById('chat-send-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    
    if (text === '' && !state.activeAttachLink) return;
    if (!state.activeHomeworkId || !state.loggedInUserId) return;

    const payload = {
      homeworkId: state.activeHomeworkId,
      senderId: state.loggedInUserId,
      text: text || `แชร์ลิงก์: ${state.activeAttachLink.label}`,
      link: state.activeAttachLink
    };

    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const newMsg = await res.json();
        
        if (!state.chats[state.activeHomeworkId]) {
          state.chats[state.activeHomeworkId] = [];
        }
        state.chats[state.activeHomeworkId].push(newMsg);
        cache.chatsStr = JSON.stringify(state.chats[state.activeHomeworkId]);

        const hw = state.homeworks.find(h => h.id === state.activeHomeworkId);
        await logActivityToServer('comment', hw.title, 'แสดงความคิดเห็นคุยงานกลุ่ม');
        
        input.value = '';
        handleRemoveAttachedLink();
        renderChatMessages(state.chats[state.activeHomeworkId]);
      }
    } catch (err) {
      showToast('ส่งแชทไม่สำเร็จ', 'ไม่สามารถคุยงานได้ชั่วคราวเนื่องจากปัญหาทางเครือข่าย', 'danger');
    }
  });
}

function handleGroupSwitch(groupId) {
  state.activeGroupId = groupId;
  
  renderKanbanBoard();
  renderSidebar();
  
  const group = state.groups.find(g => g.id === groupId);
  if (group) {
    document.getElementById('group-title').textContent = group.name;
  }
}

function setupToolbarListeners() {
  document.getElementById('search-input').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderKanbanBoard();
  });

  document.getElementById('filter-subject').addEventListener('change', (e) => {
    state.filterSubject = e.target.value;
    renderKanbanBoard();
  });

  document.getElementById('filter-priority').addEventListener('change', (e) => {
    state.filterPriority = e.target.value;
    renderKanbanBoard();
  });

  document.getElementById('filter-assignee').addEventListener('change', (e) => {
    state.filterAssignee = e.target.value;
    renderKanbanBoard();
  });

  document.getElementById('active-group-select').addEventListener('change', (e) => {
    handleGroupSwitch(e.target.value);
  });

  document.getElementById('notif-bell-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('notif-dropdown');
    dropdown.classList.toggle('show');
  });

  document.getElementById('clear-notif-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    state.notifs = [];
    renderNotifications();
  });

  document.addEventListener('click', () => {
    document.getElementById('notif-dropdown').classList.remove('show');
  });
}

// ==========================================================================
// 9. Reminders & Deadlines Checkers
// ==========================================================================

function checkUpcomingDeadlines() {
  if (!state.loggedInUserId) return;

  const now = new Date();
  let statusChanged = false;
  
  state.homeworks.forEach(hw => {
    if (hw.status === 'done' || !hw.dueDate) return;

    const deadline = new Date(`${hw.dueDate}T${hw.dueTime || '00:00'}`);
    const timeRemaining = deadline - now;
    const hoursLeft = timeRemaining / (1000 * 60 * 60);

    if (timeRemaining < 0 && !hw.overdueAlerted) {
      hw.overdueAlerted = true;
      statusChanged = true;
      
      // Update local and server overdue alert state to prevent duplicates
      fetch(`/api/homeworks/${hw.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overdueAlerted: true })
      });
      
      const details = `การบ้าน "${hw.title}" เลยกำหนดส่งแล้ว! (${formatFriendlyDeadline(hw.dueDate, hw.dueTime)})`;
      addNotification('🚨 เลยกำหนดส่งการบ้าน!', details, hw.id);
      showToast('🚨 เลยกำหนดส่ง!', details, 'danger');
    } 
    else if (timeRemaining > 0 && hoursLeft <= 6 && !hw.upcomingAlerted) {
      hw.upcomingAlerted = true;
      statusChanged = true;

      fetch(`/api/homeworks/${hw.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upcomingAlerted: true })
      });

      const hoursRound = Math.max(1, Math.round(hoursLeft));
      const details = `การบ้าน "${hw.title}" ใกล้ถึงกำหนดส่งแล้ว เหลือเวลาอีกประมาณ ${hoursRound} ชั่วโมง!`;
      addNotification('⚠️ ใกล้ครบกำหนดส่ง!', details, hw.id);
      showToast('⚠️ ใกล้ครบกำหนดส่ง!', details, 'warning');
    }
  });

  if (statusChanged) {
    renderKanbanBoard();
  }
}

function startDeadlineRemindersEngine() {
  checkUpcomingDeadlines();
  setInterval(checkUpcomingDeadlines, 60000);
}

// ==========================================================================
// 10. Application Initialization Hook
// ==========================================================================

window.addEventListener('DOMContentLoaded', async () => {
  initSession();
  setupAuthTabs();
  
  setupModalButtons();
  setupFormSubmitListeners();
  setupToolbarListeners();
  setupDragAndDrop();

  // If session logged in, load state and enter workspace
  if (state.loggedInUserId) {
    await loadDataFromServer();
    
    // Safety check in case the user was deleted on the server database
    const me = state.users.find(u => u.id === state.loggedInUserId);
    if (!me) {
      // Session user no longer exists, force logout cleanup
      state.loggedInUserId = null;
      localStorage.removeItem('hwspace_logged_in_user');
      exitAppView();
    } else {
      enterAppView();
      showToast('เข้าสู่ระบบอัตโนมัติสำเร็จ', `ล็อกอินในชื่อ "${me.name}" แล้ว`, 'success');
    }
  } else {
    // Check registered accounts list to choose default tab
    try {
      const users = await fetch('/api/users').then(r => r.json());
      state.users = users;
      exitAppView();
    } catch (err) {
      exitAppView();
    }
  }

  // Start background engines
  startDeadlineRemindersEngine();
  
  // Start server polling synchronizer (every 4 seconds)
  setInterval(syncDataFromServer, 4000);
});
