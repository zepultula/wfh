const thM=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const thD=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
let currentUser = null;
let currentReportId = null;
let currentReportExists = false;
let viewDate = null;       // null = today
let isHistoryMode = false;

function tick(){
  const n=new Date();
  const d=`${n.getDate()} ${thM[n.getMonth()]} ${n.getFullYear()+543}`;
  const t=`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
  const full=`วัน${thD[n.getDay()]}ที่ ${d}`;
  const el1=document.getElementById('e-ts'); if(el1) el1.textContent=full;
  const el2=document.getElementById('e-ts2'); if(el2) el2.textContent=`${d} · ${t}`;
}
tick(); setInterval(tick,1000);

/* ── Date helpers ── */
function getTodayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}

function formatDateThai(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `วัน${thD[d.getDay()]}ที่ ${d.getDate()} ${thM[d.getMonth()]} ${d.getFullYear()+543}`;
}

/* ── Date navigation ── */
function navigateDate(delta) {
  const today = getTodayStr();
  const base = viewDate || today;
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  const newDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if (newDate > today) return;
  viewDate = newDate === today ? null : newDate;
  updateDateNav();
  loadReport(newDate);
}

function goToToday() {
  viewDate = null;
  updateDateNav();
  loadReport(getTodayStr());
}

function onDateInputChange(val) {
  if (!val) return;
  const today = getTodayStr();
  if (val > today) return;
  viewDate = val === today ? null : val;
  updateDateNav();
  loadReport(val);
}

function updateDateNav() {
  const today = getTodayStr();
  const current = viewDate || today;

  const displayEl = document.getElementById('nav-date-display');
  if (displayEl) displayEl.textContent = formatDateThai(current);

  const inputEl = document.getElementById('nav-date-input');
  if (inputEl) { inputEl.value = current; inputEl.max = today; }

  isHistoryMode = (current !== today);

  // History banner
  const banner = document.getElementById('history-banner');
  if (banner) banner.style.display = isHistoryMode ? 'flex' : 'none';
  const bannerText = document.getElementById('history-banner-text');
  if (bannerText && isHistoryMode)
    bannerText.textContent = `กำลังดูรายงานย้อนหลัง — ${formatDateThai(current)} · ไม่สามารถแก้ไขได้`;

  // Buttons
  const todayBtn = document.getElementById('btn-goto-today');
  if (todayBtn) todayBtn.style.display = isHistoryMode ? '' : 'none';
  const nextBtn = document.getElementById('btn-next-day');
  if (nextBtn) nextBtn.disabled = !isHistoryMode;

  // Show/hide action elements
  const addBtn = document.getElementById('e-add');
  const submitBtn = document.getElementById('btn-submit');
  const composeBox = document.getElementById('e-compose-box');
  if (addBtn) addBtn.style.display = isHistoryMode ? 'none' : '';
  if (submitBtn) submitBtn.style.display = isHistoryMode ? 'none' : '';
  if (composeBox) composeBox.style.display = isHistoryMode ? 'none' : '';

  // CSS class for visual read-only state
  const screen = document.getElementById('screen-emp');
  if (screen) {
    if (isHistoryMode) screen.classList.add('history-mode');
    else screen.classList.remove('history-mode');
  }
}

/* ── Task status handlers ── */
function setupTaskStatusHandlers(row) {
  const spills = row.querySelector('.spills');
  spills.querySelectorAll('.sp').forEach(span => {
    span.style.cursor = 'pointer';
    span.addEventListener('click', () => {
      if (isHistoryMode) return;
      spills.querySelectorAll('.sp').forEach(s => s.classList.remove('on'));
      span.classList.add('on');
    });
  });
}

/* ── Load report ── */
async function loadReport(dateStr) {
  if (!currentUser) return;
  const tasksEl = document.getElementById('e-tasks');
  if (tasksEl) tasksEl.innerHTML = '<div class="ld-wrap"><div class="ld-spin"></div><span class="ld-dots">กำลังโหลด</span></div>';
  try {
    const reportId = `${currentUser.user_id}_${dateStr}`;
    currentReportId = reportId;

    const cmtAv = document.getElementById('e-cmt-av');
    if (cmtAv) cmtAv.textContent = getInitials(currentUser.name);
    const cmtName = document.getElementById('e-cmt-name');
    if (cmtName) cmtName.textContent = currentUser.name + ' · ส่งข้อความถึงหัวหน้างาน';

    const res = await fetch(`/api/reports/${reportId}`);
    if (res.ok) {
      const report = await res.json();
      currentReportExists = true;
      populateEmployeeForm(report, isHistoryMode);
    } else {
      currentReportExists = false;
      populateEmployeeForm(null, isHistoryMode);
    }
  } catch(e) {
    populateEmployeeForm(null, isHistoryMode);
  }
}

// Alias used by initializeApp
function loadTodaysReport() { loadReport(getTodayStr()); }

/* ── Populate form ── */
function populateEmployeeForm(report, readOnly) {
  const tasksContainer = document.getElementById('e-tasks');
  tasksContainer.innerHTML = '';

  if (!report) {
    document.getElementById('e-prog').value = 0;
    ep(0);
    document.getElementById('e-problem').value = readOnly ? '' : '-';
    document.getElementById('e-plan').value = '';
    document.getElementById('e-prog').disabled = readOnly;
    document.getElementById('e-problem').readOnly = readOnly;
    document.getElementById('e-plan').readOnly = readOnly;
    if (!readOnly) {
      const r = document.createElement('div');
      r.className = 'task-row';
      r.innerHTML = `<div class="tnum">1</div><div class="task-body"><input type="text" placeholder="ระบุงานที่ทำ..." /><div class="spills"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div><button class="btn-desc" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button></div><button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน">&times;</button>`;
      tasksContainer.appendChild(r);
      setupTaskStatusHandlers(r);
      r.querySelector('.sp-done').classList.add('on');
    } else {
      tasksContainer.innerHTML = '<div style="padding:10px 0;color:var(--color-text-secondary);font-size:13px;text-align:center">📭 ไม่พบรายงานในวันที่เลือก</div>';
    }
    renderComments([], 'e-thread');
    return;
  }

  const modeText = report.work_mode === 'wfh' ? 'Work from Home' :
                   report.work_mode === 'hybrid' ? 'Hybrid' : 'On-site';
  document.querySelectorAll('.mode-opt').forEach(btn => {
    btn.classList.remove('on');
    if (btn.textContent.trim() === modeText) btn.classList.add('on');
  });

  const prog = report.progress || 0;
  document.getElementById('e-prog').value = prog;
  document.getElementById('e-prog').disabled = readOnly;
  ep(prog);

  document.getElementById('e-problem').value = report.problems || '-';
  document.getElementById('e-problem').readOnly = readOnly;
  document.getElementById('e-plan').value = report.plan_tomorrow || '';
  document.getElementById('e-plan').readOnly = readOnly;

  renderComments(report.comments, 'e-thread');

  if (report.tasks && report.tasks.length > 0) {
    report.tasks.forEach((task, idx) => {
      const r = document.createElement('div');
      r.className = 'task-row';
      if (task.description) r.setAttribute('data-desc', task.description);
      const statusClass = task.status === 'done' ? 'sp-done' : task.status === 'prog' ? 'sp-prog' : 'sp-pend';
      const descClass = task.description ? 'btn-desc has-data' : 'btn-desc';
      const delBtn = readOnly ? '' : `<button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน">&times;</button>`;
      r.innerHTML = `<div class="tnum">${idx+1}</div><div class="task-body"><input type="text" value="${task.title}" ${readOnly ? 'readonly' : ''} /><div class="spills"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div><button class="${descClass}" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button></div>${delBtn}`;
      tasksContainer.appendChild(r);
      setupTaskStatusHandlers(r);
      r.querySelector('.' + statusClass).classList.add('on');
    });
  }
}

