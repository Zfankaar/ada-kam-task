/* ─── SUPABASE ─── */
var SUPABASE_URL = 'https://pxsdcnsuqgarknbaczsd.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4c2RjbnN1cWdhcmtuYmFjenNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MTM0MjEsImV4cCI6MjA5NTE4OTQyMX0.oEDW_8Rgahqcp775C-ZtXNqu9rx26Bc1SYALXj7JXYM';
var supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

var ADMIN_EMAIL = 'admin@adakam.com';
var _adminUser = null;
var _isSignup = false;
var _allUsers = [];
var _allWithdrawals = [];
var _allTasks = [];

/* ─── PAGINATION ─── */
var PER_PAGE = 10;
var _page = { withdrawals: 1, tasks: 1, users: 1 };
var _filteredTasks = null;
var _filteredUsers = null;
var _filteredWithdrawals = null;
var _wdFilterStatus = 'all';
var _taskFilterStatus = 'all';

var _bannedUsers = [];
try { var b = localStorage.getItem('adaKamBannedUsers'); if (b) _bannedUsers = JSON.parse(b); } catch (e) {}
function saveBannedUsers() { try { localStorage.setItem('adaKamBannedUsers', JSON.stringify(_bannedUsers)); } catch (e) {} }

function paginate(arr, page) {
  var start = (page - 1) * PER_PAGE;
  return { items: arr.slice(start, start + PER_PAGE), total: arr.length, pages: Math.ceil(arr.length / PER_PAGE) };
}

function renderPagination(containerId, page, totalPages, tab) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  var h = '<div class="pagination">';
  h += '<button class="page-btn" onclick="goPage(\'' + tab + '\',' + (page - 1) + ')"' + (page <= 1 ? ' disabled' : '') + '>&#9664;</button>';
  h += '<span class="page-info">' + page + ' / ' + totalPages + '</span>';
  h += '<button class="page-btn" onclick="goPage(\'' + tab + '\',' + (page + 1) + ')"' + (page >= totalPages ? ' disabled' : '') + '>&#9654;</button>';
  h += '</div>';
  el.innerHTML = h;
}

function goPage(tab, p) {
  if (p < 1) return;
  _page[tab] = p;
  var container = document.getElementById('tabContent');
  if (tab === 'withdrawals') renderWithdrawals(container);
  else if (tab === 'tasks') renderTasks(container);
  else if (tab === 'users') renderUsers(container);
}

/* ─── LOCAL AUTH + SUPABASE SESSION ─── */
function getAdminPass() {
  try { return localStorage.getItem('adaKamAdminPass') || 'admin123'; } catch (e) { return 'admin123'; }
}

function setAdminPass(pass) {
  try { localStorage.setItem('adaKamAdminPass', pass); } catch (e) {}
}

function getAdminCreds() {
  try { return JSON.parse(localStorage.getItem('adaKamAdminCreds') || '{}'); } catch (e) { return {}; }
}

function saveAdminCreds(email, pass) {
  try { localStorage.setItem('adaKamAdminCreds', JSON.stringify({ email: email, password: pass })); } catch (e) {}
}

function clearAdminCreds() {
  try { localStorage.removeItem('adaKamAdminCreds'); } catch (e) {}
}

async function ensureSupabaseSession(email, pass) {
  var { data: { session } } = await supabase.auth.getSession();
  if (session && session.user && session.user.email === email) return true;

  var creds = getAdminCreds();
  var pw = pass || creds.password;
  if (!pw) return false;

  var { data, error } = await supabase.auth.signInWithPassword({ email: email, password: pw });
  if (!error && data.user) {
    saveAdminCreds(email, pw);
    return true;
  }
  return false;
}

/* wait for Supabase session to be ready before fetching */
async function waitSession() {
  for (var i = 0; i < 10; i++) {
    var { data: { session } } = await supabase.auth.getSession();
    if (session && session.user) return true;
    await new Promise(function (r) { setTimeout(r, 200); });
  }
  return false;
}

function toggleAdminAuth() {
  _isSignup = !_isSignup;
  var btn = document.getElementById('adminLoginBtn');
  var title = document.getElementById('loginTitle');
  var txt = document.querySelector('.login-toggle');
  var hint = document.querySelector('.login-hint');
  if (_isSignup) {
    title.textContent = 'Set Admin Password';
    btn.textContent = 'Set Password';
    txt.innerHTML = 'Already set up? <span onclick="toggleAdminAuth()">Sign in</span>';
    hint.textContent = 'First time? Choose a password for admin@adakam.com';
  } else {
    title.textContent = 'Admin Sign In';
    btn.textContent = 'Sign In';
    txt.innerHTML = 'First time? <span onclick="toggleAdminAuth()">Set password</span>';
    hint.textContent = 'Use admin@adakam.com to access the panel';
  }
  document.getElementById('adminLoginMsg').textContent = '';
  document.getElementById('adminPass').value = '';
  document.getElementById('adminEmail').value = ADMIN_EMAIL;
}

