/* ========================================================
   ProjectPulse — App Logic
   Storage: localStorage
   Features: Projects, Milestones, Tasks, Reminders, Rewards
======================================================== */

// ─── Data Layer ──────────────────────────────────────────

const DB = {
  load() {
    return JSON.parse(localStorage.getItem('pp_data') || 'null') || {
      projects: [],
      rewards: { points: 0, history: [] },
      activity: []
    };
  },
  save(data) {
    localStorage.setItem('pp_data', JSON.stringify(data));
  }
};

let state = DB.load();

function save() { DB.save(state); }

// ─── Helpers ─────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(d) {
  if (!d) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  const target = new Date(d + 'T00:00:00');
  return Math.round((target - now) / 864e5);
}

function deadlineClass(d, done = false) {
  if (done) return 'done';
  const days = daysUntil(d);
  if (days === null) return '';
  if (days < 0) return 'overdue';
  if (days <= 3) return 'soon';
  return 'ok';
}

function deadlineLabel(d, done = false) {
  if (!d) return '';
  if (done) return `Done · ${fmtDate(d)}`;
  const days = daysUntil(d);
  if (days < 0)  return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${fmtDate(d)}`;
}

function priorityColor(p) {
  return { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' }[p] || '#6366f1';
}

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

// ─── Progress Calc ────────────────────────────────────────

function projectProgress(project) {
  const tasks = project.milestones.flatMap(m => m.tasks);
  if (!tasks.length) return 0;
  return Math.round((tasks.filter(t => t.done).length / tasks.length) * 100);
}

function milestoneProgress(milestone) {
  if (!milestone.tasks.length) return 0;
  return Math.round((milestone.tasks.filter(t => t.done).length / milestone.tasks.length) * 100);
}

// ─── Rewards ─────────────────────────────────────────────

const BADGES = [
  { id: 'first_task',    icon: '🌱', name: 'First Step',      desc: 'Complete your first task',        cond: (s) => totalDone(s) >= 1 },
  { id: 'five_tasks',    icon: '⚡', name: 'On a Roll',       desc: 'Complete 5 tasks',                 cond: (s) => totalDone(s) >= 5 },
  { id: 'twenty_tasks',  icon: '🔥', name: 'Power User',      desc: 'Complete 20 tasks',                cond: (s) => totalDone(s) >= 20 },
  { id: 'early_bird',    icon: '🌅', name: 'Early Bird',      desc: 'Finish a task before its deadline',cond: (s) => s.rewards.history.some(h => h.type === 'early') },
  { id: 'speed_demon',   icon: '🚀', name: 'Speed Demon',     desc: 'Earn 3 early completions',        cond: (s) => s.rewards.history.filter(h => h.type === 'early').length >= 3 },
  { id: 'milestone_done',icon: '🏁', name: 'Milestone Met',   desc: 'Complete a full milestone',        cond: (s) => anyMilestoneDone(s) },
  { id: 'project_done',  icon: '🏆', name: 'Project Champion',desc: 'Complete an entire project',       cond: (s) => anyProjectDone(s) },
  { id: 'centurion',     icon: '💯', name: 'Centurion',       desc: 'Accumulate 100 points',            cond: (s) => s.rewards.points >= 100 },
];

function totalDone(s) {
  return s.projects.flatMap(p => p.milestones.flatMap(m => m.tasks)).filter(t => t.done).length;
}
function anyMilestoneDone(s) {
  return s.projects.some(p => p.milestones.some(m => m.tasks.length > 0 && m.tasks.every(t => t.done)));
}
function anyProjectDone(s) {
  return s.projects.some(p => p.milestones.length > 0 && p.milestones.every(m => m.tasks.length > 0 && m.tasks.every(t => t.done)));
}

function awardPoints(amount, reason, type = 'task') {
  state.rewards.points += amount;
  state.rewards.history.unshift({ amount, reason, type, ts: Date.now() });
  if (state.rewards.history.length > 50) state.rewards.history.pop();
  checkBadges();
}

function checkBadges() {
  const earned = state.rewards.history.map(h => h.badge).filter(Boolean);
  BADGES.forEach(b => {
    if (!earned.includes(b.id) && b.cond(state)) {
      state.rewards.history.unshift({ amount: 0, reason: `Badge unlocked: ${b.name}`, type: 'badge', badge: b.id, ts: Date.now() });
      showToast(b.icon + ' Badge Unlocked!', b.name + ' — ' + b.desc);
    }
  });
}

// ─── Activity Log ─────────────────────────────────────────

function logActivity(icon, text) {
  state.activity.unshift({ icon, text, ts: Date.now() });
  if (state.activity.length > 30) state.activity.pop();
}

// ─── Toast ────────────────────────────────────────────────

let toastTimer;
function showToast(title, body) {
  const el = document.getElementById('rewardToast');
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastBody').textContent = body;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

// ─── Browser Notifications ───────────────────────────────

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function scheduleReminder(task, projectName) {
  if (!task.deadline || !task.reminder || task.reminder === '0') return;
  const deadlineMs = new Date(task.deadline + 'T09:00:00').getTime();
  const fireAt = deadlineMs - (parseInt(task.reminder) * 60 * 1000);
  const delay = fireAt - Date.now();
  if (delay <= 0) return;
  setTimeout(() => {
    if (Notification.permission === 'granted') {
      new Notification(`Reminder: ${task.name}`, {
        body: `Task in "${projectName}" is due ${deadlineLabel(task.deadline)}`,
        icon: '/favicon.ico'
      });
    }
    showToast('⏰ Reminder', `"${task.name}" deadline approaching`);
  }, delay);
}

// ─── Rendering ───────────────────────────────────────────

function renderSidebar() {
  const el = document.getElementById('sidebarProjectList');
  if (!state.projects.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="sidebar-section-label">Projects</div>` +
    state.projects.map(p => `
      <div class="sidebar-project-item ${currentProjectId === p.id ? 'active' : ''}"
           data-id="${p.id}" onclick="openProject('${p.id}')">
        <span class="sidebar-dot" style="background:${priorityColor(p.priority)}"></span>
        <span style="overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</span>
      </div>
    `).join('');
}