function ep(v) {
  document.getElementById('e-pv').textContent = v + '%';
  document.getElementById('e-pb').style.width = v + '%';
  document.getElementById('e-pb').style.background = v >= 80 ? '#639922' : v >= 40 ? '#EF9F27' : '#E24B4A';
}

/* ── App init ── */
async function initializeApp() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) {
        window.location.replace('/static/index.html');
        return;
    }
    currentUser = await res.json();
    document.getElementById('nb-av').textContent = getInitials(currentUser.name);
    document.getElementById('nb-name').textContent = currentUser.name;
    document.getElementById('nb-role').textContent = currentUser.role;
    document.getElementById('info-name').textContent = currentUser.name;
    document.getElementById('info-role').textContent = currentUser.role;
    document.getElementById('info-dept').textContent = currentUser.department || '—';
    
    // Hide Admin button if not admin
    const userLevel = parseInt(localStorage.getItem('user_level') || '0', 10);
    const userRole = (localStorage.getItem('user_role') || '').toLowerCase();
    const isSuperAdmin = userLevel > 0 || userRole.includes('admin') || userRole.includes('ผู้ดูแลระบบ');
    const goAdminBtn = document.getElementById('goAdminBtn');
    
    if (!isSuperAdmin && goAdminBtn) {
        goAdminBtn.style.display = 'none';
    }

    updateDateNav();
    loadTodaysReport();
  } catch(e) {
    console.error('Failed to load user info:', e);
    window.location.replace('/static/index.html');
  }
}
initializeApp();