async function adminLogin() {
  var email = document.getElementById('adminEmail').value.trim();
  var pass = document.getElementById('adminPass').value;
  var msg = document.getElementById('adminLoginMsg');
  var btn = document.getElementById('adminLoginBtn');

  if (email !== ADMIN_EMAIL) { msg.textContent = 'only ' + ADMIN_EMAIL + ' is allowed'; return; }
  if (!pass || pass.length < 4) { msg.textContent = 'password must be at least 4 characters'; return; }
  msg.textContent = '';
  btn.disabled = true;

  if (_isSignup) {
    btn.textContent = 'setting up...';
    /* create Supabase Auth account (email confirm should be OFF) */
    var su = await supabase.auth.signUp({ email, password: pass });
    var suData = su.data;
    var suErr = su.error;
    if (suErr && suErr.message.indexOf('already') === -1) {
      msg.textContent = suErr.message;
      btn.textContent = 'Set Password';
      btn.disabled = false;
      return;
    }
    setAdminPass(pass);
    saveAdminCreds(email, pass);

    /* try to get a Supabase session */
    var gotSession = false;
    if (suData && suData.session) {
      _adminUser = suData.session.user;
      gotSession = true;
    } else {
      var li = await supabase.auth.signInWithPassword({ email, password: pass });
      if (li.data && li.data.user) {
        _adminUser = li.data.user;
        gotSession = true;
      }
    }

    if (!gotSession) {
      msg.textContent = 'account exists but cannot sign in. Delete user from Supabase Auth > Users, then try again';
      btn.textContent = 'Set Password';
      btn.disabled = false;
      return;
    }

    localStorage.setItem('adaKamAdminSession', 'true');
    btn.disabled = false;
    showDashboard();
    return;
  }

  /* sign in */
  btn.textContent = 'signing in...';
  if (pass !== getAdminPass()) {
    msg.textContent = 'invalid password';
    btn.textContent = 'Sign In';
    btn.disabled = false;
    return;
  }

  var ok = await ensureSupabaseSession(email, pass);
  if (!ok) {
    msg.textContent = 'Supabase auth failed — try setting password again';
    btn.textContent = 'Sign In';
    btn.disabled = false;
    return;
  }

  localStorage.setItem('adaKamAdminSession', 'true');
  btn.disabled = false;
  showDashboard();
}

function adminLogout() {
  try {
    localStorage.removeItem('adaKamAdminSession');
  } catch (e) {}
  supabase.auth.signOut();
  _adminUser = null;
  document.getElementById('dashboardScreen').classList.add('off');
  document.getElementById('loginScreen').classList.remove('off');
  document.getElementById('adminPass').value = '';
  document.getElementById('adminLoginMsg').textContent = '';
  document.getElementById('adminLoginBtn').textContent = 'Sign In';
  document.getElementById('adminLoginBtn').disabled = false;
  if (_isSignup) toggleAdminAuth();
}

async function showDashboard() {
  document.getElementById('loginScreen').classList.add('off');
  document.getElementById('mainScreen').classList.remove('off');
  await waitSession();
  await loadDashboard();
}

/* ─── CHECK SESSION ON LOAD ─── */
(async function init() {
  try {
    console.log('admin init: checking session');
    if (localStorage.getItem('adaKamAdminSession') === 'true') {
      var ok = await ensureSupabaseSession(ADMIN_EMAIL);
      console.log('admin init: session ok =', ok);
      if (ok) showDashboard();
    }
  } catch (e) { console.warn('admin init error:', e); }
})();

/* ─── CHANGE PASSWORD ─── */
function openChangePass() {
  document.getElementById('changePassMsg').textContent = '';
  document.getElementById('newAdminPass1').value = '';
  document.getElementById('newAdminPass2').value = '';
  document.getElementById('changePassModal').classList.remove('off');
}

function closeChangePass() {
  document.getElementById('changePassModal').classList.add('off');
}

function saveNewPass() {
  var p1 = document.getElementById('newAdminPass1').value;
  var p2 = document.getElementById('newAdminPass2').value;
  var msg = document.getElementById('changePassMsg');
  if (!p1 || p1.length < 4) { msg.textContent = 'password must be at least 4 characters'; return; }
  if (p1 !== p2) { msg.textContent = 'passwords do not match'; return; }
  /* update localStorage */
  setAdminPass(p1);
  saveAdminCreds(ADMIN_EMAIL, p1);
  /* try to update Supabase Auth password */
  supabase.auth.updateUser({ password: p1 }).then(function (res) {
    if (res.error) msg.textContent = 'local password saved but Supabase update failed: ' + res.error.message;
  });
  msg.textContent = '';
  closeChangePass();
  adminToast('password changed successfully');
}

