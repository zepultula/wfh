const thM=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const thD=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
let currentUser = null;
let currentReportId = null;
let currentReportExists = false;

function tick(){
  const n=new Date();
  const d=`${n.getDate()} ${thM[n.getMonth()]} ${n.getFullYear()+543}`;
  const t=`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
  const full=`วัน${thD[n.getDay()]}ที่ ${d}`;
  const el1=document.getElementById('e-ts'); if(el1) el1.textContent=full;
  const el2=document.getElementById('e-ts2'); if(el2) el2.textContent=`${d} · ${t}`;
}
tick(); setInterval(tick,1000);

function setupTaskStatusHandlers(row) {
  const spills = row.querySelector('.spills');
  spills.querySelectorAll('.sp').forEach(span => {
    span.style.cursor = 'pointer';
    span.addEventListener('click', () => {
      spills.querySelectorAll('.sp').forEach(s => s.classList.remove('on'));
      span.classList.add('on');
    });
  });
}

async function loadTodaysReport() {
  if(!currentUser) return;
  try {
    const n = new Date();
    const d = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
    const reportId = `${currentUser.user_id}_${d}`;
    currentReportId = reportId;

    const cmtAv = document.getElementById('e-cmt-av');
    if(cmtAv) cmtAv.textContent = getInitials(currentUser.name);
    const cmtName = document.getElementById('e-cmt-name');
    if(cmtName) cmtName.textContent = currentUser.name + ' · ส่งข้อความถึงหัวหน้างาน';

    const res = await fetch(`/api/reports/${reportId}`);
    if(res.ok) {
      const report = await res.json();
      currentReportExists = true;
      populateEmployeeForm(report);
    } else {
      currentReportExists = false;
      populateEmployeeForm(null);
    }
  } catch(e) {
    populateEmployeeForm(null);
  }
}

function populateEmployeeForm(report){
  const tasksContainer = document.getElementById('e-tasks');
  tasksContainer.innerHTML = '';

  if(!report) {
    document.getElementById('e-prog').value = 0;
    ep(0);
    document.getElementById('e-problem').value = '-';
    document.getElementById('e-plan').value = '';
    const r = document.createElement('div');
    r.className = 'task-row';
    r.innerHTML = `<div class="tnum">1</div><div class="task-body"><input type="text" placeholder="ระบุงานที่ทำ..." /><div class="spills"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div><button class="btn-desc" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button></div><button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน">&times;</button>`;
    tasksContainer.appendChild(r);
    setupTaskStatusHandlers(r);
    r.querySelector('.sp-done').classList.add('on');
    return;
  }

  const modeText = report.work_mode === 'wfh' ? 'Work from Home' :
                   report.work_mode === 'hybrid' ? 'Hybrid' : 'On-site';
  document.querySelectorAll('.mode-opt').forEach(btn => {
    btn.classList.remove('on');
    if(btn.textContent.trim() === modeText) btn.classList.add('on');
  });

  const prog = report.progress || 0;
  document.getElementById('e-prog').value = prog;
  ep(prog);

  document.getElementById('e-problem').value = report.problems || '-';
  document.getElementById('e-plan').value = report.plan_tomorrow || '';

  renderComments(report.comments, 'e-thread');

  if(report.tasks && report.tasks.length > 0) {
    report.tasks.forEach((task, idx) => {
      const r = document.createElement('div');
      r.className = 'task-row';
      if (task.description) r.setAttribute('data-desc', task.description);
      const statusClass = task.status === 'done' ? 'sp-done' : task.status === 'prog' ? 'sp-prog' : 'sp-pend';
      const descClass = task.description ? 'btn-desc has-data' : 'btn-desc';
      r.innerHTML = `<div class="tnum">${idx+1}</div><div class="task-body"><input type="text" value="${task.title}" /><div class="spills"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div><button class="${descClass}" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button></div><button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน">&times;</button>`;
      tasksContainer.appendChild(r);
      setupTaskStatusHandlers(r);
      r.querySelector('.'+statusClass).classList.add('on');
    });
  }
}

function ep(v){
  document.getElementById('e-pv').textContent=v+'%';
  document.getElementById('e-pb').style.width=v+'%';
  document.getElementById('e-pb').style.background=v>=80?'#639922':v>=40?'#EF9F27':'#E24B4A';
}

async function initializeApp(){
  try {
    const res = await fetch('/api/me');
    if(res.ok) {
      currentUser = await res.json();
      // Update navbar
      document.getElementById('nb-av').textContent = getInitials(currentUser.name);
      document.getElementById('nb-name').textContent = currentUser.name;
      document.getElementById('nb-role').textContent = currentUser.role;
      // Update auto-info block
      document.getElementById('info-name').textContent = currentUser.name;
      document.getElementById('info-role').textContent = currentUser.role;
      document.getElementById('info-dept').textContent = currentUser.department || '—';
      loadTodaysReport();
    }
  } catch(e) {
    console.error('Failed to load user info:', e);
  }
}

