const userLevel = parseInt(localStorage.getItem('user_level') || '0', 10);
const userRole = (localStorage.getItem('user_role') || '').toLowerCase();
const isSuperAdmin = userLevel > 0 || userRole.includes('admin') || userRole.includes('ผู้ดูแลระบบ');

if (!isSuperAdmin) {
  window.location.replace('/static/employee.html');
}

const thM=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const thD=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
let currentReportId = null;
let currentUser = null;

async function initUser() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) throw new Error('Unauth');
    currentUser = await res.json();
    document.getElementById('nb-av').textContent = getInitials(currentUser.name);
    document.getElementById('nb-name').textContent = currentUser.name;
    document.getElementById('nb-role').textContent = currentUser.role;
    // แสดงปุ่มจัดการผู้ใช้สำหรับ super admin
    if (currentUser.level === 9 || currentUser.role.toLowerCase().includes('admin')) {
      const btn = document.getElementById('btn-users-mgmt');
      if (btn) btn.style.display = '';
    }
  } catch(e) {
    window.location.replace('/static/index.html');
  }
}
initUser();

window.doLogout = function() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_level');
    window.location.replace('/static/index.html');
};

function tick(){
  const n=new Date();
  const d=`${n.getDate()} ${thM[n.getMonth()]} ${n.getFullYear()+543}`;
  const t=`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
  const full=`วัน${thD[n.getDay()]}ที่ ${d}`;
  const el=document.getElementById('s-ts'); if(el) el.textContent=`${full} · ${t}`;
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

function getReportDate(reportId) {
  const m = reportId && reportId.match(/(\d{4}-\d{2}-\d{2})$/);
  return m ? m[1] : null;
}

function getReportUserId(reportId) {
  const d = getReportDate(reportId);
  return d ? reportId.slice(0, reportId.length - d.length - 1) : reportId;
}

/* ── Set today's date in the date filter ── */
(function setDefaultDate(){
  const today = getTodayStr();
  const el = document.getElementById('s-date-filter');
  if (el) {
    el.value = today;
    el.max = today;
    el.addEventListener('change', () => {
      const nextBtn = document.getElementById('admin-btn-next');
      if (nextBtn) nextBtn.disabled = el.value >= today;
      loadDashboard();
    });
  }
  const nextBtn = document.getElementById('admin-btn-next');
  if (nextBtn) nextBtn.disabled = true;
})();

/* ── Admin date navigation ── */
function navigateAdminDate(delta) {
  const today = getTodayStr();
  const dateEl = document.getElementById('s-date-filter');
  if (!dateEl) return;
  const base = dateEl.value || today;
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  const newDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if (newDate > today) return;
  dateEl.value = newDate;
  const nextBtn = document.getElementById('admin-btn-next');
  if (nextBtn) nextBtn.disabled = newDate >= today;
  loadDashboard();
}

/* ── Employee date navigation (within detail view) ── */
function navigateEmployeeReport(delta) {
  if (!currentReportId) return;
  const today = getTodayStr();
  const currentDate = getReportDate(currentReportId);
  const userId = getReportUserId(currentReportId);
  if (!currentDate || !userId) return;
  const d = new Date(currentDate + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  const newDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if (newDate > today) return;
  loadReportDetail(`${userId}_${newDate}`);
}

/* ── Dashboard ── */
async function loadDashboard() {
  try {
    const dateEl = document.getElementById('s-date-filter');
    const dateParam = dateEl ? `?date=${dateEl.value}` : '';
    const [reportsRes, usersRes] = await Promise.all([
      fetch(`/api/reports${dateParam}`),
      fetch('/api/users')
    ]);
    const reports = reportsRes.ok ? await reportsRes.json() : [];
    const allFetchedUsers = usersRes.ok ? await usersRes.json() : [];
    // กรองเฉพาะ users ที่ ignore=0 (ไม่นับคนที่ถูกยกเว้นการตรวจสอบ)
    const users = allFetchedUsers.filter(u => (u.ignore ?? 0) === 0);
    renderReports(reports, users);
  } catch(e) {
    console.error(e);
  }
}

loadDashboard();

document.getElementById('s-filters').addEventListener('click', e => {
  const btn = e.target.closest('.fb'); if (!btn) return;
  document.querySelectorAll('.fb').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  const f = btn.dataset.f;
  document.querySelectorAll('#s-rows .rrow').forEach(r => {
    r.style.display = (f === 'all' || r.dataset.f.includes(f)) ? '' : 'none';
  });
});

/* ── Detail view show/hide ── */
function showDetail(reportId){
  document.getElementById('sup-list').style.display = 'none';
  document.getElementById('sup-detail').style.display = 'block';
  if (reportId) loadReportDetail(reportId);
}

function hideDetail(){
  document.getElementById('sup-detail').style.display = 'none';
  document.getElementById('sup-list').style.display = 'block';
}

/* ── Load report detail ── */
async function loadReportDetail(reportId) {
  currentReportId = reportId;
  try {
    const res = await fetch(`/api/reports/${reportId}`);
    if (res.ok) {
      const report = await res.json();
      renderReportDetail(report);
    } else if (res.status === 404) {
      renderEmptyReportDetail(reportId);
    }
  } catch(e) {
    console.error('Error loading report:', e);
  }
}

/* ── Date nav HTML helper ── */
function buildDetailDateNav(reportId) {
  const today = getTodayStr();
  const rDate = getReportDate(reportId);
  const isToday = rDate === today;
  const displayDate = rDate ? formatDateThai(rDate) : '—';
  const isHistoric = rDate && rDate < today;
  const historyLabel = isHistoric
    ? `<span style="font-size:10px;background:#FFF8E1;color:#5D4037;border:0.5px solid #FFCA28;border-radius:4px;padding:2px 6px;margin-left:6px">ย้อนหลัง</span>`
    : `<span style="font-size:10px;background:#E1F5EE;color:#085041;border:0.5px solid #A5D6C1;border-radius:4px;padding:2px 6px;margin-left:6px">วันนี้</span>`;
  return `
    <div class="date-nav" style="margin-bottom:.875rem">
      <button class="date-nav-btn" onclick="navigateEmployeeReport(-1)">← วันก่อน</button>
      <div class="date-nav-display">${displayDate}${historyLabel}</div>
      <button class="date-nav-btn" onclick="navigateEmployeeReport(1)" ${isToday ? 'disabled' : ''}>วันถัดไป →</button>
    </div>`;
}

/* ── Render report detail ── */
function renderReportDetail(report) {
  const container = document.getElementById('sup-detail-content');
  if (!container) return;

  const initials = getInitials(report.name);
  const workModeBadge = report.work_mode === 'wfh' ? '<span class="bdg bdg-blue">WFH</span>' :
                       report.work_mode === 'hybrid' ? '<span class="bdg bdg-indigo">Hybrid</span>' :
                       '<span class="bdg bdg-gray">On-site</span>';

  const progressBgColor = report.progress >= 80 ? '#639922' : report.progress >= 40 ? '#EF9F27' : '#E24B4A';
  const progressColor   = report.progress >= 80 ? '#27500A' : report.progress >= 40 ? '#633806' : '#8B4513';

  const tasksHTML = report.tasks && report.tasks.length > 0
    ? report.tasks.map(t => {
        const escapedDesc = (t.description || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const descBtn = t.description
          ? `<button class="btn-view-desc" onclick="viewDesc('${escapedDesc}')">📝 ดูรายละเอียด</button>`
          : '';
        return `
          <div style="padding:10px 0;border-bottom:0.5px solid var(--color-border-tertiary);display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div style="display:flex;align-items:center;gap:10px;flex:1">
              <span class="bdg ${getStatusBadgeClass(t.status)}">${getStatusSymbol(t.status)}</span>
              <span style="font-size:14px;font-weight:500;color:var(--color-text-primary)">${t.title}</span>
            </div>
            ${descBtn}
          </div>`;
      }).join('')
    : '<div style="padding:7px 0;color:var(--color-text-secondary)">ไม่มีงาน</div>';

  container.innerHTML = buildDetailDateNav(currentReportId) + `
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

  renderComments(report.comments, 's-thread');
}