window.doLogout = function() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_level');
    window.location.replace('/static/index.html');
};

/* ── Task management ── */
function reindexTasks() {
  document.querySelectorAll('#e-tasks .task-row').forEach((row, idx) => {
    row.querySelector('.tnum').textContent = idx + 1;
  });
}

function deleteTask(btn) {
  if (isHistoryMode) return;
  btn.closest('.task-row').remove();
  reindexTasks();
}

/* ── Description modal ── */
let currentEditingRow = null;

function openDescModal(btn) {
  currentEditingRow = btn.closest('.task-row');
  const desc = currentEditingRow.getAttribute('data-desc') || '';
  const inputEl = document.getElementById('task-desc-input');
  const titleEl = document.getElementById('modal-desc-title');
  const saveBtn = document.getElementById('modal-save-btn');
  const cancelBtn = document.getElementById('modal-cancel-btn');

  inputEl.value = desc;

  if (isHistoryMode) {
    inputEl.readOnly = true;
    if (titleEl) titleEl.textContent = '🔍 รายละเอียดงาน (ย้อนหลัง)';
    if (saveBtn) saveBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.textContent = 'ปิด';
  } else {
    inputEl.readOnly = false;
    if (titleEl) titleEl.textContent = '📝 คำอธิบายงาน';
    if (saveBtn) saveBtn.style.display = '';
    if (cancelBtn) cancelBtn.textContent = 'ยกเลิก';
  }

  document.getElementById('desc-modal').classList.add('on');
}

function closeDescModal() {
  document.getElementById('desc-modal').classList.remove('on');
  currentEditingRow = null;
}

function saveTaskDesc() {
  if (isHistoryMode) { closeDescModal(); return; }
  if (!currentEditingRow) return;
  const val = document.getElementById('task-desc-input').value.trim();
  if (val) {
    currentEditingRow.setAttribute('data-desc', val);
    currentEditingRow.querySelector('.btn-desc').classList.add('has-data');
  } else {
    currentEditingRow.removeAttribute('data-desc');
    currentEditingRow.querySelector('.btn-desc').classList.remove('has-data');
  }
  closeDescModal();
  if (currentReportId && currentReportExists) autoSaveTasks();
}

/* ── Auto-save tasks ── */
async function autoSaveTasks() {
  if (isHistoryMode) return;
  const tasks = [];
  document.querySelectorAll('#e-tasks .task-row').forEach((row, idx) => {
    const title = row.querySelector('input').value.trim();
    if (title) {
      const spills = row.querySelector('.spills');
      let status = 'done';
      if (spills.querySelector('.sp-prog').classList.contains('on')) status = 'prog';
      else if (spills.querySelector('.sp-pend').classList.contains('on')) status = 'pend';
      tasks.push({ id: idx + 1, title, status, description: row.getAttribute('data-desc') || '' });
    }
  });
  try {
    const res = await fetch(`/api/reports/${currentReportId}/tasks`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tasks)
    });
    if (!res.ok) {
      if (res.status === 404) currentReportExists = false;
      console.warn('Auto-save tasks skipped:', res.status);
    }
  } catch(e) {
    console.error('Auto-save tasks failed:', e);
  }
}

/* ── Add task ── */
document.getElementById('e-add').addEventListener('click', () => {
  if (isHistoryMode) return;
  const r = document.createElement('div');
  r.className = 'task-row';
  r.innerHTML = `<div class="tnum"></div><div class="task-body"><input type="text" placeholder="ระบุงานที่ทำ..." style="margin-bottom:5px"/><div class="spills"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div><button class="btn-desc" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button></div><button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน">&times;</button>`;
  document.getElementById('e-tasks').appendChild(r);
  setupTaskStatusHandlers(r);
  r.querySelector('.sp-done').classList.add('on');
  reindexTasks();
});

/* ── Work mode ── */
document.querySelectorAll('.mode-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    if (isHistoryMode) return;
    document.querySelectorAll('.mode-opt').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
  });
});

