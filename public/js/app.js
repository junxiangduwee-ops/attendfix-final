// ── SHARED APP HELPERS ──

async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-MY', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

function statusBadge(status) {
  const map = {
    PENDING:  '<span class="badge pend pulse"><span class="badge-dot"></span>Pending</span>',
    APPROVED: '<span class="badge ok"><span class="badge-dot"></span>Approved</span>',
    REJECTED: '<span class="badge rej"><span class="badge-dot"></span>Rejected</span>',
  };
  return map[(status || '').toUpperCase()] || status;
}

function attendanceBadge(row) {
  if (!row.clock_in && !row.clock_out) return '<span class="badge miss"><span class="badge-dot"></span>Missing</span>';
  if (!row.clock_in)  return '<span class="badge miss"><span class="badge-dot"></span>No clock-in</span>';
  if (!row.clock_out) return '<span class="badge miss"><span class="badge-dot"></span>No clock-out</span>';
  // DB stores source in uppercase — check both to be safe
  if (row.source === 'CORRECTED' || row.source === 'corrected') return '<span class="badge fill"><span class="badge-dot"></span>Corrected</span>';
  return '<span class="badge ok"><span class="badge-dot"></span>Complete</span>';
}

// ── SIDEBAR BUILDER ──
async function buildSidebar(activePage) {
  let user;
  try { user = await api('GET', '/api/me'); } catch { window.location.href = '/login'; return; }

  // Role is stored uppercase in DB (EMPLOYEE, HOD, HR, ADMIN)
  const role  = (user.role || '').toUpperCase();
  const isHOD = ['HOD', 'ADMIN'].includes(role);
  const isHR  = role === 'HR';

  // Auto-mark notifications as read when visiting My Attendance page
  if (activePage === 'my-attendance' && user.unreadCount > 0) {
    api('POST', '/api/notifications/read-all').catch(() => {});
    user.unreadCount = 0;
  }

  const avatarClass = role === 'HOD' ? 'sb-av hod' : role === 'HR' ? 'sb-av hr' : 'sb-av';
  const initials = user.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();

  document.getElementById('sidebar').innerHTML = `
    <div class="sb-logo">
      <div class="sb-logo-icon" style="background:#FFD700;padding:2px"><img src="/mr-diy-icon.png" width="30" height="30" style="object-fit:contain;display:block"></div>
      <div><div class="sb-logo-name">AttendFix</div><div class="sb-logo-sub">MR DIY · HR System</div></div>
    </div>
    <div class="sb-user-card">
      <div class="${avatarClass}">${initials}</div>
      <div><div class="sb-uname">${user.name}</div><div class="sb-urole">${user.role}</div></div>
    </div>
    ${!isHR ? `
    <div class="sb-section">
      <div class="sb-section-label">Attendance</div>
      <a href="/dashboard" class="sb-item ${activePage==='dashboard'?'active':''}">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Dashboard
      </a>
      <a href="/my-attendance" class="sb-item ${activePage==='my-attendance'?'active':''}">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
        My Attendance
        ${user.unreadCount > 0 ? `<span class="sb-badge">${user.unreadCount}</span>` : ''}
      </a>
      <a href="/my-requests" class="sb-item ${activePage==='my-requests'?'active':''}">
        <svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
        My Requests
      </a>
    </div>` : ''}
    ${isHOD ? `
    <div class="sb-section">
      <div class="sb-section-label">HOD Panel</div>
      <a href="/hod/approvals" class="sb-item ${activePage==='hod-approvals'?'active':''}">
        <svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        Pending Approvals
        <span class="sb-badge amber" id="hodBadgeCount" style="display:none">0</span>
      </a>
      <a href="/hod/team" class="sb-item ${activePage==='hod-team'?'active':''}">
        <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        Team Attendance
      </a>
      <a href="/hod/history" class="sb-item ${activePage==='hod-history'?'active':''}">
        <svg viewBox="0 0 24 24"><path d="M12 2v10l4 4"/><circle cx="12" cy="12" r="10"/></svg>
        Approval History
      </a>
    </div>` : ''}
    ${isHR ? `
    <div class="sb-section">
      <div class="sb-section-label">HR Panel</div>
      <a href="/hod/history" class="sb-item ${activePage==='hod-history'?'active':''}">
        <svg viewBox="0 0 24 24"><path d="M12 2v10l4 4"/><circle cx="12" cy="12" r="10"/></svg>
        All Corrections
      </a>
      <a href="/hr/sync" class="sb-item ${activePage==='hr-sync'?'active':''}">
        <svg viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        HR Sync
      </a>
    </div>` : ''}
    <div class="sb-bottom">
      <a href="/logout" class="sb-logout">
        <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        Sign out
      </a>
    </div>
  `;

  // Load HOD pending count (HOD only, not HR)
  if (isHOD) {
    try {
      const pending = await api('GET', '/api/hod/corrections/pending');
      const badge = document.getElementById('hodBadgeCount');
      if (badge && pending.length > 0) { badge.textContent = pending.length; badge.style.display = ''; }
    } catch {}
  }

  // ── Inject topbar with bell ───────────────────────────────────────────────
  const topbar = document.createElement('div');
  topbar.className = 'topbar';
  topbar.innerHTML = `
    <span class="topbar-title">${user.name}</span>
    <div style="position:relative">
      <button class="notif-btn" id="bellBtn" onclick="toggleNotif()" title="Notifications">
        <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
        <span class="notif-count" id="bellCount"></span>
      </button>
      <div class="notif-dropdown" id="notifDropdown">
        <div class="notif-header">
          <span class="notif-header-title">Notifications</span>
          <span class="notif-mark-read" onclick="markAllRead()">Mark all read</span>
        </div>
        <div class="notif-list" id="notifList"><div class="notif-empty">Loading…</div></div>
      </div>
    </div>`;

  // Insert topbar before page-body
  const mainContent = document.querySelector('.main-content');
  if (mainContent) mainContent.prepend(topbar);

  // Update bell count
  updateBellCount(user.unreadCount || 0);

  // Close dropdown when clicking outside
  document.addEventListener('click', e => {
    if (!e.target.closest('#bellBtn') && !e.target.closest('#notifDropdown')) {
      document.getElementById('notifDropdown')?.classList.remove('open');
    }
  });

  return user;
}

