const thM=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const thD=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
let currentReportId = null;
let currentUser = { user_id: 'SUP001', name: 'สมวิทย์ หัวหน้างาน', role: 'หัวหน้างาน / ผู้ดูแลระบบ' };

function tick(){
  const n=new Date();
  const d=`${n.getDate()} ${thM[n.getMonth()]} ${n.getFullYear()+543}`;
  const t=`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
  const full=`วัน${thD[n.getDay()]}ที่ ${d}`;
  const el=document.getElementById('s-ts'); if(el) el.textContent=`${full} · ${t}`;
}
tick(); setInterval(tick,1000);

// Set today's date in the date filter
(function setDefaultDate(){
  const n = new Date();
  const d = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  const el = document.getElementById('s-date-filter');
  if(el) { el.value = d; el.addEventListener('change', () => loadDashboard()); }
})();

async function loadDashboard() {
  try {
    const dateEl = document.getElementById('s-date-filter');
    const dateParam = dateEl ? `?date=${dateEl.value}` : '';
    const res = await fetch(`/api/reports${dateParam}`);
    if(res.ok) {
      const data = await res.json();
      renderReports(data);
    }
  } catch(e) {
    console.error(e);
  }
}

loadDashboard();

document.getElementById('s-filters').addEventListener('click', e => {
  const btn = e.target.closest('.fb'); if(!btn) return;
  document.querySelectorAll('.fb').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  const f = btn.dataset.f;
  document.querySelectorAll('#s-rows .rrow').forEach(r => {
    r.style.display = (f === 'all' || r.dataset.f.includes(f)) ? '' : 'none';
  });
});

function showDetail(reportId){
  document.getElementById('sup-list').style.display = 'none';
  document.getElementById('sup-detail').style.display = 'block';
  if(reportId) loadReportDetail(reportId);
}

function hideDetail(){
  document.getElementById('sup-detail').style.display = 'none';
  document.getElementById('sup-list').style.display = 'block';
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

  renderComments(report.comments, 's-thread');
}

function renderReports(reports) {
  const sRows = document.getElementById('s-rows');
  if(!sRows) return;
  sRows.innerHTML = '';

  // Update stats
  const total = reports.length;
  const withProbs = reports.filter(r => r.problems && r.problems !== '-').length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-sent').textContent = total;
  document.getElementById('stat-unsent').textContent = 0;
  document.getElementById('stat-prob').textContent = withProbs;

  // Problems summary
  const probsList = document.getElementById('s-probs-list');
  if(probsList) {
    probsList.innerHTML = '';
    const probs = reports.filter(r => r.problems && r.problems !== '-');
    if(probs.length === 0) {
      probsList.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary)">ไม่มีปัญหาที่ต้องติดตาม</div>';
    } else {
      probs.forEach(r => {
        probsList.innerHTML += `
          <div style="display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:0.5px solid var(--color-border-tertiary)">
            <div class="pdot" style="margin-top:5px;flex-shrink:0"></div>
            <div>
              <div style="font-size:12px;font-weight:500">${r.name}</div>
              <div style="font-size:11px;color:#791F1F;margin-top:2px">${r.problems}</div>
            </div>
          </div>`;
      });
    }
  }

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
      ? `<div class="rproblem"><div class="pdot"></div>${report.problems}</div>` : '';
    const progressColor   = report.progress >= 80 ? '#27500A' : report.progress >= 40 ? '#633806' : '#8B4513';
    const progressBgColor = report.progress >= 80 ? '#639922' : report.progress >= 40 ? '#EF9F27' : '#E24B4A';
    const dataAttrs = `data-f="${report.work_mode === 'wfh' ? 'wfh ' : ''}${!report.problems || report.problems === '-' ? 'sent' : 'sent prob'}"`;

    sRows.insertAdjacentHTML('beforeend', `
      <div class="rrow" ${dataAttrs}>
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
      </div>
    `);
  });
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

let selTag = '';
function stag(el){
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
  if(selTag !== el.textContent){ el.classList.add('on'); selTag = el.textContent; }
  else { selTag = ''; }
}

async function sendCmt() {
  const msg = document.getElementById('s-msg').value.trim();
  if(!msg || !currentReportId) return;

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
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(commentData)
    });
    if(res.ok) {
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

function viewDesc(desc) {
  document.getElementById('task-desc-input').value = desc;
  document.getElementById('desc-modal').classList.add('on');
}

function closeDescModal() {
  document.getElementById('desc-modal').classList.remove('on');
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