function renderDashboard() {
  const projects = state.projects;
  const allTasks = projects.flatMap(p => p.milestones.flatMap(m => m.tasks));
  const done = allTasks.filter(t => t.done).length;
  const overdue = allTasks.filter(t => !t.done && t.deadline && daysUntil(t.deadline) < 0).length;

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card accent">
      <div class="stat-label">Projects</div>
      <div class="stat-value">${projects.length}</div>
      <div class="stat-sub">${projects.filter(p => projectProgress(p) === 100).length} completed</div>
    </div>
    <div class="stat-card green">
      <div class="stat-label">Tasks Done</div>
      <div class="stat-value">${done}</div>
      <div class="stat-sub">${allTasks.length} total</div>
    </div>
    <div class="stat-card orange">
      <div class="stat-label">Overdue</div>
      <div class="stat-value">${overdue}</div>
      <div class="stat-sub">tasks past deadline</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Points</div>
      <div class="stat-value" style="color:#f59e0b">&#9733; ${state.rewards.points}</div>
      <div class="stat-sub">${BADGES.filter(b => b.cond(state)).length}/${BADGES.length} badges</div>
    </div>
  `;

  // Upcoming deadlines (tasks + projects, next 14 days, not done)
  const items = [];
  projects.forEach(p => {
    if (p.deadline) {
      const days = daysUntil(p.deadline);
      if (days !== null && days <= 14) {
        items.push({ name: p.name, sub: 'Project deadline', deadline: p.deadline, id: p.id, type: 'project' });
      }
    }
    p.milestones.forEach(m => {
      m.tasks.forEach(t => {
        if (!t.done && t.deadline) {
          const days = daysUntil(t.deadline);
          if (days !== null && days <= 14) {
            items.push({ name: t.name, sub: p.name + ' › ' + m.name, deadline: t.deadline, id: p.id, type: 'task', color: priorityColor(p.priority) });
          }
        }
      });
    });
  });
  items.sort((a, b) => a.deadline.localeCompare(b.deadline));

  const dlEl = document.getElementById('upcomingDeadlines');
  if (!items.length) {
    dlEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>No upcoming deadlines in the next 14 days.</p></div>';
  } else {
    dlEl.innerHTML = items.slice(0, 8).map(item => {
      const cls = deadlineClass(item.deadline);
      return `<div class="deadline-item" onclick="openProject('${item.id}')">
        <span class="dl-dot" style="background:${item.color || '#6366f1'}"></span>
        <div style="flex:1">
          <div class="dl-name">${esc(item.name)}</div>
          <div class="dl-sub">${esc(item.sub)}</div>
        </div>
        <span class="dl-date ${cls}">${deadlineLabel(item.deadline)}</span>
      </div>`;
    }).join('');
  }

  // Activity
  const actEl = document.getElementById('activityList');
  if (!state.activity.length) {
    actEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No activity yet.</p></div>';
  } else {
    actEl.innerHTML = state.activity.slice(0, 10).map(a => `
      <div class="activity-item">
        <span class="act-icon">${a.icon}</span>
        <span class="act-text">${esc(a.text)}</span>
        <span class="act-time">${timeAgo(a.ts)}</span>
      </div>
    `).join('');
  }
}

function renderProjects() {
  const el = document.getElementById('projectsGrid');
  if (!state.projects.length) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">📂</div>
      <p>No projects yet.</p>
      <p class="empty-hint">Click "New Project" to get started.</p>
    </div>`;
    return;
  }
  el.innerHTML = state.projects.map(p => {
    const pct = projectProgress(p);
    const dlCls = deadlineClass(p.deadline, pct === 100);
    const tasks = p.milestones.flatMap(m => m.tasks);
    return `
      <div class="project-card" onclick="openProject('${p.id}')">
        <div class="project-card-header">
          <span class="project-card-dot" style="background:${priorityColor(p.priority)}"></span>
          <span class="project-card-name">${esc(p.name)}</span>
          <span class="priority-tag ${p.priority}">${p.priority}</span>
        </div>
        <div class="project-card-desc">${esc(p.description || 'No description')}</div>
        <div class="project-card-meta">
          <span class="project-card-deadline ${dlCls}">${p.deadline ? '&#128197; ' + deadlineLabel(p.deadline, pct===100) : 'No deadline'}</span>
          <span>${tasks.filter(t=>t.done).length}/${tasks.length} tasks</span>
        </div>
        <div class="mini-progress-track">
          <div class="mini-progress-fill" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderProjectDetail(projectId) {
  const p = state.projects.find(x => x.id === projectId);
  if (!p) return;

  document.getElementById('detailProjectName').textContent = p.name;
  document.getElementById('detailDescription').textContent = p.description || '';

  const pct = projectProgress(p);
  const dlCls = deadlineClass(p.deadline, pct === 100);
  const badge = document.getElementById('detailDeadline');
  badge.textContent = p.deadline ? deadlineLabel(p.deadline, pct===100) : 'No deadline';
  badge.className = 'deadline-badge ' + dlCls;

  document.getElementById('detailProgress').textContent = pct + '%';
  const bar = document.getElementById('detailProgressBar');
  bar.style.width = pct + '%';
  bar.className = 'progress-bar-fill' + (pct === 100 ? ' complete' : '');

  const list = document.getElementById('milestonesList');
  if (!p.milestones.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🏁</div>
      <p>No milestones yet.</p>
      <p class="empty-hint">Click "+ Milestone" to create one.</p>
    </div>`;
    return;
  }

  list.innerHTML = p.milestones.map(m => {
    const mpct = milestoneProgress(m);
    const mdlCls = deadlineClass(m.deadline, mpct === 100);
    const isOpen = openMilestones.has(m.id);
    return `
      <div class="milestone-card" data-mid="${m.id}">
        <div class="milestone-header" onclick="toggleMilestone('${m.id}')">
          <span class="milestone-toggle ${isOpen ? 'open' : ''}">&#9654;</span>
          <span class="milestone-name">${esc(m.name)}</span>
          <span style="font-size:12px;color:var(--text-sub);margin-right:12px">${m.tasks.filter(t=>t.done).length}/${m.tasks.length}</span>
          <span class="milestone-deadline ${mdlCls}">${m.deadline ? deadlineLabel(m.deadline, mpct===100) : ''}</span>
        </div>
        <div class="milestone-progress-wrap">
          <div class="milestone-progress-bar">
            <div class="milestone-progress-fill ${mpct===100?'complete':''}" style="width:${mpct}%"></div>
          </div>
        </div>
        <div class="milestone-body ${isOpen ? 'open' : ''}">
          <div class="tasks-list">
            ${m.tasks.length ? m.tasks.map(t => renderTask(t, m.id, p.id)).join('') : `<div style="padding:12px 16px;color:var(--text-sub);font-size:13px">No tasks yet.</div>`}
          </div>
          <div class="milestone-footer">
            <button class="add-task-btn" onclick="openTaskModal('${m.id}','${p.id}')">+ Add Task</button>
            <div class="milestone-actions">
              <button class="milestone-delete-btn" title="Delete milestone" onclick="deleteMilestone('${m.id}','${p.id}')">&#128465;</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTask(t, milestoneId, projectId) {
  const dlCls = deadlineClass(t.deadline, t.done);
  return `
    <div class="task-item" data-tid="${t.id}">
      <div class="task-checkbox ${t.done ? 'checked' : ''}"
           onclick="toggleTask('${t.id}','${milestoneId}','${projectId}')"></div>
      <span class="task-name ${t.done ? 'done' : ''}">${esc(t.name)}</span>
      ${t.deadline ? `<span class="task-deadline-tag ${dlCls}">${deadlineLabel(t.deadline, t.done)}</span>` : ''}
      <button class="task-delete-btn" title="Delete task"
              onclick="deleteTask('${t.id}','${milestoneId}','${projectId}')">&#10005;</button>
    </div>
  `;
}

function renderRewards() {
  const s = state;
  document.getElementById('rewardsSummary').innerHTML = `
    <div class="stat-card accent">
      <div class="stat-label">Total Points</div>
      <div class="stat-value">&#9733; ${s.rewards.points}</div>
      <div class="stat-sub">earned through the app</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Tasks Completed</div>
      <div class="stat-value">${totalDone(s)}</div>
    </div>
    <div class="stat-card green">
      <div class="stat-label">Badges</div>
      <div class="stat-value">${BADGES.filter(b=>b.cond(s)).length} / ${BADGES.length}</div>
    </div>
  `;

  const earnedIds = new Set(BADGES.filter(b => b.cond(s)).map(b => b.id));
  document.getElementById('badgesGrid').innerHTML = BADGES.map(b => `
    <div class="badge-card ${earnedIds.has(b.id) ? '' : 'locked'}">
      <div class="badge-icon">${b.icon}</div>
      <div class="badge-name">${b.name}</div>
      <div class="badge-desc">${b.desc}</div>
    </div>
  `).join('');

  const hist = s.rewards.history.filter(h => h.type !== 'badge');
  document.getElementById('pointsHistory').innerHTML = hist.length
    ? hist.slice(0,20).map(h => `
        <div class="points-row">
          <span class="pts-icon">${h.type === 'early' ? '🚀' : '✅'}</span>
          <span class="pts-text">${esc(h.reason)}</span>
          ${h.amount ? `<span class="pts-value">+${h.amount} pts</span>` : ''}
          <span class="pts-time">${timeAgo(h.ts)}</span>
        </div>
      `).join('')
    : '<div class="empty-state"><div class="empty-icon">🌟</div><p>Complete tasks to earn points!</p></div>';
}

// ─── Navigation ──────────────────────────────────────────

let currentView = 'dashboard';
let currentProjectId = null;
const openMilestones = new Set();

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  currentView = name;

  if (name === 'dashboard') renderDashboard();
  else if (name === 'projects') renderProjects();
  else if (name === 'rewards') renderRewards();

  renderSidebar();
}

function openProject(id) {
  currentProjectId = id;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-project-detail').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  renderProjectDetail(id);
  renderSidebar();
}

function toggleMilestone(id) {
  if (openMilestones.has(id)) openMilestones.delete(id);
  else openMilestones.add(id);
  if (currentProjectId) renderProjectDetail(currentProjectId);
}

// ─── Project CRUD ────────────────────────────────────────

let editingProjectId = null;

function openProjectModal(id = null) {
  editingProjectId = id;
  const p = id ? state.projects.find(x => x.id === id) : null;
  document.getElementById('projectModalTitle').textContent = p ? 'Edit Project' : 'New Project';
  document.getElementById('pmName').value = p ? p.name : '';
  document.getElementById('pmDesc').value = p ? (p.description || '') : '';
  document.getElementById('pmDeadline').value = p ? (p.deadline || '') : '';
  document.getElementById('pmPriority').value = p ? p.priority : 'medium';
  openModal('projectModal');
}

document.getElementById('saveProjectBtn').onclick = () => {
  const name = document.getElementById('pmName').value.trim();
  const deadline = document.getElementById('pmDeadline').value;
  if (!name) { alert('Project name is required.'); return; }
  if (!deadline) { alert('Please set a deadline.'); return; }

  if (editingProjectId) {
    const p = state.projects.find(x => x.id === editingProjectId);
    p.name = name;
    p.description = document.getElementById('pmDesc').value.trim();
    p.deadline = deadline;
    p.priority = document.getElementById('pmPriority').value;
    logActivity('✏️', `Updated project: ${name}`);
  } else {
    const newP = {
      id: uid(), name,
      description: document.getElementById('pmDesc').value.trim(),
      deadline,
      priority: document.getElementById('pmPriority').value,
      milestones: [],
      createdAt: Date.now()
    };
    state.projects.push(newP);
    logActivity('📂', `Created project: ${name}`);
    awardPoints(5, `Created project: ${name}`, 'task');
  }
  save();
  closeModal('projectModal');
  re();
};

document.getElementById('deleteProjectBtn').onclick = () => {
  if (!currentProjectId) return;
  const p = state.projects.find(x => x.id === currentProjectId);
  if (!confirm(`Delete project "${p.name}"? This cannot be undone.`)) return;
  state.projects = state.projects.filter(x => x.id !== currentProjectId);
  logActivity('🗑️', `Deleted project: ${p.name}`);
  save();
  currentProjectId = null;
  showView('projects');
};

// ─── Milestone CRUD ──────────────────────────────────────

let editingMilestone = { projectId: null, milestoneId: null };

function openMilestoneModal(projectId) {
  editingMilestone = { projectId, milestoneId: null };
  document.getElementById('milestoneModalTitle').textContent = 'New Milestone';
  document.getElementById('mmName').value = '';
  document.getElementById('mmDeadline').value = '';
  openModal('milestoneModal');
}

document.getElementById('addMilestoneBtn').onclick = () => {
  if (currentProjectId) openMilestoneModal(currentProjectId);
};

document.getElementById('saveMilestoneBtn').onclick = () => {
  const name = document.getElementById('mmName').value.trim();
  const deadline = document.getElementById('mmDeadline').value;
  if (!name) { alert('Milestone name is required.'); return; }
  if (!deadline) { alert('Please set a deadline for the milestone.'); return; }

  const p = state.projects.find(x => x.id === editingMilestone.projectId);
  if (!p) return;

  const m = { id: uid(), name, deadline, tasks: [], createdAt: Date.now() };
  p.milestones.push(m);
  openMilestones.add(m.id);
  logActivity('🏁', `Added milestone "${name}" to ${p.name}`);
  save();
  closeModal('milestoneModal');
  renderProjectDetail(editingMilestone.projectId);
};

function deleteMilestone(milestoneId, projectId) {
  const p = state.projects.find(x => x.id === projectId);
  const m = p.milestones.find(x => x.id === milestoneId);
  if (!confirm(`Delete milestone "${m.name}" and all its tasks?`)) return;
  p.milestones = p.milestones.filter(x => x.id !== milestoneId);
  logActivity('🗑️', `Deleted milestone: ${m.name}`);
  save();
  renderProjectDetail(projectId);
}

// ─── Task CRUD ───────────────────────────────────────────

let editingTask = { projectId: null, milestoneId: null, taskId: null };

function openTaskModal(milestoneId, projectId) {
  editingTask = { projectId, milestoneId, taskId: null };
  document.getElementById('taskModalTitle').textContent = 'New Task';
  document.getElementById('tmName').value = '';
  document.getElementById('tmDeadline').value = '';
  document.getElementById('tmReminder').value = '1440';
  openModal('taskModal');
}

document.getElementById('saveTaskBtn').onclick = () => {
  const name = document.getElementById('tmName').value.trim();
  if (!name) { alert('Task name is required.'); return; }

  const p = state.projects.find(x => x.id === editingTask.projectId);
  const m = p.milestones.find(x => x.id === editingTask.milestoneId);
  const t = {
    id: uid(), name,
    deadline: document.getElementById('tmDeadline').value || null,
    reminder: document.getElementById('tmReminder').value,
    done: false,
    createdAt: Date.now()
  };
  m.tasks.push(t);
  scheduleReminder(t, p.name);
  logActivity('📝', `Added task "${name}" in ${p.name}`);
  save();
  closeModal('taskModal');
  renderProjectDetail(editingTask.projectId);
  requestNotificationPermission();
};

function toggleTask(taskId, milestoneId, projectId) {
  const p = state.projects.find(x => x.id === projectId);
  const m = p.milestones.find(x => x.id === milestoneId);
  const t = m.tasks.find(x => x.id === taskId);
  t.done = !t.done;

  if (t.done) {
    const basePoints = 10;
    let bonus = 0;
    let isEarly = false;

    if (t.deadline) {
      const days = daysUntil(t.deadline);
      if (days > 0) {
        bonus = days >= 3 ? 15 : days >= 1 ? 10 : 5;
        isEarly = true;
      }
    }

    const total = basePoints + bonus;
    const type = isEarly ? 'early' : 'task';
    const reason = isEarly
      ? `Finished "${t.name}" ${Math.abs(daysUntil(t.deadline))}d early!`
      : `Completed task: ${t.name}`;

    awardPoints(total, reason, type);
    logActivity('✅', `Completed: ${t.name}`);

    if (isEarly) {
      showToast('🚀 Early Completion!', `+${total} pts — ${Math.abs(daysUntil(t.deadline))} day(s) ahead of deadline!`);
    }

    // Check if milestone now complete
    if (m.tasks.every(x => x.done)) {
      awardPoints(20, `Milestone complete: ${m.name}`, 'task');
      logActivity('🏁', `Milestone complete: ${m.name}`);
      showToast('🏁 Milestone Complete!', `"${m.name}" — +20 bonus pts`);
    }

    // Check if project now complete
    if (p.milestones.length && p.milestones.every(ms => ms.tasks.length && ms.tasks.every(x => x.done))) {
      awardPoints(50, `Project complete: ${p.name}`, 'task');
      logActivity('🏆', `Project complete: ${p.name}`);
      showToast('🏆 Project Complete!', `"${p.name}" — +50 bonus pts!`);
    }
  } else {
    logActivity('↩️', `Unchecked: ${t.name}`);
  }

  save();
  renderProjectDetail(projectId);
  if (currentView === 'dashboard') renderDashboard();
}

function deleteTask(taskId, milestoneId, projectId) {
  const p = state.projects.find(x => x.id === projectId);
  const m = p.milestones.find(x => x.id === milestoneId);
  const t = m.tasks.find(x => x.id === taskId);
  if (!confirm(`Delete task "${t.name}"?`)) return;
  m.tasks = m.tasks.filter(x => x.id !== taskId);
  logActivity('🗑️', `Deleted task: ${t.name}`);
  save();
  renderProjectDetail(projectId);
}

// ─── Modal Helpers ────────────────────────────────────────

function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.onclick = () => closeModal(btn.dataset.close);
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ─── Security ────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Re-render current view ──────────────────────────────

function re() {
  if (currentView === 'project-detail' && currentProjectId) renderProjectDetail(currentProjectId);
  else if (currentView === 'projects') renderProjects();
  else if (currentView === 'rewards') renderRewards();
  else renderDashboard();
  renderSidebar();
}

// ─── Wire up nav buttons ──────────────────────────────────

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

document.getElementById('dashNewProject').onclick = () => openProjectModal();
document.getElementById('projNewProject').onclick = () => openProjectModal();
document.getElementById('backBtn').onclick = () => {
  currentProjectId = null;
  showView('projects');
};

// ─── Reminder polling (check every minute) ───────────────

function rescheduleAllReminders() {
  state.projects.forEach(p => {
    p.milestones.forEach(m => {
      m.tasks.filter(t => !t.done).forEach(t => scheduleReminder(t, p.name));
    });
  });
}

// ─── Boot ────────────────────────────────────────────────

rescheduleAllReminders();
showView('dashboard');