/* ── Submit report ── */
document.getElementById('btn-submit').addEventListener('click', async () => {
  if (isHistoryMode) return;
  if (!currentUser) {
    Swal.fire({
      icon: 'warning',
      title: 'รอสักครู่!',
      text: 'กรุณารอให้ระบบโหลดข้อมูลผู้ใช้เสร็จสิ้น',
      confirmButtonColor: '#1059A3'
    });
    return;
  }

  const modeText = document.querySelector('.mode-opt.on').textContent.trim().toLowerCase();
  let work_mode = 'onsite';
  if (modeText.includes('home')) work_mode = 'wfh';
  else if (modeText.includes('hybrid')) work_mode = 'hybrid';

  const reportData = {
    user_id: currentUser.user_id,
    name: currentUser.name,
    role: currentUser.role,
    department: currentUser.department,
    work_mode,
    progress: parseInt(document.getElementById('e-prog').value) || 0,
    problems: document.getElementById('e-problem').value,
    plan_tomorrow: document.getElementById('e-plan').value,
    tasks: []
  };

  document.querySelectorAll('#e-tasks .task-row').forEach((row, idx) => {
    const title = row.querySelector('input').value;
    if (title) {
      const spills = row.querySelector('.spills');
      let status = 'done';
      if (spills.querySelector('.sp-prog').classList.contains('on')) status = 'prog';
      else if (spills.querySelector('.sp-pend').classList.contains('on')) status = 'pend';
      reportData.tasks.push({ id: idx+1, title, status, description: row.getAttribute('data-desc') || '' });
    }
  });

  try {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportData)
    });
    if (res.ok) {
      currentReportExists = true;
      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ!',
        text: 'ส่งรายงานเรียบร้อยแล้ว',
        confirmButtonColor: '#1D9E75'
      }).then(() => {
        window.location.href = '/static/admin.html';
      });
    } else {
      const errorData = await res.json();
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: errorData.detail || 'Unknown error',
        confirmButtonColor: '#1059A3'
      });
    }
  } catch(e) {
    Swal.fire({
      icon: 'error',
      title: 'เชื่อมต่อล้มเหลว',
      text: e.message,
      confirmButtonColor: '#1059A3'
    });
  }
});

/* ── Comment ── */
async function sendCmt() {
  if (isHistoryMode) return;
  const msg = document.getElementById('e-msg').value.trim();
  if (!msg || !currentReportId || !currentUser) return;

  const commentData = {
    author_id: currentUser.user_id,
    author_name: currentUser.name,
    author_role: currentUser.role,
    avatar_color: 'av-teal',
    author_initials: getInitials(currentUser.name),
    message: msg,
    tag: ''
  };

  try {
    const res = await fetch(`/api/reports/${currentReportId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commentData)
    });
    if (res.ok) {
      document.getElementById('e-msg').value = '';
      const ok = document.getElementById('e-ok');
      ok.style.display = 'block';
      setTimeout(() => ok.style.display = 'none', 3000);
      loadReport(viewDate || getTodayStr());
    }
  } catch(e) {
    console.error('Error sending comment:', e);
  }
}

/* ── Render comments ── */
function renderComments(comments, containerId) {
  const thread = document.getElementById(containerId);
  if (!thread) return;
  thread.innerHTML = '';
  if (comments && comments.length > 0) {
    comments.forEach(c => {
      const isSrv = c.author_role.includes('หัวหน้า') || c.author_role.includes('แอดมิน');
      const b = document.createElement('div');
      b.className = 'cbubble';
      const tagColorMap = { 'ต้องแก้ไข': 'bdg-red', 'ดีมาก': 'bdg-green', 'ติดตามด่วน': 'bdg-amber', 'รับทราบ': 'bdg-gray' };
      const tagClass = c.tag ? (tagColorMap[c.tag] || 'bdg-blue') : '';
      const tag = c.tag ? `<span class="bdg ${tagClass}" style="font-size:10px">${c.tag}</span>` : '';
      b.innerHTML = `
        <div class="av ${c.avatar_color || 'av-gray'} av-sm">${c.author_initials || '??'}</div>
        <div>
          <div class="bname">${c.author_name} <span>${c.timestamp} · ${c.author_role}</span> ${tag}</div>
          <div class="btext ${isSrv ? 'sv' : ''}">${c.message}</div>
        </div>
      `;
      thread.appendChild(b);
    });
  } else {
    thread.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary);text-align:center;padding:10px">ยังไม่มีการสื่อสาร</div>';
  }
}

/* ── Helpers ── */
function getInitials(name) {
  return name.split(' ').slice(0, 2).map(n => n.charAt(0)).join('').toUpperCase();
}

function getStatusBadgeClass(status) {
  if (status === 'done') return 'bdg-green';
  if (status === 'prog') return 'bdg-amber';
  return 'bdg-gray';
}

function getStatusSymbol(status) {
  if (status === 'done') return '✓';
  if (status === 'prog') return '⋯';
  return '◯';
}