/* ─── DASHBOARD ─── */
async function loadDashboard() {
  var { data: { session } } = await supabase.auth.getSession();
  console.log('admin session:', session ? session.user.email : 'none');
  await Promise.all([
    fetchUsers(),
    fetchWithdrawals(),
    fetchTasks()
  ]);
  console.log('admin data:', { users: _allUsers.length, withdrawals: _allWithdrawals.length, tasks: _allTasks.length });
  updateStats();
  switchTab('withdrawals', document.querySelector('.tab'));
}

async function fetchUsers() {
  var { data, error } = await supabase.from('users').select('*').order('email', { ascending: true });
  if (data) _allUsers = data; else console.warn('admin fetch users:', error);
}

async function fetchWithdrawals() {
  var { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (data) _allWithdrawals = data; else console.warn('admin fetch withdrawals:', error);
}

async function fetchTasks() {
  var { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (data) _allTasks = data; else console.warn('admin fetch tasks:', error);
}

function updateStats() {
  var completedTasks = _allTasks.filter(function (t) { return t.status === 'approved'; }).length;
  var pendingWds = _allWithdrawals.filter(function (w) { return w.status === 'pending'; }).length;
  var pendingTasks = _allTasks.filter(function (t) { return t.status === 'pending'; }).length;

  document.getElementById('statUsers').textContent = _allUsers.length;
  document.getElementById('statCompletedTasks').textContent = completedTasks;
  document.getElementById('statPendingWithdrawals').textContent = pendingWds;
  document.getElementById('statPendingTasks').textContent = pendingTasks;
}

function getUserName(u) {
  if (!u) return 'unknown';
  return u.acc_type && u.acc_name
    ? u.acc_name + ' (' + u.acc_type + ')'
    : u.email || u.id;
}

function getUserEmail(u) {
  if (!u) return 'unknown';
  return u.email || u.id;
}

/* ─── TABS ─── */
function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  _filteredTasks = null;
  _filteredUsers = null;
  _filteredWithdrawals = null;
  _wdFilterStatus = 'all';
  _taskFilterStatus = 'all';
  _page[name] = 1;

  var container = document.getElementById('tabContent');

  if (name === 'withdrawals') renderWithdrawals(container);
  else if (name === 'tasks') renderTasks(container);
  else if (name === 'users') renderUsers(container);
}

/* ─── REFRESH ─── */
async function refreshAll() {
  _filteredTasks = null;
  _filteredUsers = null;
  _filteredWithdrawals = null;
  _wdFilterStatus = 'all';
  _taskFilterStatus = 'all';
  await Promise.all([fetchUsers(), fetchWithdrawals(), fetchTasks()]);
  updateStats();
  var active = document.querySelector('.tab.active');
  if (active) {
    var tab = active.textContent.toLowerCase().trim();
    _page[tab] = 1;
    switchTab(tab, active);
  }
}

function refreshTab() {
  updateStats();
  var active = document.querySelector('.tab.active');
  if (active) {
    var tab = active.textContent.toLowerCase().trim();
    var container = document.getElementById('tabContent');
    if (tab === 'withdrawals') renderWithdrawals(container);
    else if (tab === 'tasks') renderTasks(container);
    else if (tab === 'users') renderUsers(container);
  }
}

/* ─── WITHDRAWALS TAB ─── */
function renderWithdrawals(container) {
  var source = _filteredWithdrawals || _allWithdrawals;
  if (source.length === 0) {
    container.innerHTML = '<div class="toolbar-sticky">' +
      '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">' +
      '<input type="text" id="wdSearchInput" placeholder="search by email, name or ID..." style="flex:1;min-width:180px;padding:10px 14px;background:#1a1a20;border:1px solid #2e2e3a;border-radius:8px;color:#e4e4ec;font-size:13px;outline:none;" oninput="filterWithdrawals()">' +
      '<button onclick="filterWithdrawals()" style="padding:10px 20px;background:#7c5bfa;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Search</button>' +
      '</div>' +
      '<div style="margin-bottom:14px;display:flex;gap:6px;flex-wrap:wrap;">' +
      '<button class="filter-btn' + (_wdFilterStatus === 'all' ? ' active' : '') + '" onclick="setWdFilter(\'all\')">All</button>' +
      '<button class="filter-btn' + (_wdFilterStatus === 'pending' ? ' active' : '') + '" onclick="setWdFilter(\'pending\')">Pending</button>' +
      '<button class="filter-btn' + (_wdFilterStatus === 'approved' ? ' active' : '') + '" onclick="setWdFilter(\'approved\')">Approved</button>' +
      '<button class="filter-btn' + (_wdFilterStatus === 'rejected' ? ' active' : '') + '" onclick="setWdFilter(\'rejected\')">Rejected</button>' +
      '</div></div>' +
      '<div class="empty-state">no withdrawals yet</div>';
    return;
  }

  var p = paginate(source, _page.withdrawals);

  var html = '<div class="toolbar-sticky">' +
    '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">' +
    '<input type="text" id="wdSearchInput" placeholder="search by email, name or ID..." style="flex:1;min-width:180px;padding:10px 14px;background:#1a1a20;border:1px solid #2e2e3a;border-radius:8px;color:#e4e4ec;font-size:13px;outline:none;" oninput="filterWithdrawals()">' +
    '<button onclick="filterWithdrawals()" style="padding:10px 20px;background:#7c5bfa;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Search</button>' +
    '</div>' +
    '<div style="margin-bottom:14px;display:flex;gap:6px;flex-wrap:wrap;">' +
    '<button class="filter-btn' + (_wdFilterStatus === 'all' ? ' active' : '') + '" onclick="setWdFilter(\'all\')">All</button>' +
    '<button class="filter-btn' + (_wdFilterStatus === 'pending' ? ' active' : '') + '" onclick="setWdFilter(\'pending\')">Pending</button>' +
    '<button class="filter-btn' + (_wdFilterStatus === 'approved' ? ' active' : '') + '" onclick="setWdFilter(\'approved\')">Approved</button>' +
    '<button class="filter-btn' + (_wdFilterStatus === 'rejected' ? ' active' : '') + '" onclick="setWdFilter(\'rejected\')">Rejected</button>' +
    '</div></div>' +
    '<div class="user-grid">';

  var userMap = {};
  _allUsers.forEach(function (u) { userMap[u.id] = u; });

  p.items.forEach(function (w) {
    var u = userMap[w.user_id];
    var userLabel = getUserEmail(u);
    var accInfo = u ? (u.acc_type + ' — ' + (u.acc_name || '') + ' — ' + u.acc_num) : '—';
    var date = w.created_at ? new Date(w.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    var actions = '';
    if (w.status === 'pending') {
      actions = '<button class="action-btn btn-approve" onclick="approveWithdrawal(' + w.id + ')">Approve</button>' +
        '<button class="action-btn btn-reject" onclick="rejectWithdrawal(' + w.id + ')">Reject</button>';
    }

    html += '<div class="user-card">' +
      '<div class="uc-header"><span class="uc-email">' + escapeHtml(userLabel) + '</span></div>' +
      '<div class="uc-body">' +
        '<div class="uc-row"><span class="uc-label">Account</span><span class="uc-value">' + escapeHtml(accInfo) + '</span></div>' +
        '<div class="uc-row"><span class="uc-label">Amount</span><span class="uc-value"><strong>Rs' + w.amount.toFixed(2) + '</strong></span></div>' +
        '<div class="uc-row"><span class="uc-label">Date</span><span class="uc-value">' + date + '</span></div>' +
        '<div class="uc-row"><span class="uc-label">Status</span><span class="uc-value"><span class="badge badge-' + w.status + '">' + w.status + '</span></span></div>' +
      '</div>' +
      '<div class="uc-actions">' + actions + '</div>' +
    '</div>';
  });

  html += '</div>';
  html += '<div id="wdPageNav"></div>';
  container.innerHTML = html;
  renderPagination('wdPageNav', _page.withdrawals, p.pages, 'withdrawals');
}

function filterWithdrawals() {
  var q = document.getElementById('wdSearchInput').value.trim().toLowerCase();
  var source = _allWithdrawals;
  if (q || _wdFilterStatus !== 'all') {
    var userMap = {};
    _allUsers.forEach(function (u) { userMap[u.id] = u; });
    _filteredWithdrawals = source.filter(function (w) {
      var u = userMap[w.user_id];
      var email = (u && u.email || '').toLowerCase();
      var accName = (u && u.acc_name || '').toLowerCase();
      var idMatch = (w.user_id || '').toLowerCase().indexOf(q) !== -1;
      var matchSearch = !q || email.indexOf(q) !== -1 || accName.indexOf(q) !== -1 || idMatch;
      var matchStatus = _wdFilterStatus === 'all' || w.status === _wdFilterStatus;
      return matchSearch && matchStatus;
    });
  } else {
    _filteredWithdrawals = null;
  }
  _page.withdrawals = 1;
  var container = document.getElementById('tabContent');
  renderWithdrawals(container);
  var inp = document.getElementById('wdSearchInput');
  if (inp) { inp.value = q; inp.focus(); }
}

function setWdFilter(status) {
  _wdFilterStatus = status;
  filterWithdrawals();
}

async function approveWithdrawal(id) {
  var { error } = await supabase.from('withdrawals').update({ status: 'approved' }).eq('id', id);
  if (error) { adminToast(error.message); return; }
  for (var i = 0; i < _allWithdrawals.length; i++) {
    if (_allWithdrawals[i].id === id) { _allWithdrawals[i].status = 'approved'; break; }
  }
  adminToast('withdrawal approved');
  refreshTab();
}

async function rejectWithdrawal(id) {
  var { error } = await supabase.from('withdrawals').update({ status: 'rejected' }).eq('id', id);
  if (error) { adminToast(error.message); return; }
  for (var i = 0; i < _allWithdrawals.length; i++) {
    if (_allWithdrawals[i].id === id) { _allWithdrawals[i].status = 'rejected'; break; }
  }
  adminToast('withdrawal rejected');
  refreshTab();
}

/* ─── TASKS TAB ─── */
function renderTasks(container) {
  var source = _filteredTasks || _allTasks;
  if (source.length === 0) {
    container.innerHTML = '<div class="toolbar-sticky">' +
      '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">' +
      '<input type="text" id="taskSearchInput" placeholder="search by email, name or ID..." style="flex:1;min-width:180px;padding:10px 14px;background:#1a1a20;border:1px solid #2e2e3a;border-radius:8px;color:#e4e4ec;font-size:13px;outline:none;" oninput="filterTasks()">' +
      '<button onclick="filterTasks()" style="padding:10px 20px;background:#7c5bfa;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Search</button>' +
      '</div>' +
      '<div style="margin-bottom:14px;display:flex;gap:6px;flex-wrap:wrap;">' +
      '<button class="filter-btn' + (_taskFilterStatus === 'all' ? ' active' : '') + '" onclick="setTaskFilter(\'all\')">All</button>' +
      '<button class="filter-btn' + (_taskFilterStatus === 'pending' ? ' active' : '') + '" onclick="setTaskFilter(\'pending\')">Pending</button>' +
      '<button class="filter-btn' + (_taskFilterStatus === 'approved' ? ' active' : '') + '" onclick="setTaskFilter(\'approved\')">Approved</button>' +
      '<button class="filter-btn' + (_taskFilterStatus === 'rejected' ? ' active' : '') + '" onclick="setTaskFilter(\'rejected\')">Rejected</button>' +
      '</div></div>' +
      '<div class="empty-state">no task submissions yet</div>';
    return;
  }

  var p = paginate(source, _page.tasks);

  var html = '<div class="toolbar-sticky">' +
    '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">' +
    '<input type="text" id="taskSearchInput" placeholder="search by email, name or ID..." style="flex:1;min-width:180px;padding:10px 14px;background:#1a1a20;border:1px solid #2e2e3a;border-radius:8px;color:#e4e4ec;font-size:13px;outline:none;" oninput="filterTasks()">' +
    '<button onclick="filterTasks()" style="padding:10px 20px;background:#7c5bfa;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Search</button>' +
    '</div>' +
    '<div style="margin-bottom:14px;display:flex;gap:6px;flex-wrap:wrap;">' +
    '<button class="filter-btn' + (_taskFilterStatus === 'all' ? ' active' : '') + '" onclick="setTaskFilter(\'all\')">All</button>' +
    '<button class="filter-btn' + (_taskFilterStatus === 'pending' ? ' active' : '') + '" onclick="setTaskFilter(\'pending\')">Pending</button>' +
    '<button class="filter-btn' + (_taskFilterStatus === 'approved' ? ' active' : '') + '" onclick="setTaskFilter(\'approved\')">Approved</button>' +
    '<button class="filter-btn' + (_taskFilterStatus === 'rejected' ? ' active' : '') + '" onclick="setTaskFilter(\'rejected\')">Rejected</button>' +
    '</div></div>' +
    '<div class="user-grid">';

  html += buildTaskCards(p.items);
  html += '</div>';
  html += '<div id="taskPageNav"></div>';
  container.innerHTML = html;
  renderPagination('taskPageNav', _page.tasks, p.pages, 'tasks');
}

function buildTaskCards(tasks) {
  var userMap = {};
  _allUsers.forEach(function (u) { userMap[u.id] = u; });

  var cards = '';
  tasks.forEach(function (t) {
    var u = userMap[t.user_id];
    var userLabel = getUserEmail(u);
    var taskName = t.task_type === 'gemgala' ? 'Gemgala App' : t.task_type === 'hifami' ? 'HiFami App' : t.task_type;
    var date = t.created_at ? new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    var hasImg = t.image_url ? true : false;

    var actions = '';
    if (t.status === 'pending') {
      actions = '<button class="action-btn btn-approve" onclick="approveTask(' + t.id + ')">Approve</button>' +
        '<button class="action-btn btn-reject" onclick="rejectTask(' + t.id + ')">Reject</button>';
    }

    cards += '<div class="user-card">' +
      '<div class="uc-header"><span class="uc-email">' + escapeHtml(userLabel) + '</span></div>' +
      '<div class="uc-body">' +
        '<div class="uc-row"><span class="uc-label">Task</span><span class="uc-value">' + escapeHtml(taskName) + (hasImg ? ' <button class="view-btn" onclick="openTaskModal(' + t.id + ')">&#128247; view</button>' : '') + '</span></div>' +
        '<div class="uc-row"><span class="uc-label">App User ID</span><span class="uc-value">' + escapeHtml(t.app_user_id || '—') + '</span></div>' +
        '<div class="uc-row"><span class="uc-label">Amount</span><span class="uc-value">Rs' + (t.reward || 0).toFixed(2) + '</span></div>' +
        '<div class="uc-row"><span class="uc-label">Date</span><span class="uc-value">' + date + '</span></div>' +
        '<div class="uc-row"><span class="uc-label">Status</span><span class="uc-value"><span class="badge badge-' + t.status + '">' + t.status + '</span></span></div>' +
      '</div>' +
      '<div class="uc-actions">' + actions + '</div>' +
    '</div>';
  });
  return cards;
}

function filterTasks() {
  var q = document.getElementById('taskSearchInput').value.trim().toLowerCase();
  var source = _allTasks;
  if (q || _taskFilterStatus !== 'all') {
    var userMap = {};
    _allUsers.forEach(function (u) { userMap[u.id] = u; });
    _filteredTasks = source.filter(function (t) {
      var u = userMap[t.user_id];
      var email = (u && u.email || '').toLowerCase();
      var accName = (u && u.acc_name || '').toLowerCase();
      var idMatch = (t.user_id || '').toLowerCase().indexOf(q) !== -1;
      var matchSearch = !q || email.indexOf(q) !== -1 || accName.indexOf(q) !== -1 || idMatch;
      var matchStatus = _taskFilterStatus === 'all' || t.status === _taskFilterStatus;
      return matchSearch && matchStatus;
    });
  } else {
    _filteredTasks = null;
  }
  _page.tasks = 1;
  var container = document.getElementById('tabContent');
  renderTasks(container);
  var inp = document.getElementById('taskSearchInput');
  if (inp) { inp.value = q; inp.focus(); }
}

function setTaskFilter(status) {
  _taskFilterStatus = status;
  filterTasks();
}

async function approveTask(id) {
  var task = null;
  for (var i = 0; i < _allTasks.length; i++) {
    if (_allTasks[i].id === id) { task = _allTasks[i]; break; }
  }
  if (!task) { adminToast('task not found'); return; }

  var { data: userData } = await supabase.from('users')
    .select('balance, gross_earned')
    .eq('id', task.user_id)
    .maybeSingle();

  if (userData) {
    var reward = task.reward || 0;
    var newBal = (userData.balance || 0) + reward;
    var newGross = (userData.gross_earned || 0) + reward;
    await supabase.from('users').update({ balance: newBal, gross_earned: newGross }).eq('id', task.user_id);
  }

  var { error } = await supabase.from('tasks').update({ status: 'approved', reward_paid: true }).eq('id', id);
  if (error) { adminToast(error.message); return; }
  task.status = 'approved';
  adminToast('task approved, reward credited');
  refreshTab();
}

async function rejectTask(id) {
  var { error } = await supabase.from('tasks').update({ status: 'rejected' }).eq('id', id);
  if (error) { adminToast(error.message); return; }
  for (var i = 0; i < _allTasks.length; i++) {
    if (_allTasks[i].id === id) { _allTasks[i].status = 'rejected'; break; }
  }
  adminToast('task rejected');
  refreshTab();
}

/* ─── USERS TAB ─── */
function renderUsers(container) {
  var source = _filteredUsers || _allUsers;
  if (source.length === 0) {
    container.innerHTML = '<div class="empty-state">no users yet</div>';
    return;
  }

  var html = '<div class="toolbar-sticky">' +
    '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">' +
    '<input type="text" id="userSearchInput" placeholder="search by email, account, ref code, or ID..." style="flex:1;min-width:180px;padding:10px 14px;background:#1a1a20;border:1px solid #2e2e3a;border-radius:8px;color:#e4e4ec;font-size:13px;outline:none;" oninput="filterUsers()">' +
    '<button onclick="filterUsers()" style="padding:10px 20px;background:#7c5bfa;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Search</button>' +
    '</div></div>' +
    '<div class="user-grid">';

  var p = paginate(source, _page.users);

  p.items.forEach(function (u) {
    var date = '—';
    if (u.created_at) date = new Date(u.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    var refCode = u.referral_code || '—';

    html += '<div class="user-card">' +
      '<div class="uc-header"><span class="uc-email">' + escapeHtml(u.email || u.id) + '</span>' + (_bannedUsers.indexOf(u.id) !== -1 ? ' <span class="badge badge-banned" style="margin-left:8px;">banned</span>' : '') + '</div>' +
      '<div class="uc-body">' +
        '<div class="uc-row"><span class="uc-label">Account</span><span class="uc-value">' + escapeHtml((u.acc_type || '') + ' — ' + (u.acc_name || '')) + '</span></div>' +
        '<div class="uc-row"><span class="uc-label">Ref Code</span><span class="uc-value" style="font-family:monospace;color:#7c5bfa;font-weight:600;">' + escapeHtml(refCode) + '</span></div>' +
        '<div class="uc-row"><span class="uc-label">Balance</span><span class="uc-value">Rs' + (u.balance || 0).toFixed(2) + '</span></div>' +
        '<div class="uc-row"><span class="uc-label">Total Earned</span><span class="uc-value">Rs' + (u.total_earned || 0).toFixed(2) + '</span></div>' +
        '<div class="uc-row"><span class="uc-label">Gross Earned</span><span class="uc-value">Rs' + (u.gross_earned || 0).toFixed(2) + '</span></div>' +
        '<div class="uc-row"><span class="uc-label">Joined</span><span class="uc-value">' + date + '</span></div>' +
      '</div>' +
      '<div class="uc-actions">' +
        '<button class="action-btn" style="background:#3498db;color:#fff;" onclick="openEditUser(\'' + u.id + '\')">Edit</button> ' +
        (_bannedUsers.indexOf(u.id) !== -1
          ? '<button class="action-btn" style="background:#2ecc71;color:#fff;" onclick="unbanUser(\'' + u.id + '\')">Unban</button> '
          : '<button class="action-btn" style="background:#e67e22;color:#fff;" onclick="banUser(\'' + u.id + '\')">Ban</button> ') +
        '<button class="action-btn btn-reject" onclick="openDeleteUser(\'' + u.id + '\')">Del</button>' +
      '</div>' +
    '</div>';
  });

  html += '</div>';
  html += '<div id="userPageNav"></div>';
  container.innerHTML = html;
  renderPagination('userPageNav', _page.users, p.pages, 'users');
}

function filterUsers() {
  var q = document.getElementById('userSearchInput').value.trim().toLowerCase();
  _filteredUsers = null;
  if (q) {
    _filteredUsers = _allUsers.filter(function (u) {
      var email = (u.email || '').toLowerCase();
      var account = ((u.acc_type || '') + ' ' + (u.acc_name || '') + ' ' + (u.acc_num || '')).toLowerCase();
      var ref = (u.referral_code || '').toLowerCase();
      var id = (u.id || '').toLowerCase();
      return email.indexOf(q) !== -1 || account.indexOf(q) !== -1 || ref.indexOf(q) !== -1 || id.indexOf(q) !== -1;
    });
  }
  _page.users = 1;
  var container = document.getElementById('tabContent');
  renderUsers(container);
  var inp = document.getElementById('userSearchInput');
  if (inp) { inp.value = q; inp.focus(); }
}

/* ─── EDIT USER ─── */
var _editingUserId = null;

function openEditUser(userId) {
  var u = null;
  for (var i = 0; i < _allUsers.length; i++) {
    if (_allUsers[i].id === userId) { u = _allUsers[i]; break; }
  }
  if (!u) return;
  _editingUserId = userId;
  document.getElementById('editUserLabel').textContent = 'Editing: ' + (u.email || u.id);
  document.getElementById('editAccType').value = u.acc_type || '';
  document.getElementById('editAccName').value = u.acc_name || '';
  document.getElementById('editAccNum').value = u.acc_num || '';
  document.getElementById('editBalance').value = u.balance || 0;
  document.getElementById('editTotalEarned').value = u.total_earned || 0;
  document.getElementById('editGrossEarned').value = u.gross_earned || 0;
  document.getElementById('editUserMsg').textContent = '';
  document.getElementById('editUserModal').classList.remove('off');
}

function closeEditUser() {
  document.getElementById('editUserModal').classList.add('off');
  _editingUserId = null;
}

async function saveEditUser() {
  if (!_editingUserId) return;
  var data = {
    acc_type: document.getElementById('editAccType').value.trim(),
    acc_name: document.getElementById('editAccName').value.trim(),
    acc_num: document.getElementById('editAccNum').value.trim(),
    balance: parseFloat(document.getElementById('editBalance').value) || 0,
    total_earned: parseFloat(document.getElementById('editTotalEarned').value) || 0,
    gross_earned: parseFloat(document.getElementById('editGrossEarned').value) || 0
  };
  var { error } = await supabase.from('users').update(data).eq('id', _editingUserId);
  if (error) { document.getElementById('editUserMsg').textContent = error.message; return; }
  closeEditUser();
  adminToast('user updated');
  refreshAll();
}

/* ─── BAN / UNBAN USER ─── */
function banUser(userId) {
  if (_bannedUsers.indexOf(userId) !== -1) return;
  _bannedUsers.push(userId);
  saveBannedUsers();
  adminToast('user banned');
  refreshTab();
}

function unbanUser(userId) {
  var idx = _bannedUsers.indexOf(userId);
  if (idx === -1) return;
  _bannedUsers.splice(idx, 1);
  saveBannedUsers();
  adminToast('user unbanned');
  refreshTab();
}

/* ─── DELETE USER ─── */
var _deletingUserId = null;

function openDeleteUser(userId) {
  var u = null;
  for (var i = 0; i < _allUsers.length; i++) {
    if (_allUsers[i].id === userId) { u = _allUsers[i]; break; }
  }
  if (!u) return;
  _deletingUserId = userId;
  document.getElementById('deleteUserLabel').textContent = (u.email || u.id);
  document.getElementById('deleteUserMsg').textContent = '';
  document.getElementById('deleteUserModal').classList.remove('off');
}

function closeDeleteUser() {
  document.getElementById('deleteUserModal').classList.add('off');
  _deletingUserId = null;
}

async function confirmDeleteUser() {
  if (!_deletingUserId) return;
  var btn = document.querySelector('#deleteUserModal button');
  btn.disabled = true;
  btn.textContent = 'deleting...';

  /* try RPC first (deletes auth + db), fallback to db-only */
  var { error } = await supabase.rpc('admin_delete_user', { target_user_id: _deletingUserId });
  if (error) {
    /* fallback: delete from public tables only */
    await supabase.from('tasks').delete().eq('user_id', _deletingUserId);
    await supabase.from('withdrawals').delete().eq('user_id', _deletingUserId);
    await supabase.from('users').delete().eq('id', _deletingUserId);
    adminToast('user deleted from database (Auth delete requires Supabase SQL)');
  } else {
    adminToast('user deleted from Auth & database');
  }

  btn.disabled = false;
  btn.textContent = 'Delete Forever';
  closeDeleteUser();
  refreshAll();
}

/* ─── TASK MODAL ─── */
function openTaskModal(taskId) {
  var task = null;
  for (var i = 0; i < _allTasks.length; i++) {
    if (_allTasks[i].id === taskId) { task = _allTasks[i]; break; }
  }
  if (!task) return;

  var userMap = {};
  _allUsers.forEach(function (u) { userMap[u.id] = u; });
  var u = userMap[task.user_id];

  document.getElementById('modalImage').src = task.image_url || '';
  document.getElementById('modalImage').alt = 'task screenshot';

  var taskName = task.task_type === 'gemgala' ? 'Gemgala App' : task.task_type === 'hifami' ? 'HiFami App' : task.task_type;
  var date = task.created_at ? new Date(task.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  document.getElementById('modalDetails').innerHTML =
    '<div class="detail-row"><span class="detail-label">User</span><span class="detail-value">' + escapeHtml(u ? u.email : '—') + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">Task</span><span class="detail-value">' + escapeHtml(taskName) + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">App User ID</span><span class="detail-value">' + escapeHtml(task.app_user_id || '—') + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">Reward</span><span class="detail-value">Rs' + (task.reward || 0).toFixed(2) + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">Status</span><span class="badge badge-' + task.status + '">' + task.status + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">' + date + '</span></div>';

  var actions = document.getElementById('modalActions');
  actions.innerHTML = '';
  if (task.status === 'pending') {
    var approveBtn = document.createElement('button');
    approveBtn.className = 'action-btn btn-approve';
    approveBtn.textContent = 'Approve';
    approveBtn.onclick = function () { closeTaskModal(); approveTask(task.id); };
    var rejectBtn = document.createElement('button');
    rejectBtn.className = 'action-btn btn-reject';
    rejectBtn.textContent = 'Reject';
    rejectBtn.onclick = function () { closeTaskModal(); rejectTask(task.id); };
    actions.appendChild(approveBtn);
    actions.appendChild(rejectBtn);
  }

  document.getElementById('taskModal').classList.remove('off');
}

function closeTaskModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('taskModal').classList.add('off');
}

/* ─── TOAST ─── */
function adminToast(msg) {
  var el = document.getElementById('adminToast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove('show'); }, 2500);
}

/* ─── HELPERS ─── */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


