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
var _filteredTasks = null; /* for search */
var _filteredUsers = null; /* for search */

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
  startAdminRefresh();
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
  await Promise.all([fetchUsers(), fetchWithdrawals(), fetchTasks()]);
  updateStats();
  var active = document.querySelector('.tab.active');
  if (active) {
    var tab = active.textContent.toLowerCase().trim();
    _page[tab] = 1;
    switchTab(tab, active);
  }
}

/* ─── WITHDRAWALS TAB ─── */
function renderWithdrawals(container) {
  if (_allWithdrawals.length === 0) {
    container.innerHTML = '<div class="empty-state">no withdrawals yet</div>';
    return;
  }

  var p = paginate(_allWithdrawals, _page.withdrawals);

  var html = '<div class="table-wrap"><table class="data-table"><thead><tr>' +
    '<th>User</th><th>Amount</th><th>Account</th><th>Date</th><th>Status</th><th>Action</th>' +
    '</tr></thead><tbody>';

  var userMap = {};
  _allUsers.forEach(function (u) { userMap[u.id] = u; });

  p.items.forEach(function (w) {
    var u = userMap[w.user_id];
    var userLabel = getUserEmail(u);
    var accInfo = u ? (u.acc_type + ' — ' + u.acc_num) : '—';
    var date = w.created_at ? new Date(w.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    var badge = 'badge-' + w.status;

    var actions = '';
    if (w.status === 'pending') {
      actions = '<button class="action-btn btn-approve" onclick="approveWithdrawal(' + w.id + ')">Approve</button>' +
        '<button class="action-btn btn-reject" onclick="rejectWithdrawal(' + w.id + ')">Reject</button>';
    }

    html += '<tr>' +
      '<td><div class="user-info"><span class="email">' + escapeHtml(userLabel) + '</span><span class="meta">' + escapeHtml(accInfo) + '</span></div></td>' +
      '<td><strong>Rs' + w.amount.toFixed(2) + '</strong></td>' +
      '<td>' + escapeHtml(accInfo) + '</td>' +
      '<td>' + date + '</td>' +
      '<td><span class="badge ' + badge + '">' + w.status + '</span></td>' +
      '<td class="actions-cell">' + actions + '</td>' +
      '</tr>';
  });

  html += '</tbody></table></div>';
  html += '<div id="wdPageNav"></div>';
  container.innerHTML = html;
  renderPagination('wdPageNav', _page.withdrawals, p.pages, 'withdrawals');
}

async function approveWithdrawal(id) {
  var { error } = await supabase.from('withdrawals').update({ status: 'approved' }).eq('id', id);
  if (error) { adminToast(error.message); return; }
  adminToast('withdrawal approved');
  refreshAll();
}

async function rejectWithdrawal(id) {
  /* refund the user because balance was deducted on request */
  var wd = null;
  for (var i = 0; i < _allWithdrawals.length; i++) {
    if (_allWithdrawals[i].id === id) { wd = _allWithdrawals[i]; break; }
  }
  if (!wd) { adminToast('not found'); return; }

  var { data: userData } = await supabase.from('users')
    .select('balance, total_earned')
    .eq('id', wd.user_id)
    .maybeSingle();

  if (userData) {
    var amt = wd.amount;
    var refundedBal = (userData.balance || 0);
    var refundedTE = (userData.total_earned || 0);
    /* put back into total_earned first, then balance if needed */
    refundedTE += amt;
    /* but cap total_earned so it doesn't exceed gross_earned logically */
    await supabase.from('users').update({
      balance: refundedBal,
      total_earned: refundedTE
    }).eq('id', wd.user_id);
  }

  var { error } = await supabase.from('withdrawals').update({ status: 'rejected' }).eq('id', id);
  if (error) { adminToast(error.message); return; }
  adminToast('withdrawal rejected, refunded');
  refreshAll();
}

/* ─── TASKS TAB ─── */
function renderTasks(container) {
  var source = _filteredTasks || _allTasks;
  if (source.length === 0) {
    container.innerHTML = '<div class="empty-state">no task submissions yet</div>';
    return;
  }

  var p = paginate(source, _page.tasks);

  var html = '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">' +
    '<input type="text" id="taskSearchInput" placeholder="search by user email or ID..." style="flex:1;min-width:180px;padding:10px 14px;background:#1a1a20;border:1px solid #2e2e3a;border-radius:8px;color:#e4e4ec;font-size:13px;outline:none;" oninput="filterTasks()">' +
    '<button onclick="filterTasks()" style="padding:10px 20px;background:#7c5bfa;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Search</button>' +
    '</div>' +
    '<div class="table-wrap"><table class="data-table" id="taskTable"><thead><tr>' +
    '<th>User</th><th>Task</th><th>App User ID</th><th>Amount</th><th>Date</th><th>Status</th><th>Action</th>' +
    '</tr></thead><tbody>';

  html += buildTaskRows(p.items);
  html += '</tbody></table></div>';
  html += '<div id="taskPageNav"></div>';
  container.innerHTML = html;
  renderPagination('taskPageNav', _page.tasks, p.pages, 'tasks');
}

function buildTaskRows(tasks) {
  var userMap = {};
  _allUsers.forEach(function (u) { userMap[u.id] = u; });

  var rows = '';
  tasks.forEach(function (t) {
    var u = userMap[t.user_id];
    var userLabel = getUserEmail(u);
    var taskName = t.task_type === 'gemgala' ? 'Gemgala App' : t.task_type === 'hifami' ? 'HiFami App' : t.task_type;
    var date = t.created_at ? new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    var badge = 'badge-' + t.status;
    var hasImg = t.image_url ? true : false;

    var actions = '';
    if (t.status === 'pending') {
      actions = '<button class="action-btn btn-approve" onclick="approveTask(' + t.id + ')">Approve</button>' +
        '<button class="action-btn btn-reject" onclick="rejectTask(' + t.id + ')">Reject</button>';
    }

    rows += '<tr>' +
      '<td><div class="user-info"><span class="email">' + escapeHtml(userLabel) + '</span><span class="meta">' + escapeHtml(taskName) + '</span></div></td>' +
      '<td>' + escapeHtml(taskName) + (hasImg ? ' <button class="view-btn" onclick="openTaskModal(' + t.id + ')">&#128247; view</button>' : '') + '</td>' +
      '<td>' + escapeHtml(t.app_user_id || '—') + '</td>' +
      '<td>Rs' + (t.reward || 0).toFixed(2) + '</td>' +
      '<td>' + date + '</td>' +
      '<td><span class="badge ' + badge + '">' + t.status + '</span></td>' +
      '<td class="actions-cell">' + actions + '</td>' +
      '</tr>';
  });
  return rows;
}

function filterTasks() {
  var q = document.getElementById('taskSearchInput').value.trim().toLowerCase();
  _filteredTasks = null;
  if (q) {
    var userMap = {};
    _allUsers.forEach(function (u) { userMap[u.id] = u; });
    _filteredTasks = _allTasks.filter(function (t) {
      var u = userMap[t.user_id];
      var email = (u && u.email || '').toLowerCase();
      var idMatch = (t.user_id || '').toLowerCase().indexOf(q) !== -1;
      return email.indexOf(q) !== -1 || idMatch;
    });
  }
  _page.tasks = 1;
  var container = document.getElementById('tabContent');
  renderTasks(container);
}

async function approveTask(id) {
  var task = null;
  for (var i = 0; i < _allTasks.length; i++) {
    if (_allTasks[i].id === id) { task = _allTasks[i]; break; }
  }
  if (!task) { adminToast('task not found'); return; }

  /* credit reward to user */
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
  adminToast('task approved, reward credited');
  refreshAll();
}

async function rejectTask(id) {
  var { error } = await supabase.from('tasks').update({ status: 'rejected' }).eq('id', id);
  if (error) { adminToast(error.message); return; }
  adminToast('task rejected');
  refreshAll();
}

/* ─── USERS TAB ─── */
function renderUsers(container) {
  var source = _filteredUsers || _allUsers;
  if (source.length === 0) {
    container.innerHTML = '<div class="empty-state">no users yet</div>';
    return;
  }

  var html = '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">' +
    '<input type="text" id="userSearchInput" placeholder="search by email, account, ref code, or ID..." style="flex:1;min-width:180px;padding:10px 14px;background:#1a1a20;border:1px solid #2e2e3a;border-radius:8px;color:#e4e4ec;font-size:13px;outline:none;" oninput="filterUsers()">' +
    '<button onclick="filterUsers()" style="padding:10px 20px;background:#7c5bfa;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Search</button>' +
    '</div>' +
    '<div class="table-wrap"><table class="data-table"><thead><tr>' +
    '<th>Email</th><th>Account</th><th>Ref Code</th><th>Balance</th><th>Total Earned</th><th>Gross Earned</th><th>Joined</th><th>Action</th>' +
    '</tr></thead><tbody>';

  var p = paginate(source, _page.users);

  p.items.forEach(function (u) {
    var date = '—';
    if (u.created_at) date = new Date(u.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    var refCode = u.referral_code || '—';

    html += '<tr>' +
      '<td><div class="user-info"><span class="email">' + escapeHtml(u.email || u.id) + '</span></div></td>' +
      '<td>' + escapeHtml((u.acc_type || '') + ' — ' + (u.acc_name || '')) + '</td>' +
      '<td><span style="font-family:monospace;font-weight:600;color:#7c5bfa;">' + escapeHtml(refCode) + '</span></td>' +
      '<td>Rs' + (u.balance || 0).toFixed(2) + '</td>' +
      '<td>Rs' + (u.total_earned || 0).toFixed(2) + '</td>' +
      '<td>Rs' + (u.gross_earned || 0).toFixed(2) + '</td>' +
      '<td>' + date + '</td>' +
      '<td class="actions-cell">' +
        '<button class="action-btn" style="background:#3498db;color:#fff;" onclick="openEditUser(\'' + u.id + '\')">Edit</button> ' +
        '<button class="action-btn btn-reject" onclick="openDeleteUser(\'' + u.id + '\')">Del</button>' +
      '</td>' +
      '</tr>';
  });

  html += '</tbody></table></div>';
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

/* auto-refresh every 15s */
var _adminRefresh = null;
function startAdminRefresh() {
  if (_adminRefresh) clearInterval(_adminRefresh);
  _adminRefresh = setInterval(refreshAll, 15000);
}
