var SUPABASE_URL = 'https://pxsdcnsuqgarknbaczsd.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4c2RjbnN1cWdhcmtuYmFjenNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MTM0MjEsImV4cCI6MjA5NTE4OTQyMX0.oEDW_8Rgahqcp775C-ZtXNqu9rx26Bc1SYALXj7JXYM';
var supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

var ADMIN_EMAIL = 'admin@adakam.com';
var _allTasks = [];
var _allUsers = [];
var _filtered = [];
var _statusFilter = 'all';
var _page = 1;
var PER_PAGE = 10;

/* ─── AUTH ─── */
function getPass() {
  try { return localStorage.getItem('tkAdminPass') || 'admin123'; } catch(e) { return 'admin123'; }
}

async function ensureSession() {
  var { data: { session } } = await supabase.auth.getSession();
  if (session && session.user && session.user.email === ADMIN_EMAIL) return true;
  var pw = getPass();
  if (pw === 'admin123') return false;
  var { data, error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: pw });
  return !error && data.user;
}

function adminLogin() {
  var pass = document.getElementById('adminPass').value;
  var msg = document.getElementById('loginMsg');
  var btn = document.getElementById('loginBtn');
  if (pass !== getPass()) { msg.textContent = 'invalid password'; return; }
  msg.textContent = '';
  btn.disabled = true;
  btn.textContent = 'signing in...';

  ensureSession().then(function(ok) {
    if (!ok) {
      msg.textContent = 'Supabase sign in failed, check password set in admin panel';
      btn.disabled = false;
      btn.textContent = 'Sign In';
      return;
    }
    localStorage.setItem('tkAdminSession', 'true');
    btn.disabled = false;
    btn.textContent = 'Sign In';
    showApp();
  });
}

function logout() {
  try { localStorage.removeItem('tkAdminSession'); } catch(e) {}
  supabase.auth.signOut();
  document.getElementById('mainScreen').classList.add('off');
  document.getElementById('loginScreen').classList.remove('off');
  document.getElementById('adminPass').value = '';
}

(function init() {
  if (localStorage.getItem('tkAdminSession') === 'true') {
    ensureSession().then(function(ok) { if (ok) showApp(); });
  }
})();

function showApp() {
  document.getElementById('loginScreen').classList.add('off');
  document.getElementById('mainScreen').classList.remove('off');
  loadData();
  setInterval(loadData, 15000);
}

async function loadData() {
  await Promise.all([fetchUsers(), fetchTasks()]);
  applyFilters();
}

async function fetchUsers() {
  var { data } = await supabase.from('users').select('id,email').order('email');
  if (data) _allUsers = data;
}