initializeApp();

function reindexTasks() {
  document.querySelectorAll('#e-tasks .task-row').forEach((row, idx) => {
    row.querySelector('.tnum').textContent = idx + 1;
  });
}

function deleteTask(btn) {
  btn.closest('.task-row').remove();
  reindexTasks();
}

let currentEditingRow = null;

function openDescModal(btn) {
  currentEditingRow = btn.closest('.task-row');
  const desc = currentEditingRow.getAttribute('data-desc') || '';
  document.getElementById('task-desc-input').value = desc;
  document.getElementById('desc-modal').classList.add('on');
}

function closeDescModal() {
  document.getElementById('desc-modal').classList.remove('on');
  currentEditingRow = null;
}

function saveTaskDesc() {
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

async function autoSaveTasks() {
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
  } catch (e) {
    console.error('Auto-save tasks failed:', e);
  }
}

document.getElementById('e-add').addEventListener('click', () => {
  const r = document.createElement('div');
  r.className = 'task-row';
  r.innerHTML = `<div class="tnum"></div><div class="task-body"><input type="text" placeholder="ระบุงานที่ทำ..." style="margin-bottom:5px"/><div class="spills"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div><button class="btn-desc" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button></div><button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน">&times;</button>`;
  document.getElementById('e-tasks').appendChild(r);
  setupTaskStatusHandlers(r);
  r.querySelector('.sp-done').classList.add('on');
  reindexTasks();
});

document.querySelectorAll('.mode-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-opt').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
  });
});

document.getElementById('btn-submit').addEventListener('click', async () => {
  if(!currentUser) {
    alert('กรุณารอให้ระบบโหลดข้อมูลผู้ใช้');
    return;
  }

  const modeText = document.querySelector('.mode-opt.on').textContent.trim().toLowerCase();
  let work_mode = 'onsite';
  if(modeText.includes('home')) work_mode = 'wfh';
  else if(modeText.includes('hybrid')) work_mode = 'hybrid';

  const reportData = {
    user_id: currentUser.user_id,
    name: currentUser.name,
    role: currentUser.role,
    department: currentUser.department,
    work_mode: work_mode,
    progress: parseInt(document.getElementById('e-prog').value) || 0,
    problems: document.getElementById('e-problem').value,
    plan_tomorrow: document.getElementById('e-plan').value,
    tasks: []
  };

  document.querySelectorAll('#e-tasks .task-row').forEach((row, idx) => {
    const title = row.querySelector('input').value;
    if(title) {
      const spills = row.querySelector('.spills');
      let status = 'done';
      if(spills.querySelector('.sp-prog').classList.contains('on')) status = 'prog';
      else if(spills.querySelector('.sp-pend').classList.contains('on')) status = 'pend';
      reportData.tasks.push({ id: idx+1, title, status, description: row.getAttribute('data-desc') || '' });
    }
  });

  try {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(reportData)
    });
    if(res.ok) {
      currentReportExists = true;
      alert('ส่งรายงานสำเร็จ!');
      window.location.href = '/static/admin.html';
    } else {
      const errorData = await res.json();
      alert('เกิดข้อผิดพลาด: ' + (errorData.detail || 'Unknown error'));
    }
  } catch(e) {
    alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: ' + e.message);
  }
});

async function sendCmt() {
  const msg = document.getElementById('e-msg').value.trim();
  if(!msg || !currentReportId || !currentUser) return;

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
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(commentData)
    });
    if(res.ok) {
      document.getElementById('e-msg').value = '';
      const ok = document.getElementById('e-ok');
      ok.style.display = 'block';
      setTimeout(() => ok.style.display = 'none', 3000);
      loadTodaysReport();
    }
  } catch(e) {
    console.error('Error sending comment:', e);
  }
}

function renderComments(comments, containerId) {
  const thread = document.getElementById(containerId);
  if (!thread) return;
  thread.innerHTML = '';
  if (comments && comments.length > 0) {
    comments.forEach(c => {
      const isSrv = c.author_role.includes('หัวหน้า') || c.author_role.includes('แอดมิน');
      const b = document.createElement('div');
      b.className = 'cbubble';
      const tag = c.tag ? `<span class="bdg bdg-blue" style="font-size:10px">${c.tag}</span>` : '';
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

function getInitials(name) {
  return name.split(' ').slice(0, 2).map(n => n.charAt(0)).join('').toUpperCase();
}

function getStatusBadgeClass(status) {
  if(status === 'done') return 'bdg-green';
  if(status === 'prog') return 'bdg-amber';
  return 'bdg-gray';
}

function getStatusSymbol(status) {
  if(status === 'done') return '✓';
  if(status === 'prog') return '⋯';
  return '◯';
}