/* ── Render empty detail (no report for date) ── */
function renderEmptyReportDetail(reportId) {
  const container = document.getElementById('sup-detail-content');
  if (!container) return;

  container.innerHTML = buildDetailDateNav(reportId) + `
    <div class="card" style="text-align:center;padding:2rem 1.5rem">
      <div style="font-size:36px;margin-bottom:12px">📭</div>
      <div style="font-size:14px;font-weight:500;color:var(--color-text-primary);margin-bottom:4px">ไม่พบรายงาน</div>
      <div style="font-size:12px;color:var(--color-text-secondary)">พนักงานไม่ได้ส่งรายงานในวันที่เลือก</div>
    </div>
  `;

  const thread = document.getElementById('s-thread');
  if (thread) thread.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary);text-align:center;padding:10px">ยังไม่มีการสื่อสาร</div>';
}

/* ── Render report list ── */
function renderReports(reports, users = []) {
  const sRows = document.getElementById('s-rows');
  if (!sRows) return;
  sRows.innerHTML = '';

  const submittedIds = new Set(reports.map(r => r.user_id));
  const unsentUsers = users.filter(u => !submittedIds.has(u.user_id));

  const total = users.length || reports.length;
  const withProbs = reports.filter(r => r.problems && r.problems !== '-').length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-sent').textContent = reports.length;
  document.getElementById('stat-unsent').textContent = unsentUsers.length;
  document.getElementById('stat-prob').textContent = withProbs;

  const probsList = document.getElementById('s-probs-list');
  if (probsList) {
    probsList.innerHTML = '';
    const probs = reports.filter(r => r.problems && r.problems !== '-');
    if (probs.length === 0) {
      probsList.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary)">ไม่มีปัญหาที่ต้องติดตาม</div>';
    } else {
      probs.forEach(r => {
        probsList.innerHTML += `
          <div style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:0.5px solid var(--color-border-tertiary)">
            <div class="pdot" style="margin-top:6px;flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;margin-bottom:4px">
                <span style="font-size:10px;font-weight:500;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:.04em;flex-shrink:0">พนักงาน</span>
                <span style="font-size:13px;font-weight:600;color:var(--color-text-primary)">${r.name}</span>
                <span style="font-size:11px;color:var(--color-text-secondary)">${r.role || ''}${r.department ? ' · ' + r.department : ''}</span>
              </div>
              <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">
                <span style="font-size:10px;font-weight:500;color:#A33;text-transform:uppercase;letter-spacing:.04em;flex-shrink:0">ปัญหา</span>
                <span style="font-size:12px;color:#791F1F">${r.problems}</span>
              </div>
            </div>
            <button class="btn-detail" style="flex-shrink:0;align-self:center" onclick="showDetail('${r.id}')">ดูรายละเอียด</button>
          </div>`;
      });
    }
  }

  if (reports.length === 0 && unsentUsers.length === 0) {
    sRows.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-text-secondary)">ไม่มีรายงาน</div>';
    return;
  }

  /* ── ฟังก์ชันสร้าง HTML แถวรายงานหนึ่งแถว ── */
  function buildReportRow(report, idx) {
    const initials = getInitials(report.name);
    const avatarColor = idx % 4 === 0 ? 'av-teal' : idx % 4 === 1 ? 'av-purple' : idx % 4 === 2 ? 'av-coral' : 'av-amber';
    const workModeBadge = report.work_mode === 'wfh' ? '<span class="bdg bdg-blue">WFH</span>' :
                         report.work_mode === 'hybrid' ? '<span class="bdg bdg-indigo">Hybrid</span>' :
                         '<span class="bdg bdg-gray">On-site</span>';
    const taskBadges = report.tasks && report.tasks.length > 0
      ? report.tasks.map(t => `<span class="bdg ${getStatusBadgeClass(t.status)}">${getStatusSymbol(t.status)} ${t.title}</span>`).join('')
      : '<span style="color:var(--color-text-secondary);font-size:11px">ไม่มีงาน</span>';
    const problemHTML = report.problems && report.problems !== '-'
      ? `<div class="rproblem"><div class="pdot"></div>${report.problems}</div>` : '';
    const progressColor   = report.progress >= 80 ? '#27500A' : report.progress >= 40 ? '#633806' : '#8B4513';
    const progressBgColor = report.progress >= 80 ? '#639922' : report.progress >= 40 ? '#EF9F27' : '#E24B4A';
    const dataF = `${report.work_mode === 'wfh' ? 'wfh ' : ''}${!report.problems || report.problems === '-' ? 'sent' : 'sent prob'}`;
    return `
      <div class="rrow" data-f="${dataF}">
        <div class="av av-sm ${avatarColor}">${initials}</div>
        <div class="rmain">
          <div class="rname">${report.name}</div>
          <div class="rmeta">${report.role} · ${workModeBadge} · ${report.submit_time || '—'}</div>
          <div class="rtags">${taskBadges}</div>
          ${problemHTML}
          <button class="btn-detail" onclick="showDetail('${report.id}')">ดูรายละเอียด / คอมเมนต์</button>
        </div>
        <div class="pcol">
          <div class="ppct" style="color:${progressColor}">${report.progress || 0}%</div>
          <div class="pbar2"><div class="pfill2" style="width:${report.progress || 0}%;background:${progressBgColor}"></div></div>
        </div>
      </div>`;
  }

  /* ── แสดงรายการรายงานที่ส่งแล้ว ── */
  if (isSuperAdmin && reports.length > 0) {
    /* จัดกลุ่มตาม department เมื่อเป็น super admin */
    const deptReports = {};
    reports.forEach(r => {
      const dept = r.department || 'ไม่ระบุหน่วยงาน';
      if (!deptReports[dept]) deptReports[dept] = [];
      deptReports[dept].push(r);
    });

    let globalIdx = 0;
    Object.entries(deptReports).forEach(([dept, members]) => {
      /* คำนวณ data-f ของ header ให้ครอบคลุม filter ที่สมาชิกมี */
      const hasWfh  = members.some(r => r.work_mode === 'wfh');
      const hasProb = members.some(r => r.problems && r.problems !== '-');
      const headerF = `sent${hasWfh ? ' wfh' : ''}${hasProb ? ' prob' : ''}`;

      sRows.insertAdjacentHTML('beforeend', `
        <div class="rrow" data-f="${headerF}"
          style="background:#F3EEE8;border-left:3px solid #C9A96E;padding:7px 14px;cursor:default;pointer-events:none;margin-top:4px">
          <div style="font-size:11px;font-weight:700;color:#5D4A2E;letter-spacing:.05em">${dept}</div>
          <div class="rmain" style="align-self:center">
            <span class="bdg bdg-green">${members.length} คน ส่งแล้ว</span>
            ${hasProb ? `<span class="bdg bdg-red" style="margin-left:4px">มีปัญหา ${members.filter(r=>r.problems&&r.problems!=='-').length}</span>` : ''}
          </div>
        </div>`);

      members.forEach(r => {
        sRows.insertAdjacentHTML('beforeend', buildReportRow(r, globalIdx++));
      });
    });
  } else {
    /* แสดงแบบ flat สำหรับหัวหน้างานทั่วไป */
    reports.forEach((report, idx) => {
      sRows.insertAdjacentHTML('beforeend', buildReportRow(report, idx));
    });
  }

  /* ── แถวพนักงานที่ยังไม่ส่ง (จัดกลุ่มตาม department) ── */
  if (unsentUsers.length > 0) {
    const avatarColors = ['av-teal', 'av-purple', 'av-coral', 'av-amber'];
    const deptGroups = {};
    unsentUsers.forEach(u => {
      const dept = u.department || 'ไม่ระบุหน่วยงาน';
      if (!deptGroups[dept]) deptGroups[dept] = [];
      deptGroups[dept].push(u);
    });

    let globalIdx = reports.length;
    Object.entries(deptGroups).forEach(([dept, members]) => {
      sRows.insertAdjacentHTML('beforeend', `
        <div class="rrow" data-f="unsent" style="background:#F3EEE8;border-left:3px solid #C9A96E;padding:7px 14px;cursor:default;pointer-events:none;margin-top:4px">
          <div style="font-size:11px;font-weight:700;color:#5D4A2E;letter-spacing:.05em">${dept}</div>
          <div class="rmain" style="align-self:center">
            <span class="bdg bdg-red">${members.length} คน ยังไม่ส่ง</span>
          </div>
        </div>
      `);

      members.forEach(u => {
        const initials = getInitials(u.name);
        const avatarColor = avatarColors[globalIdx % 4];
        globalIdx++;
        sRows.insertAdjacentHTML('beforeend', `
          <div class="rrow" data-f="unsent" style="opacity:.65;padding-left:24px">
            <div class="av av-sm ${avatarColor}" style="filter:grayscale(.5)">${initials}</div>
            <div class="rmain">
              <div class="rname">${u.name}</div>
              <div class="rmeta">${u.role || ''} · <span style="color:#E24B4A;font-weight:500">ยังไม่ส่งรายงาน</span></div>
            </div>
            <div class="pcol">
              <div class="ppct" style="color:var(--color-text-secondary)">—</div>
            </div>
          </div>
        `);
      });
    });
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

/* ── Tag selection ── */
let selTag = '';
function stag(el){
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
  if (selTag !== el.textContent) { el.classList.add('on'); selTag = el.textContent; }
  else { selTag = ''; }
}

/* ── Send comment ── */
async function sendCmt() {
  const msg = document.getElementById('s-msg').value.trim();
  if (!msg || !currentReportId) return;

  const commentData = {
    author_id: currentUser.user_id,
    author_name: currentUser.name,
    author_role: currentUser.role,
    avatar_color: 'av-blue',
    author_initials: getInitials(currentUser.name),
    message: msg,
    tag: selTag
  };

  try {
    const res = await fetch(`/api/reports/${currentReportId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commentData)
    });
    if (res.ok) {
      document.getElementById('s-msg').value = '';
      document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
      selTag = '';
      const ok = document.getElementById('s-ok');
      ok.style.display = 'block';
      setTimeout(() => ok.style.display = 'none', 3000);
      loadReportDetail(currentReportId);
    }
  } catch(e) {
    console.error('Error sending comment:', e);
  }
}

/* ── Description modal (read-only) ── */
function viewDesc(desc) {
  document.getElementById('task-desc-input').value = desc;
  document.getElementById('desc-modal').classList.add('on');
}

function closeDescModal() {
  document.getElementById('desc-modal').classList.remove('on');
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

/* ════════════════════════════════════════
   USER MANAGEMENT (super admin only)
   ════════════════════════════════════════ */

let userEditMode = false;
let userEditEmail = null;
let allUsers = [];
let ignoreMigrated = false;

const levelRoleMap = { '0':'employee','1':'supervisor','2':'director','3':'executive','9':'super_admin' };
const levelLabelMap = { 0:'พนักงาน',1:'หัวหน้างาน',2:'ผู้อำนวยการ',3:'ผู้บริหาร',9:'ผู้ดูแลระบบ' };
const avatarCycleColors = ['av-teal','av-purple','av-coral','av-amber','av-blue'];

function showUsersScreen() {
  document.getElementById('sup-list').style.display = 'none';
  document.getElementById('sup-detail').style.display = 'none';
  document.getElementById('sup-users').style.display = 'block';
  loadUserManagement();
}

function hideUsersScreen() {
  document.getElementById('sup-users').style.display = 'none';
  document.getElementById('sup-list').style.display = 'block';
}

async function loadUserManagement() {
  document.getElementById('u-rows').innerHTML =
    '<div style="text-align:center;color:var(--color-text-secondary);padding:1.5rem">กำลังโหลด...</div>';
  // migrate ignore field — เรียกครั้งเดียวต่อ session
  if (!ignoreMigrated) {
    ignoreMigrated = true;
    fetch('/api/admin/migrate/ignore', { method:'POST' }).catch(() => {});
  }
  try {
    const res = await fetch('/api/admin/users');
    if (!res.ok) throw new Error('Forbidden');
    allUsers = await res.json();
    renderUserTable(allUsers);
  } catch(e) {
    document.getElementById('u-rows').innerHTML =
      '<div style="text-align:center;color:#e24b4a;padding:1.5rem">ไม่มีสิทธิ์เข้าถึงข้อมูล</div>';
  }
}

function renderUserTable(users) {
  const container = document.getElementById('u-rows');
  if (!users.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--color-text-secondary);padding:1.5rem">ไม่พบผู้ใช้</div>';
    return;
  }

  // จัดกลุ่มตาม department
  const groups = {};
  users.forEach(u => {
    const dept = u.department || 'ไม่ระบุหน่วยงาน';
    if (!groups[dept]) groups[dept] = [];
    groups[dept].push(u);
  });

  let html = '';
  let colorIdx = 0;
  Object.entries(groups).forEach(([dept, members]) => {
    html += `
      <div style="background:#F3EEE8;border-left:3px solid #C9A96E;padding:7px 14px;margin-top:6px;border-radius:0 4px 4px 0">
        <span style="font-size:11px;font-weight:700;color:#5D4A2E;letter-spacing:.05em">${dept}</span>
        <span style="font-size:10px;color:#8C7A5E;margin-left:6px">${members.length} คน</span>
      </div>`;

    members.forEach(u => {
      const name = `${u.firstname || ''} ${u.lastname || ''}`.trim();
      const initials = getInitials(name || u.email);
      const avColor = avatarCycleColors[colorIdx++ % avatarCycleColors.length];
      const lv = u.level ?? 0;
      const ignoreVal = u.ignore ?? 0;
      const emailSafe = (u.email || '').replace(/'/g, "\\'");
      const nameSafe = name.replace(/'/g, "\\'");
      html += `
        <div class="rrow" style="${ignoreVal ? 'opacity:.55' : ''}">
          <div class="av av-sm ${avColor}">${initials}</div>
          <div class="rmain">
            <div class="rname">${name}</div>
            <div class="rmeta">${u.email || '—'}</div>
            <div style="font-size:11px;color:var(--color-text-secondary);margin-top:2px">${u.position || ''}</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px">
              <span class="bdg bdg-gray">Lv.${lv} ${levelLabelMap[lv] || ''}</span>
              <span class="bdg ${ignoreVal ? 'bdg-red' : 'bdg-green'}" style="cursor:pointer"
                onclick="toggleIgnore('${emailSafe}',${ignoreVal})"
                title="คลิกเพื่อสลับสถานะ">${ignoreVal ? 'ซ่อน' : 'ปกติ'}</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;align-self:center">
            <button class="btn-detail" onclick="openEditUserModal('${emailSafe}')">✏ แก้ไข</button>
            <button class="btn-detail" style="color:#e24b4a;border-color:#ffd0d0"
              onclick="confirmDeleteUser('${emailSafe}','${nameSafe}')">ลบ</button>
          </div>
        </div>`;
    });
  });
  container.innerHTML = html;
}

function filterUsers(query) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? allUsers.filter(u => {
        const name = `${u.firstname||''} ${u.lastname||''}`.toLowerCase();
        return name.includes(q)
          || (u.email||'').toLowerCase().includes(q)
          || (u.department||'').toLowerCase().includes(q)
          || (u.position||'').toLowerCase().includes(q);
      })
    : allUsers;
  renderUserTable(filtered);
}

function autoFillRole() {
  const lv = document.getElementById('u-level').value;
  document.getElementById('u-role').value = levelRoleMap[lv] || 'employee';
}

function _setModalField(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

function openAddUserModal() {
  userEditMode = false;
  userEditEmail = null;
  document.getElementById('user-modal-title').textContent = 'เพิ่มผู้ใช้ใหม่';
  document.getElementById('u-email').readOnly = false;
  document.getElementById('u-email').style.opacity = '1';
  document.getElementById('u-pwd-hint').textContent = '(จำเป็น)';
  ['u-firstname','u-lastname','u-email','u-personal-id','u-position','u-department','u-agency','u-password']
    .forEach(id => _setModalField(id, ''));
  _setModalField('u-level', '0');
  _setModalField('u-role', 'employee');
  _setModalField('u-ignore', '0');
  document.getElementById('user-modal').classList.add('on');
}

function openEditUserModal(email) {
  const u = allUsers.find(x => x.email === email);
  if (!u) return;
  userEditMode = true;
  userEditEmail = email;
  document.getElementById('user-modal-title').textContent = 'แก้ไขข้อมูลผู้ใช้';
  document.getElementById('u-email').readOnly = true;
  document.getElementById('u-email').style.opacity = '.6';
  document.getElementById('u-pwd-hint').textContent = '(เว้นว่างไว้หากไม่ต้องการเปลี่ยน)';
  _setModalField('u-firstname', u.firstname);
  _setModalField('u-lastname', u.lastname);
  _setModalField('u-email', u.email);
  _setModalField('u-personal-id', u.personal_id);
  _setModalField('u-position', u.position);
  _setModalField('u-department', u.department);
  _setModalField('u-agency', u.agency);
  _setModalField('u-level', String(u.level ?? 0));
  _setModalField('u-role', u.role || 'employee');
  _setModalField('u-ignore', String(u.ignore ?? 0));
  _setModalField('u-password', '');
  document.getElementById('user-modal').classList.add('on');
}

function closeUserModal() {
  document.getElementById('user-modal').classList.remove('on');
}

async function saveUser() {
  const firstname   = document.getElementById('u-firstname').value.trim();
  const lastname    = document.getElementById('u-lastname').value.trim();
  const email       = document.getElementById('u-email').value.trim();
  const personal_id = document.getElementById('u-personal-id').value.trim();
  const password    = document.getElementById('u-password').value.trim();

  if (!firstname || !lastname || !personal_id) {
    Swal.fire({ icon:'warning', title:'กรอกข้อมูลไม่ครบ', text:'กรุณากรอก ชื่อ นามสกุล และรหัสประจำตัว', confirmButtonText:'ตกลง' });
    return;
  }
  if (!userEditMode && !email) {
    Swal.fire({ icon:'warning', title:'กรอกข้อมูลไม่ครบ', text:'กรุณากรอกอีเมล', confirmButtonText:'ตกลง' });
    return;
  }
  if (!userEditMode && !password) {
    Swal.fire({ icon:'warning', title:'กรอกข้อมูลไม่ครบ', text:'กรุณากำหนดรหัสผ่าน', confirmButtonText:'ตกลง' });
    return;
  }

  const level = parseInt(document.getElementById('u-level').value);
  const payload = {
    firstname,
    lastname,
    personal_id,
    position:   document.getElementById('u-position').value.trim(),
    department: document.getElementById('u-department').value.trim(),
    agency:     document.getElementById('u-agency').value.trim(),
    level,
    role:   document.getElementById('u-role').value.trim() || levelRoleMap[String(level)] || 'employee',
    ignore: parseInt(document.getElementById('u-ignore').value),
  };
  if (password) payload.password = password;

  try {
    let res;
    if (userEditMode) {
      res = await fetch(`/api/admin/users/${encodeURIComponent(userEditEmail)}`, {
        method: 'PUT',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      payload.email = email;
      res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
    }
    if (res.ok) {
      closeUserModal();
      Swal.fire({ icon:'success', title:'บันทึกสำเร็จ', timer:1500, showConfirmButton:false });
      loadUserManagement();
    } else {
      const err = await res.json().catch(() => ({}));
      Swal.fire({ icon:'error', title:'เกิดข้อผิดพลาด', text: err.detail || 'ไม่สามารถบันทึกได้', confirmButtonText:'ตกลง' });
    }
  } catch(e) {
    Swal.fire({ icon:'error', title:'เกิดข้อผิดพลาด', text:'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์', confirmButtonText:'ตกลง' });
  }
}

async function confirmDeleteUser(email, name) {
  const result = await Swal.fire({
    icon: 'warning',
    title: 'ยืนยันการลบ',
    html: `ลบผู้ใช้ <strong>${name}</strong><br><span style="font-size:12px;color:var(--color-text-secondary)">${email}</span><br><br><span style="font-size:11px;color:#e24b4a">ข้อมูลจะถูกลบถาวร ไม่สามารถกู้คืนได้</span>`,
    showCancelButton: true,
    confirmButtonText: 'ลบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#e24b4a',
  });
  if (!result.isConfirmed) return;
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, { method:'DELETE' });
    if (res.ok) {
      Swal.fire({ icon:'success', title:'ลบเรียบร้อย', timer:1500, showConfirmButton:false });
      loadUserManagement();
    } else {
      Swal.fire({ icon:'error', title:'ลบไม่สำเร็จ', confirmButtonText:'ตกลง' });
    }
  } catch(e) {
    Swal.fire({ icon:'error', title:'เกิดข้อผิดพลาด', confirmButtonText:'ตกลง' });
  }
}

async function toggleIgnore(email, currentIgnore) {
  const newIgnore = currentIgnore ? 0 : 1;
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ ignore: newIgnore })
    });
    if (res.ok) loadUserManagement();
  } catch(e) { console.error(e); }
}