function updateBellCount(n) {
  const el = document.getElementById('bellCount');
  if (!el) return;
  if (n > 0) { el.textContent = n > 99 ? '99+' : n; el.style.display = 'block'; }
  else { el.style.display = 'none'; }
}

function toggleNotif() {
  const dd = document.getElementById('notifDropdown');
  const isOpen = dd.classList.contains('open');
  dd.classList.toggle('open');
  if (!isOpen) loadNotifDropdown();
}

async function loadNotifDropdown() {
  const list = document.getElementById('notifList');
  list.innerHTML = '<div class="notif-empty">Loading…</div>';
  try {
    const notifs = await api('GET', '/api/notifications?limit=15');
    if (!notifs.length) { list.innerHTML = '<div class="notif-empty">🎉 All caught up!</div>'; return; }

    const iconMap = {
      missing_record:      { cls:'warn', emoji:'⚠️' },
      request_submitted:   { cls:'info', emoji:'📋' },
      request_approved:    { cls:'ok',   emoji:'✅' },
      request_rejected:    { cls:'bad',  emoji:'❌' },
      approval_needed:     { cls:'warn', emoji:'⏳' },
      team_missing_record: { cls:'warn', emoji:'👥' },
      decision_logged:     { cls:'info', emoji:'📝' },
    };

    list.innerHTML = notifs.map(n => {
      const ic = iconMap[n.type] || { cls:'info', emoji:'🔔' };
      return `<div class="notif-item ${n.is_read ? '' : 'unread'}">
        <div class="notif-icon ${ic.cls}">${ic.emoji}</div>
        <div class="notif-content">
          <div class="notif-item-title">${n.title}</div>
          <div class="notif-item-msg">${n.message}</div>
          <div class="notif-item-time">${timeAgo(n.created_at)}</div>
        </div>
      </div>`;
    }).join('');

    // Mark all as read when opened
    await api('POST', '/api/notifications/read-all');
    updateBellCount(0);
  } catch(e) { list.innerHTML = '<div class="notif-empty">Could not load notifications.</div>'; }
}

async function markAllRead() {
  await api('POST', '/api/notifications/read-all');
  updateBellCount(0);
  loadNotifDropdown();
}

// Global modal helpers
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
