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
  const el3=document.getElementById('s-ts'); if(el3) el3.textContent=`${full} · ${t}`;
}
tick(); setInterval(tick,1000);

function setupTaskStatusHandlers(row) {
  const spills = row.querySelector('.spills');
  spills.querySelectorAll('.sp').forEach(span => {
    span.style.cursor = 'pointer';
    span.addEventListener('click', (e) => {
      spills.querySelectorAll('.sp').forEach(s => s.classList.remove('on'));
      span.classList.add('on');
    });
  });
}

// Initialize task status handlers for existing tasks
document.querySelectorAll('.task-row').forEach(row => {
  setupTaskStatusHandlers(row);
  row.querySelector('.sp-done').classList.add('on');
});

function switchView(v){
  document.querySelectorAll('.sw-btn').forEach((b,i)=>{b.classList.toggle('on',i===(v==='emp'?0:1))});
  document.getElementById('screen-emp').classList.toggle('on',v==='emp');
  document.getElementById('screen-sup').classList.toggle('on',v==='sup');
  if(v==='sup') loadDashboard();
  if(v==='emp') loadTodaysReport();
}

async function loadTodaysReport() {
  if(!currentUser) return;
  try {
    const n = new Date();
    const d = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
    const reportId = `${currentUser.user_id}_${d}`;
    currentReportId = reportId;
    
    // Set employee comment identity
    const cmtAv = document.getElementById('e-cmt-av');
    if(cmtAv) {
      cmtAv.textContent = getInitials(currentUser.name);
    }
    const cmtName = document.getElementById('e-cmt-name');
    if(cmtName) {
      cmtName.textContent = currentUser.name + ' · ส่งข้อความถึงหัวหน้างาน';
    }

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
    // Reset to empty state for new report
    document.getElementById('e-prog').value = 0;
    ep(0);
    document.getElementById('e-problem').value = '-';
    document.getElementById('e-plan').value = '';
    
    // Add one initial empty row
    const r = document.createElement('div');
    r.className = 'task-row';
    r.innerHTML = `<div class="tnum">1</div><div class="task-body"><input type="text" placeholder="ระบุงานที่ทำ..." /><div class="spills"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div><button class="btn-desc" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button></div><button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน">&times;</button>`;
    tasksContainer.appendChild(r);
    setupTaskStatusHandlers(r);
    r.querySelector('.sp-done').classList.add('on');
    return;
  }

  // Set work mode
  const modeText = report.work_mode === 'wfh' ? 'Work from Home' :
                   report.work_mode === 'hybrid' ? 'Hybrid' : 'On-site';
  document.querySelectorAll('.mode-opt').forEach(btn => {
    btn.classList.remove('on');
    if(btn.textContent.trim() === modeText) btn.classList.add('on');
  });

  // Set progress
  const prog = report.progress || 0;
  document.getElementById('e-prog').value = prog;
  ep(prog);

  // Set problems and plan
  document.getElementById('e-problem').value = report.problems || '-';
  document.getElementById('e-plan').value = report.plan_tomorrow || '';

  // Render comments for employee
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
ep(65);

// Fetch current user and load today's report
async function initializeApp(){
  try {
    const res = await fetch('/api/me');
    if(res.ok) {
      currentUser = await res.json();
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
  document.getElementById('task-desc-input').readOnly = false;
  document.getElementById('task-desc-input').placeholder = "พิมพ์รายละเอียดงานที่นี่...";
  const saveBtn = document.querySelector('#desc-modal .btn-save');
  if(saveBtn) saveBtn.style.display = 'block';
  const modalTtl = document.querySelector('#desc-modal .modal-ttl');
  if(modalTtl) modalTtl.textContent = "📝 คำอธิบายงาน";
  currentEditingRow = null;
}
function viewDesc(desc) {
  document.getElementById('task-desc-input').value = desc;
  document.getElementById('task-desc-input').readOnly = true;
  document.getElementById('task-desc-input').placeholder = "(ไม่มีรายละเอียด)";
  const saveBtn = document.querySelector('#desc-modal .btn-save');
  if(saveBtn) saveBtn.style.display = 'none';
  const modalTtl = document.querySelector('#desc-modal .modal-ttl');
  if(modalTtl) modalTtl.textContent = "🔍 รายละเอียดงาน";
  document.getElementById('desc-modal').classList.add('on');
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

document.getElementById('e-add').addEventListener('click',()=>{
  const r=document.createElement('div'); r.className='task-row';
  r.innerHTML=`<div class="tnum"></div><div class="task-body"><input type="text" placeholder="ระบุงานที่ทำ..." style="margin-bottom:5px"/><div class="spills"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div><button class="btn-desc" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button></div><button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน">&times;</button>`;
  document.getElementById('e-tasks').appendChild(r);
  setupTaskStatusHandlers(r);
  r.querySelector('.sp-done').classList.add('on');
  reindexTasks();
});

document.getElementById('s-filters').addEventListener('click',e=>{
  const btn=e.target.closest('.fb'); if(!btn) return;
  document.querySelectorAll('.fb').forEach(b=>b.classList.remove('on')); btn.classList.add('on');
  const f=btn.dataset.f;
  document.querySelectorAll('#s-rows .rrow').forEach(r=>{
    r.style.display=(f==='all'||r.dataset.f.includes(f))?'':'none';
  });
});

function showDetail(reportId){
  document.getElementById('sup-list').style.display='none';
  document.getElementById('sup-detail').style.display='block';
  if(reportId) loadReportDetail(reportId);
}
function hideDetail(){
  document.getElementById('sup-detail').style.display='none';
  document.getElementById('sup-list').style.display='block';
}

async function loadReportDetail(reportId) {
  currentReportId = reportId;
  try {
    const res = await fetch(`/api/reports/${reportId}`);
    if(res.ok) {
      const report = await res.json();
      renderReportDetail(report);
    }
  } catch(e) {
    console.error('Error loading report:', e);
  }
}

function renderReportDetail(report) {
  const container = document.getElementById('sup-detail-content');
  if(!container) return;

  const initials = getInitials(report.name);
  const workModeBadge = report.work_mode === 'wfh' ? '<span class="bdg bdg-blue">WFH</span>' :
                       report.work_mode === 'hybrid' ? '<span class="bdg bdg-indigo">Hybrid</span>' :
                       '<span class="bdg bdg-gray">On-site</span>';

  const progressColor = report.progress >= 80 ? '#27500A' : report.progress >= 40 ? '#633806' : '#8B4513';
  const progressBgColor = report.progress >= 80 ? '#639922' : report.progress >= 40 ? '#EF9F27' : '#E24B4A';

  const tasksHTML = report.tasks && report.tasks.length > 0
    ? report.tasks.map(t => {
      const escapedDesc = (t.description || "").replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const descBtn = t.description ? `<button class="btn-view-desc" onclick="viewDesc('${escapedDesc}')" title="ดูคำอธิบาย">📝 ดูรายละเอียด</button>` : '';
      return `
        <div style="padding:10px 0;border-bottom:0.5px solid var(--color-border-tertiary);display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div style="display:flex;align-items:center;gap:10px;flex:1">
            <span class="bdg ${getStatusBadgeClass(t.status)}">${getStatusSymbol(t.status)}</span>
            <span style="font-size:14px;font-weight:500;color:var(--color-text-primary)">${t.title}</span>
          </div>
          ${descBtn}
        </div>
      `;
    }).join('')
    : '<div style="padding:7px 0;color:var(--color-text-secondary)">ไม่มีงาน</div>';

  container.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:.875rem;padding-bottom:.875rem;border-bottom:0.5px solid var(--color-border-tertiary)">
        <div class="av av-teal" style="width:40px;height:40px;font-size:13px">${initials}</div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:500">${report.name}</div>
          <div style="font-size:12px;color:var(--color-text-secondary)">${report.role} · ${report.department || ''}</div>
        </div>
        <div style="text-align:right">
          ${workModeBadge}
          <div style="font-size:11px;color:var(--color-text-secondary);margin-top:3px">${report.submit_time || '—'}</div>
        </div>
      </div>
      <div class="ir"><span class="ik">ความคืบหน้า</span>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="pbar2" style="width:90px"><div class="pfill2" style="width:${report.progress || 0}%;background:${progressBgColor}"></div></div>
          <strong style="color:${progressColor};font-size:13px">${report.progress || 0}%</strong>
        </div>
      </div>
      <div class="ir"><span class="ik">ปัญหา/อุปสรรค</span><span style="color:${report.problems && report.problems !== '-' ? '#E24B4A' : 'inherit'}">${report.problems || '-'}</span></div>
      <div class="ir"><span class="ik">แผนงานพรุ่งนี้</span><span>${report.plan_tomorrow || '—'}</span></div>
    </div>

    <div class="card">
      <div class="sec-lbl">รายการงาน</div>
      ${tasksHTML}
    </div>
  `;

  // Render comments
  renderComments(report.comments, 's-thread');
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

let selTag='';
function stag(el){
  document.querySelectorAll('.tb').forEach(b=>b.classList.remove('on'));
  if(selTag!==el.textContent){ el.classList.add('on'); selTag=el.textContent; } else { selTag=''; }
}

async function sendCmt(type = 'sup'){
  const inputId = type === 'emp' ? 'e-msg' : 's-msg';
  const okId = type === 'emp' ? 'e-ok' : 's-ok';
  
  const msg=document.getElementById(inputId).value.trim(); if(!msg || !currentReportId || !currentUser) return;
  
  const commentData = {
    author_id: currentUser.user_id,
    author_name: currentUser.name,
    author_role: currentUser.role,
    avatar_color: type === 'emp' ? 'av-teal' : 'av-blue',
    author_initials: getInitials(currentUser.name),
    message: msg,
    tag: type === 'emp' ? '' : selTag
  };

  try {
    const res = await fetch(`/api/reports/${currentReportId}/comments`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(commentData)
    });

    if(res.ok) {
      document.getElementById(inputId).value='';
      if (type === 'sup') {
        document.querySelectorAll('.tb').forEach(b=>b.classList.remove('on'));
        selTag='';
      }
      
      const ok=document.getElementById(okId);
      ok.style.display='block';
      setTimeout(()=>ok.style.display='none',3000);
      
      // Refresh report to show persistent comment
      if (type === 'emp') {
        loadTodaysReport();
      } else {
        loadReportDetail(currentReportId);
      }
    }
  } catch(e) {
    console.error('Error sending comment:', e);
  }
}

document.querySelectorAll('.mode-opt').forEach(btn=>{
  btn.addEventListener('click',()=>{ document.querySelectorAll('.mode-opt').forEach(b=>b.classList.remove('on')); btn.classList.add('on'); });
});

// Hook up submission
document.querySelector('.btn-submit').addEventListener('click', async () => {
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
            console.log(`Submitting task ${idx+1} with description:`, row.getAttribute('data-desc'));
            // Get selected status
            const spills = row.querySelector('.spills');
            let status = 'done';
            if(spills.querySelector('.sp-prog').classList.contains('on')) status = 'prog';
            else if(spills.querySelector('.sp-pend').classList.contains('on')) status = 'pend';

            reportData.tasks.push({
                id: idx+1,
                title: title,
                status: status,
                description: row.getAttribute('data-desc') || ""
            });
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
            switchView('sup');
            loadDashboard();
        } else {
            const errorData = await res.json();
            console.error('API Error:', errorData);
            alert('Failed to submit:\n' + (errorData.detail || 'Unknown error'));
        }
    } catch(e) {
        console.error('Exception:', e);
        alert('API Submit Error: ' + e.message);
    }
});

async function loadDashboard() {
    try {
        const res = await fetch('/api/reports');
        if(res.ok) {
            const data = await res.json();
            console.log('Dashboard Data:', data);
            renderReports(data);
        }
    } catch(e) {
        console.error(e);
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

function renderReports(reports) {
    const sRows = document.getElementById('s-rows');
    if(!sRows) return;

    sRows.innerHTML = '';

    if(!reports || reports.length === 0) {
        sRows.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-text-secondary)">ไม่มีรายงาน</div>';
        return;
    }

    reports.forEach((report, idx) => {
        const initials = getInitials(report.name);
        const avatarColor = idx % 4 === 0 ? 'av-teal' : idx % 4 === 1 ? 'av-purple' : idx % 4 === 2 ? 'av-coral' : 'av-amber';

        const workModeBadge = report.work_mode === 'wfh' ? '<span class="bdg bdg-blue">WFH</span>' :
                             report.work_mode === 'hybrid' ? '<span class="bdg bdg-indigo">Hybrid</span>' :
                             '<span class="bdg bdg-gray">On-site</span>';

        const taskBadges = report.tasks && report.tasks.length > 0
            ? report.tasks.map(t => `<span class="bdg ${getStatusBadgeClass(t.status)}">${getStatusSymbol(t.status)} ${t.title}</span>`).join('')
            : '<span style="color:var(--color-text-secondary);font-size:11px">ไม่มีงาน</span>';

        const problemHTML = report.problems && report.problems !== '-'
            ? `<div class="rproblem"><div class="pdot"></div>${report.problems}</div>`
            : '';

        const progressColor = report.progress >= 80 ? '#27500A' : report.progress >= 40 ? '#633806' : '#8B4513';
        const progressBgColor = report.progress >= 80 ? '#639922' : report.progress >= 40 ? '#EF9F27' : '#E24B4A';

        const dataAttrs = `data-f="${report.work_mode === 'wfh' ? 'wfh ' : ''}${!report.problems || report.problems === '-' ? 'sent' : 'sent prob'}"`;

        const rowHTML = `
            <div class="rrow" ${dataAttrs}>
                <div class="av av-sm ${avatarColor}">${initials}</div>
                <div class="rmain">
                    <div class="rname">${report.name}</div>
                    <div class="rmeta">${report.role} · ${workModeBadge} · ${report.submit_time || '—'}</div>
                    <div class="rtags">
                        ${taskBadges}
                    </div>
                    ${problemHTML}
                    <button class="btn-detail" onclick="showDetail('${report.id}')">ดูรายละเอียด / คอมเมนต์</button>
                </div>
                <div class="pcol">
                    <div class="ppct" style="color:${progressColor}">${report.progress || 0}%</div>
                    <div class="pbar2"><div class="pfill2" style="width:${report.progress || 0}%;background:${progressBgColor}"></div></div>
                </div>
            </div>
        `;

        sRows.insertAdjacentHTML('beforeend', rowHTML);
    });
}