async function fetchTasks() {
  var { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(200);
  if (data) _allTasks = data;
}

function getEmail(userId) {
  for (var i = 0; i < _allUsers.length; i++) {
    if (_allUsers[i].id === userId) return _allUsers[i].email || userId;
  }
  return userId;
}

/* ─── FILTERS ─── */
function setFilter(status, btn) {
  _statusFilter = status;
  _page = 1;
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  applyFilters();
}

function doSearch() {
  _page = 1;
  applyFilters();
}

function applyFilters() {
  var q = document.getElementById('searchInput').value.trim().toLowerCase();

  _filtered = _allTasks.filter(function(t) {
    if (_statusFilter !== 'all' && t.status !== _statusFilter) return false;
    if (q) {
      var email = getEmail(t.user_id).toLowerCase();
      if (email.indexOf(q) === -1) return false;
    }
    return true;
  });

  render();
}

/* ─── RENDER ─── */
function render() {
  var container = document.getElementById('taskList');
  var stats = { pending: 0, approved: 0, rejected: 0 };

  _allTasks.forEach(function(t) {
    if (t.status === 'pending') stats.pending++;
    else if (t.status === 'approved') stats.approved++;
    else if (t.status === 'rejected') stats.rejected++;
  });

  document.getElementById('statPending').textContent = stats.pending;
  document.getElementById('statApproved').textContent = stats.approved;
  document.getElementById('statTotal').textContent = _allTasks.length;

  var start = (_page - 1) * PER_PAGE;
  var pageItems = _filtered.slice(start, start + PER_PAGE);
  var totalPages = Math.ceil(_filtered.length / PER_PAGE);

  if (_filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">no tasks found</div>';
    document.getElementById('pageNav').innerHTML = '';
    return;
  }

  container.innerHTML = '';
  pageItems.forEach(function(t) {
    var u = getEmail(t.user_id);
    var taskName = t.task_type === 'gemgala' ? 'Gemgala' : t.task_type === 'hifami' ? 'HiFami' : t.task_type;
    var reward = 'Rs' + (t.reward || 0).toFixed(2);
    var date = t.created_at ? new Date(t.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) : '';

    var card = document.createElement('div');
    card.className = 'task-card';

    card.innerHTML =
      '<div class="task-card-top">' +
        '<div><div class="task-user">' + esc(u) + '</div><div class="task-type">' + taskName + '</div></div>' +
        '<span class="badge badge-' + t.status + '">' + t.status + '</span>' +
      '</div>' +
      '<div class="task-meta">' +
        '<span>' + reward + '</span>' +
        '<span>' + date + '</span>' +
        (t.app_user_id ? '<span>ID: ' + esc(t.app_user_id) + '</span>' : '') +
        (t.image_url ? '<button class="btn-view" onclick="openModal(' + t.id + ')">&#128247; View</button>' : '') +
      '</div>';

    if (t.status === 'pending') {
      var actions = document.createElement('div');
      actions.className = 'task-actions';
      actions.innerHTML =
        '<button class="btn-approve" onclick="approve(' + t.id + ')">Approve</button>' +
        '<button class="btn-reject" onclick="reject(' + t.id + ')">Reject</button>';
      card.appendChild(actions);
    }

    container.appendChild(card);
  });

  /* pagination */
  var nav = document.getElementById('pageNav');
  if (totalPages <= 1) { nav.innerHTML = ''; return; }
  var h = '<div class="page-nav">';
  h += '<button class="page-btn"' + (_page <= 1 ? ' disabled' : '') + ' onclick="goPage(' + (_page - 1) + ')">&#9664;</button>';
  h += '<span class="page-info">' + _page + ' / ' + totalPages + '</span>';
  h += '<button class="page-btn"' + (_page >= totalPages ? ' disabled' : '') + ' onclick="goPage(' + (_page + 1) + ')">&#9654;</button>';
  h += '</div>';
  nav.innerHTML = h;
}

function goPage(p) {
  if (p < 1) return;
  _page = p;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─── ACTIONS ─── */
async function approve(id) {
  if (!confirm('Approve this task? Reward will be credited.')) return;
  var task = null;
  for (var i = 0; i < _allTasks.length; i++) { if (_allTasks[i].id === id) { task = _allTasks[i]; break; } }
  if (!task) return;

  var { data: u } = await supabase.from('users').select('balance, gross_earned').eq('id', task.user_id).maybeSingle();
  if (u) {
    var r = task.reward || 0;
    await supabase.from('users').update({ balance: (u.balance || 0) + r, gross_earned: (u.gross_earned || 0) + r }).eq('id', task.user_id);
  }
  await supabase.from('tasks').update({ status: 'approved', reward_paid: true }).eq('id', id);
  toast('task approved');
  loadData();
}

async function reject(id) {
  if (!confirm('Reject this task? User will not be paid.')) return;
  await supabase.from('tasks').update({ status: 'rejected' }).eq('id', id);
  toast('task rejected');
  loadData();
}

/* ─── IMAGE ZOOM / PAN ─── */
var _zoom = { scale: 1, x: 0, y: 0, img: null, touching: false, lastDist: 0, lastCX: 0, lastCY: 0, lastTX: 0, lastTY: 0 };

function initZoom(img) {
  _zoom.scale = 1; _zoom.x = 0; _zoom.y = 0; _zoom.img = img;
  applyZoom();
}

function applyZoom() {
  var z = _zoom;
  if (!z.img) return;
  z.img.style.transform = 'translate(' + z.x + 'px, ' + z.y + 'px) scale(' + z.scale + ')';
  z.img.style.cursor = z.scale > 1 ? 'grab' : 'zoom-in';
}

/* touch handlers */
var _zoomWrap = document.getElementById('modalImgWrap');

_zoomWrap.addEventListener('touchstart', function(e) {
  if (e.target !== document.getElementById('modalImg')) return;
  var touches = e.touches;
  if (touches.length === 1) {
    _zoom.touching = true;
    _zoom.lastTX = touches[0].clientX - _zoom.x;
    _zoom.lastTY = touches[0].clientY - _zoom.y;
  } else if (touches.length === 2) {
    _zoom.touching = true;
    _zoom.lastDist = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    _zoom.lastCX = (touches[0].clientX + touches[1].clientX) / 2;
    _zoom.lastCY = (touches[0].clientY + touches[1].clientY) / 2;
    _zoom.lastScale = _zoom.scale;
    _zoom.lastX = _zoom.x;
    _zoom.lastY = _zoom.y;
  }
}, { passive: true });

_zoomWrap.addEventListener('touchmove', function(e) {
  if (!_zoom.touching || !_zoom.img) return;
  var touches = e.touches;
  if (touches.length === 1 && _zoom.scale > 1) {
    _zoom.x = touches[0].clientX - _zoom.lastTX;
    _zoom.y = touches[0].clientY - _zoom.lastTY;
    applyZoom();
  } else if (touches.length === 2) {
    var dist = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    var cx = (touches[0].clientX + touches[1].clientX) / 2;
    var cy = (touches[0].clientY + touches[1].clientY) / 2;
    var s = (_zoom.lastScale || 1) * (dist / (_zoom.lastDist || 1));
    s = Math.max(1, Math.min(s, 6));
    _zoom.scale = s;
    _zoom.x = (_zoom.lastX || 0) + (cx - (_zoom.lastCX || 0)) * (1 - 1/s);
    _zoom.y = (_zoom.lastY || 0) + (cy - (_zoom.lastCY || 0)) * (1 - 1/s);
    applyZoom();
  }
}, { passive: true });

_zoomWrap.addEventListener('touchend', function(e) {
  if (e.touches.length === 0) _zoom.touching = false;
}, { passive: true });

/* mouse wheel zoom */
_zoomWrap.addEventListener('wheel', function(e) {
  if (e.target !== document.getElementById('modalImg')) return;
  e.preventDefault();
  var delta = e.deltaY > 0 ? 0.9 : 1.1;
  var s = Math.max(1, Math.min(_zoom.scale * delta, 6));
  var rect = _zoomWrap.getBoundingClientRect();
  var mx = e.clientX - rect.left;
  var my = e.clientY - rect.top;
  _zoom.x = mx - (mx - _zoom.x) * (s / _zoom.scale);
  _zoom.y = my - (my - _zoom.y) * (s / _zoom.scale);
  _zoom.scale = s;
  applyZoom();
}, { passive: false });

/* double-tap / double-click to reset */
_zoomWrap.addEventListener('dblclick', function(e) {
  if (e.target !== document.getElementById('modalImg')) return;
  if (_zoom.scale > 1) { _zoom.scale = 1; _zoom.x = 0; _zoom.y = 0; applyZoom(); }
  else { _zoom.scale = 2.5; _zoom.x = 0; _zoom.y = 0; applyZoom(); }
});

/* ─── MODAL ─── */
function openModal(taskId) {
  var task = null;
  for (var i = 0; i < _allTasks.length; i++) { if (_allTasks[i].id === taskId) { task = _allTasks[i]; break; } }
  if (!task) return;

  var u = getEmail(task.user_id);
  var taskName = task.task_type === 'gemgala' ? 'Gemgala App' : task.task_type === 'hifami' ? 'HiFami App' : task.task_type;
  var date = task.created_at ? new Date(task.created_at).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';

  var imgEl = document.getElementById('modalImg');
  imgEl.src = task.image_url || '';
  imgEl.onload = function() { initZoom(imgEl); };
  document.getElementById('modalInfo').innerHTML =
    '<div class="mi-row"><span class="mi-label">User</span><span class="mi-value">' + esc(u) + '</span></div>' +
    '<div class="mi-row"><span class="mi-label">Task</span><span class="mi-value">' + taskName + '</span></div>' +
    '<div class="mi-row"><span class="mi-label">App ID</span><span class="mi-value">' + esc(task.app_user_id || '—') + '</span></div>' +
    '<div class="mi-row"><span class="mi-label">Reward</span><span class="mi-value">Rs' + (task.reward || 0).toFixed(2) + '</span></div>' +
    '<div class="mi-row"><span class="mi-label">Status</span><span class="badge badge-' + task.status + '">' + task.status + '</span></div>' +
    '<div class="mi-row"><span class="mi-label">Date</span><span class="mi-value">' + date + '</span></div>';

  var actions = document.getElementById('modalActions');
  actions.innerHTML = '';
  if (task.status === 'pending') {
    var a = document.createElement('button'); a.className = 'btn-approve'; a.textContent = 'Approve';
    a.onclick = function() { closeModal(); approve(task.id); };
    var b = document.createElement('button'); b.className = 'btn-reject'; b.textContent = 'Reject';
    b.onclick = function() { closeModal(); reject(task.id); };
    actions.appendChild(a); actions.appendChild(b);
  }

  document.getElementById('taskModal').classList.remove('off');
}

function closeModal() {
  document.getElementById('taskModal').classList.add('off');
}

/* ─── TOAST ─── */
function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.classList.remove('show'); }, 2000);
}

function esc(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
