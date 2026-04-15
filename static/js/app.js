const thM=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const thD=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

//? ตัวแปรสถานะส่วนกลาง (Global State)
let currentUser = null;          //? เก็บข้อมูลผู้ใช้ที่ Login อยู่
let currentReportId = null;      //? ID ของรายงานฉบับปัจจุบัน (user_id + YYYY-MM-DD)
let currentReportExists = false; //? ตรวจสอบว่ารายงานของวันนี้ถูกสร้างไปแล้วหรือยัง (เพื่อเลือกระหว่าง POST หรือ PATCH)
//? ฟังก์ชันอัปเดตนาฬิกาและวันที่แสดงบนหน้าจอ
function tick(){
  const n=new Date();
  //? แปลงปี ค.ศ. เป็น พ.ศ. (+543) และดึงวันที่จากอาเรย์ภาษาไทย
  const d=`${n.getDate()} ${thM[n.getMonth()]} ${n.getFullYear()+543}`;
  const t=`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
  const full=`วัน${thD[n.getDay()]}ที่ ${d}`;
  
  //? อัปเดตข้อมูลลงตาม Element ต่างๆ ใน HTML ถ้ามีอยู่
  const el1=document.getElementById('e-ts'); if(el1) el1.textContent=full;
  const el2=document.getElementById('e-ts2'); if(el2) el2.textContent=`${d} · ${t}`;
  const el3=document.getElementById('s-ts'); if(el3) el3.textContent=`${full} · ${t}`;
}
//? เริ่มรันนาฬิกาทันที และอัปเดตทุกๆ 1 วินาที
tick(); setInterval(tick,1000);

//? ฟังก์ชันตั้งค่าการทำงานให้กับปุ่มเลือกสถานะงาน (✓ เสร็จแล้ว, ⋯ กำลังทำ, ◯ ยังไม่เริ่ม)
function setupTaskStatusHandlers(row) {
  const spills = row.querySelector('.spills');
  //? วนลูปหาปุ่มสถานะทั้งหมดในแต่ละแถวงาน
  spills.querySelectorAll('.sp').forEach(span => {
    span.style.cursor = 'pointer';
    span.addEventListener('click', (e) => {
      //? เมื่อคลิก: ให้ลบสถานะ Active (.on) ออกจากปุ่มอื่นในแถวเดียวกันก่อน
      spills.querySelectorAll('.sp').forEach(s => s.classList.remove('on'));
      //? จากนั้นใส่สถานะ Active ให้กับปุ่มที่ถูกคลิก
      span.classList.add('on');
    });
  });
}

// Initialize task status handlers for existing tasks
document.querySelectorAll('.task-row').forEach(row => {
  setupTaskStatusHandlers(row);
  row.querySelector('.sp-done').classList.add('on');
});

//? ฟังก์ชันสำหรับเปลี่ยนหน้าจอระหว่างแดชบอร์ดพนักงาน (Emp) และผู้บริหาร (Sup)
function switchView(v){
  //? ปรับสถานะปุ่ม Switch ให้แสดงสถานะ Active
  document.querySelectorAll('.sw-btn').forEach((b,i)=>{b.classList.toggle('on',i===(v==='emp'?0:1))});
  //? แสดง/ซ่อน Screen ที่เกี่ยวข้อง
  document.getElementById('screen-emp').classList.toggle('on',v==='emp');
  document.getElementById('screen-sup').classList.toggle('on',v==='sup');
  
  //? เมื่อสลับไปหน้านั้นๆ ให้ทำการรีโหลดข้อมูลล่าสุดมาแสดงผล
  if(v==='sup') loadDashboard();
  if(v==='emp') loadTodaysReport();
}

//? ดึงข้อมูลรายงานของวันนี้มาแสดงผลเมื่อเข้าหน้าจอพนักงาน
async function loadTodaysReport() {
  if(!currentUser) return;
  try {
    const n = new Date();
    //? สร้าง Date String รูปแบบ YYYY-MM-DD
    const d = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
    const reportId = `${currentUser.user_id}_${d}`;
    currentReportId = reportId;
    
    //? กำหนดข้อมูลตัวตนในส่วนของคอมเมนท์แชท
    const cmtAv = document.getElementById('e-cmt-av');
    if(cmtAv) {
      cmtAv.textContent = getInitials(currentUser.name);
    }
    const cmtName = document.getElementById('e-cmt-name');
    if(cmtName) {
      cmtName.textContent = currentUser.name + ' · ส่งข้อความถึงหัวหน้างาน';
    }

    //? เรียก API เพื่อดูว่าวันนี้ส่งรายงานไปแล้วหรือยัง
    const res = await fetch(`/api/reports/${reportId}`);
    if(res.ok) {
      const report = await res.json();
      currentReportExists = true;
      //? นำข้อมูลรายงานเดิมมาใส่ในฟอร์มเพื่อให้แก้ไขต่อได้
      populateEmployeeForm(report);
    } else {
      currentReportExists = false;
      //? หากยังไม่เคยส่ง ให้เตรียมฟอร์มว่างสำหรับเริ่มใหม่
      populateEmployeeForm(null);
    }
  } catch(e) {
    console.error('Error fetching today\'s report:', e);
    populateEmployeeForm(null);
  }
}

//? ฟังก์ชันนำข้อมูลรายงานมาเติมลงในฟอร์มของพนักงาน
function populateEmployeeForm(report){
  const tasksContainer = document.getElementById('e-tasks');
  //? ล้างรายการงานเก่าออกก่อนเริ่มเรนเดอร์ใหม่
  tasksContainer.innerHTML = '';

  if(!report) {
    //? หากไม่มีรายงาน (เป็นฉบับใหม่): รีเซ็ตค่าเริ่มต้นของฟอร์ม
    document.getElementById('e-prog').value = 0;
    ep(0);
    document.getElementById('e-problem').value = '-';
    document.getElementById('e-plan').value = '';
    
    //? เพิ่มแถวงานว่างๆ 1 แถวเพื่อให้พนักงานเริ่มกรอกได้ทันที
    const r = document.createElement('div');
    r.className = 'task-row';
    r.innerHTML = `<div class="tnum">1</div><div class="task-body"><input type="text" placeholder="ระบุงานที่ทำ..." /><div class="spills"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div><button class="btn-desc" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button></div><button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน">&times;</button>`;
    tasksContainer.appendChild(r);
    setupTaskStatusHandlers(r);
    r.querySelector('.sp-done').classList.add('on');
    return;
  }

  //? กำหนดรูปแบบการทำงาน (Work Mode) ตามข้อมูลในรายงาน
  const modeText = report.work_mode === 'wfh' ? 'Work from Home' :
                   report.work_mode === 'hybrid' ? 'Hybrid' : 'On-site';
  document.querySelectorAll('.mode-opt').forEach(btn => {
    btn.classList.remove('on');
    if(btn.textContent.trim() === modeText) btn.classList.add('on');
  });

  //? อัปเดต Progress Bar และเปอร์เซ็นต์
  const prog = report.progress || 0;
  document.getElementById('e-prog').value = prog;
  ep(prog);

  //? เติมข้อมูลปัญหาและแผนงานในวันพรุ่งนี้
  document.getElementById('e-problem').value = report.problems || '-';
  document.getElementById('e-plan').value = report.plan_tomorrow || '';

  //? เรนเดอร์คอมเมนท์แชทสำหรับฝั่งพนักงาน
  renderComments(report.comments, 'e-thread');

  //? วนลูปเรนเดอร์รายการงาน (Tasks) ทั้งหมดที่มี
  if(report.tasks && report.tasks.length > 0) {
    report.tasks.forEach((task, idx) => {
      const r = document.createElement('div');
      r.className = 'task-row';
      //? หากมีคำอธิบายงาน (Description) ให้เก็บไว้ใน Data Attribute
      if (task.description) r.setAttribute('data-desc', task.description);
      
      //? เลือก Class ตามสถานะของงาน
      const statusClass = task.status === 'done' ? 'sp-done' : task.status === 'prog' ? 'sp-prog' : 'sp-pend';
      const descClass = task.description ? 'btn-desc has-data' : 'btn-desc';
      
      r.innerHTML = `<div class="tnum">${idx+1}</div><div class="task-body"><input type="text" value="${task.title}" /><div class="spills"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div><button class="${descClass}" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button></div><button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน">&times;</button>`;
      tasksContainer.appendChild(r);
      setupTaskStatusHandlers(r);
      //? ไฮไลท์ปุ่มสถานะงานตามข้อมูลที่ดึงมา
      r.querySelector('.'+statusClass).classList.add('on');
    });
  }
}

//? ฟังก์ชันอัปเดตการแสดงผล Progress Bar (สีและความกว้าง)
function ep(v){
  document.getElementById('e-pv').textContent=v+'%';
  document.getElementById('e-pb').style.width=v+'%';
  //? เปลี่ยนสีตามระดับความคืบหน้า: เขียว (>=80), ส้ม (>=40), แดง (<40)
  document.getElementById('e-pb').style.background=v>=80?'#639922':v>=40?'#EF9F27':'#E24B4A';
}
ep(65);

// Fetch current user and load today's report
//? ฟังก์ชันเริ่มต้นโปรแกรม: ดึงข้อมูลพนักงานปัจจุบันและโหลดรายงานของวันนี้
async function initializeApp(){
  try {
    const res = await fetch('/api/me');
    if(res.ok) {
      currentUser = await res.json();
      //? เมื่อรู้ตัวตนผู้ใช้แล้ว ให้ทำงานต่อเพื่อดึงรายงานของวันนี้
      loadTodaysReport();
    }
  } catch(e) {
    console.error('Failed to load user info:', e);
  }
}

//? เรียกใช้งานทันทีที่สคริปต์โหลดเสร็จ
initializeApp();

//? ฟังก์ชันจัดลำดับตัวเลขหน้าแถวงานใหม่ (เช่น 1, 2, 3...) เมื่อมีการลบหรือเพิ่มงาน
function reindexTasks() {
  document.querySelectorAll('#e-tasks .task-row').forEach((row, idx) => {
    row.querySelector('.tnum').textContent = idx + 1;
  });
}

//? ฟังก์ชันลบแถวงานที่ต้องการ
function deleteTask(btn) {
  //? หา Parent Element ที่เป็นแถวงาน และลบทิ้งจาก DOM
  btn.closest('.task-row').remove();
  //? มัดรวมการจัดลำดับเลขใหม่เพื่อให้ลำดับถูกต้องเสมอ
  reindexTasks();
}

let currentEditingRow = null; //? ตัวแปรเก็บแถวที่กำลังแก้ไขรายละเอียดงานอยู่ในขณะนั้น

//? ฟังก์ชันเปิดหน้าต่าง Modal เพื่อพิมพ์รายละเอียดงาน (Description)
function openDescModal(btn) {
  currentEditingRow = btn.closest('.task-row');
  //? ดึงข้อมูลรายละเอียดที่มีอยู่แล้ว (ถ้ามี) มาใส่ในช่องพิมพ์
  const desc = currentEditingRow.getAttribute('data-desc') || '';
  document.getElementById('task-desc-input').value = desc;
  //? แสดงหน้าต่าง Modal
  document.getElementById('desc-modal').classList.add('on');
}

//? ฟังก์ชันปิดหน้าต่าง Modal และรีเซ็ตสถานะการทำงาน
function closeDescModal() {
  document.getElementById('desc-modal').classList.remove('on');
  //? รีเซ็ตสถานะ Read-only และ Placeholder คืนค่าปกติ
  document.getElementById('task-desc-input').readOnly = false;
  document.getElementById('task-desc-input').placeholder = "พิมพ์รายละเอียดงานที่นี่...";
  const saveBtn = document.querySelector('#desc-modal .btn-save');
  if(saveBtn) saveBtn.style.display = 'block';
  const modalTtl = document.querySelector('#desc-modal .modal-ttl');
  if(modalTtl) modalTtl.textContent = "📝 คำอธิบายงาน";
  currentEditingRow = null; //? ล้างค่าแถวที่แก้ไขอยู่
}

//? ฟังก์ชันเปิด Modal ในโหมด "ดูอย่างเดียว" (Read-only) สำหรับฝั่งผู้บริหาร
function viewDesc(desc) {
  document.getElementById('task-desc-input').value = desc;
  document.getElementById('task-desc-input').readOnly = true;
  document.getElementById('task-desc-input').placeholder = "(ไม่มีรายละเอียด)";
  //? ซ่อนปุ่มบันทึกเพื่อป้องกันการแก้ไขข้อมูลโดยไม่ตั้งใจ
  const saveBtn = document.querySelector('#desc-modal .btn-save');
  if(saveBtn) saveBtn.style.display = 'none';
  const modalTtl = document.querySelector('#desc-modal .modal-ttl');
  if(modalTtl) modalTtl.textContent = "🔍 รายละเอียดงาน";
  document.getElementById('desc-modal').classList.add('on');
}

//? ฟังก์ชันบันทึกรายละเอียดงานที่พิมพ์ลงใน Modal กลับไปยังแถวงานหลัก
function saveTaskDesc() {
  if (!currentEditingRow) return;
  const val = document.getElementById('task-desc-input').value.trim();
  if (val) {
    //? เก็บข้อมูลลงใน Attribute 'data-desc' และเพิ่มสถานะ 'has-data' เพื่อเปลี่ยนสีไอคอน
    currentEditingRow.setAttribute('data-desc', val);
    currentEditingRow.querySelector('.btn-desc').classList.add('has-data');
  } else {
    //? หากพิมพ์ว่างเปล่า ให้ลบข้อมูลเดิมออกทั้งหมด
    currentEditingRow.removeAttribute('data-desc');
    currentEditingRow.querySelector('.btn-desc').classList.remove('has-data');
  }
  closeDescModal();
  //? หากเป็นรายงานเดิมที่ส่งไปแล้ว ให้รัน Auto-save เพื่อซิงค์ข้อมูลกับเซิร์ฟเวอร์ทันที
  if (currentReportId && currentReportExists) autoSaveTasks();
}

//? ฟังก์ชันบันทึกรายการงานอัตโนมัติ (Background Sync) ทันทีที่มีการแก้ไข
//! ฟังก์ชันนี้จะทำงานเฉพาะเมื่อรายงานถูกส่งครั้งแรกไปแล้วเท่านั้น (currentReportExists = true)
async function autoSaveTasks() {
  const tasks = [];
  //? รวบรวมข้อมูลงานทั้งหมดจากหน้าจอ
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
    //? ส่งเฉพาะส่วนของ Tasks ไปอัปเดตในฐานข้อมูลแบบ PATCH
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

//? ฟังก์ชันกรองรายชื่อรายงานในหน้าแดชบอร์ดของผู้บริหาร (Filter)
document.getElementById('s-filters').addEventListener('click',e=>{
  const btn=e.target.closest('.fb'); if(!btn) return;
  //? สลับสถานะปุ่ม Filter ที่เลือกอยู่
  document.querySelectorAll('.fb').forEach(b=>b.classList.remove('on')); btn.classList.add('on');
  const f=btn.dataset.f;
  //? วนลูปตรวจสอบทุกแถวว่าตรงตามเงื่อนไขการกรองหรือไม่
  document.querySelectorAll('#s-rows .rrow').forEach(r=>{
    //? f === 'all' คือแสดงทั้งหมด หรือ r.dataset.f.includes(f) คือเช็คตามหมวดหมู่ (เช่น 'wfh', 'prob')
    r.style.display=(f==='all'||r.dataset.f.includes(f))?'':'none';
  });
});

//? ฟังก์ชันแสดงพาเนลรายละเอียดรายงานแบบเจาะลึกคน (Supervisor View)
function showDetail(reportId){
  //? ซ่อนรายการสรุปด้านบน แล้วเปิดส่วนรายละเอียด
  document.getElementById('sup-list').style.display='none';
  document.getElementById('sup-detail').style.display='block';
  //? เรียกโหลดข้อมูลรายงานตาม ID ที่คลิกมา
  if(reportId) loadReportDetail(reportId);
}

//? ฟังก์ชันกดย้อนกลับจากหน้ารายละเอียดไปที่หน้ารายการสรุป
function hideDetail(){
  document.getElementById('sup-detail').style.display='none';
  document.getElementById('sup-list').style.display='block';
}

//? ฟังก์ชันดึงรายละเอียดรายงานฉบับเจาะจงจาก API
async function loadReportDetail(reportId) {
  currentReportId = reportId; //? กำหนด ID ที่กำลังทำงานอยู่ (สำคัญสำหรับการส่งคอมเมนท์ตอบกลับ)
  try {
    const res = await fetch(`/api/reports/${reportId}`);
    if(res.ok) {
      const report = await res.json();
      //? นำข้อมูลรายงานที่ได้ไปวาด (Render) ลงบนหน้าจอ
      renderReportDetail(report);
    }
  } catch(e) {
    console.error('Error loading report:', e);
  }
}

//? ฟังก์ชันหลักในการวาด (Render) ข้อมูลรายงานลงในส่วนของหน้า Supervisor Detail
function renderReportDetail(report) {
  const container = document.getElementById('sup-detail-content');
  if(!container) return;

  //? เตรียมข้อมูลดิบสำหรับนำไปใส่ในเทมเพลต HTML
  const initials = getInitials(report.name);
  const workModeBadge = report.work_mode === 'wfh' ? '<span class="bdg bdg-blue">WFH</span>' :
                       report.work_mode === 'hybrid' ? '<span class="bdg bdg-indigo">Hybrid</span>' :
                       '<span class="bdg bdg-gray">On-site</span>';

  //? คำนวณสีตามระดับ Progress
  const progressColor = report.progress >= 80 ? '#27500A' : report.progress >= 40 ? '#633806' : '#8B4513';
  const progressBgColor = report.progress >= 80 ? '#639922' : report.progress >= 40 ? '#EF9F27' : '#E24B4A';

  //? วนลูปสร้าง HTML สำหรับรายการงาน (Tasks)
  const tasksHTML = report.tasks && report.tasks.length > 0
    ? report.tasks.map(t => {
      //? ทำการ Escape ตัวอักษรพิเศษใน Description เพื่อไม่ให้สคริปต์พังเวลาส่งคืนไปเรียกฟังก์ชัน viewDesc
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

  //? แทรก HTML ทั้งหมดลงใน Container หลักของหน้าจอ
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

  //? เมื่อวาดข้อมูลหลักเสร็จแล้ว ให้จัดการวาดประวัติคอมเมนท์แชทต่อ
  renderComments(report.comments, 's-thread');
}

//? ฟังก์ชันสำหรับสร้างฟองสบู่ข้อความ (Chat Bubbles) ในประวัติคอมเมนท์
function renderComments(comments, containerId) {
  const thread = document.getElementById(containerId);
  if (!thread) return;

  //? ล้างประวัติแชทเก่า
  thread.innerHTML = '';
  if (comments && comments.length > 0) {
    comments.forEach(c => {
      //? ตรวจสอบบทบาทผู้ส่ง: หากเป็นหัวหน้าหรือแอดมิน จะใช้รูปแบบการแสดงผล (Style) ที่ต่างออกไป
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
    //? หากยังไม่มีการสื่อสาร ให้แสดงข้อความแจ้งเตือนเบาๆ
    thread.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary);text-align:center;padding:10px">ยังไม่มีการสื่อสาร</div>';
  }
}

let selTag=''; //? ตัวแปรเก็บ Tag ที่หัวหน้าเลือกใช้คอมเมนท์

//? ฟังก์ชันจัดการการคลิกเลือก Tag (เช่น 'ด่วน', 'รับทราบ')
function stag(el){
  //? ลบสถานะ Active (.on) ออกจากปุ่ม Tag อื่นๆ
  document.querySelectorAll('.tb').forEach(b=>b.classList.remove('on'));
  //? หากกดซ้ำตัวเดิมให้ทำการ "ยกเลิก" การเลือก แต่ถ้ากดตัวใหม่ให้ "เลือก" ตัวนั้น
  if(selTag!==el.textContent){ el.classList.add('on'); selTag=el.textContent; } else { selTag=''; }
}

//? ส่งข้อความคอมเมนท์ไปยังรายงาน (รองรับทั้งฝั่งพนักงานและผู้บริหาร)
async function sendCmt(type = 'sup'){
  const inputId = type === 'emp' ? 'e-msg' : 's-msg';
  const okId = type === 'emp' ? 'e-ok' : 's-ok';
  
  const msg=document.getElementById(inputId).value.trim(); if(!msg || !currentReportId || !currentUser) return;
  
  //? จัดเตรียมข้อมูลสำหรับบันทึกคอมเมนท์
  const commentData = {
    author_id: currentUser.user_id,
    author_name: currentUser.name,
    author_role: currentUser.role,
    avatar_color: type === 'emp' ? 'av-teal' : 'av-blue',
    author_initials: getInitials(currentUser.name),
    message: msg,
    //? หากเป็นผู้บริหาร สามารถเลือก Tag พิเศษ (เช่น งานด่วน, แก้ไข) ได้
    tag: type === 'emp' ? '' : selTag
  };

  try {
    const res = await fetch(`/api/reports/${currentReportId}/comments`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(commentData)
    });

    if(res.ok) {
      //? ล้างค่าใน Input และรีเซ็ต Tag เมื่อส่งสำเร็จ
      document.getElementById(inputId).value='';
      if (type === 'sup') {
        document.querySelectorAll('.tb').forEach(b=>b.classList.remove('on'));
        selTag='';
      }
      
      //? แสดงข้อความเช็คถูกสีเขียว (Toast) บอกสถานะการส่งสำเร็จ
      const ok=document.getElementById(okId);
      ok.style.display='block';
      setTimeout(()=>ok.style.display='none',3000);
      
      //? รีโหลดข้อมูลรายงานเพื่อแสดงคอมเมนท์ใหม่ในแชททันที
      if (type === 'emp') {
        loadTodaysReport();
      } else {
        loadReportDetail(currentReportId);
      }
    }
  } catch(e) {
    console.error('Error sending comment:', e);
    //todo เพิ่มการแจ้งเตือนพนักงานหากการส่งข้อความล้มเหลว (เช่น อินเทอร์เน็ตหลุด)
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

//? ฟังก์ชันช่วยดึงอักษรย่อจากชื่อ-นามสกุล (เช่น "John Doe" -> "JD")
function getInitials(name) {
    return name.split(' ').slice(0, 2).map(n => n.charAt(0)).join('').toUpperCase();
}

//? ฟังก์ชันกำหนด Class CSS สำหรับ Badge ตามสถานะงาน
function getStatusBadgeClass(status) {
    if(status === 'done') return 'bdg-green';  //? เสร็จแล้ว (สีเขียว)
    if(status === 'prog') return 'bdg-amber';  //? กำลังทำ (สีส้ม)
    return 'bdg-gray';                         //? ค้างคา/ยังไม่เริ่ม (สีเทา)
}

//? ฟังก์ชันกำหนดสัญลักษณ์สำหรับหน้าแสดงสถานะงาน
function getStatusSymbol(status) {
    if(status === 'done') return '✓';
    if(status === 'prog') return '⋯';
    return '◯';
}

//? ฟังก์ชันหลักในการวาด (Render) รายการรายงานทั้งหมดลงในแดชบอร์ดของผู้บริหาร
function renderReports(reports) {
    const sRows = document.getElementById('s-rows');
    if(!sRows) return;

    //? ล้างรายการเก่าออก
    sRows.innerHTML = '';

    if(!reports || reports.length === 0) {
        sRows.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-text-secondary)">ไม่มีรายงาน</div>';
        return;
    }

    //? วนลูปสร้างแถวรายงานของพนักงานแต่ละคน
    reports.forEach((report, idx) => {
        const initials = getInitials(report.name);
        //? สุ่มสีอวตารผู้ใช้ให้หลากหลายตามลำดับ
        const avatarColor = idx % 4 === 0 ? 'av-teal' : idx % 4 === 1 ? 'av-purple' : idx % 4 === 2 ? 'av-coral' : 'av-amber';

        //? เตรียม Badge แสดงประเภทการทำงาน
        const workModeBadge = report.work_mode === 'wfh' ? '<span class="bdg bdg-blue">WFH</span>' :
                             report.work_mode === 'hybrid' ? '<span class="bdg bdg-indigo">Hybrid</span>' :
                             '<span class="bdg bdg-gray">On-site</span>';

        //? สร้างรายการสถานะงานย่อยๆ มาแสดงที่หน้าสรุป
        const taskBadges = report.tasks && report.tasks.length > 0
            ? report.tasks.map(t => `<span class="bdg ${getStatusBadgeClass(t.status)}">${getStatusSymbol(t.status)} ${t.title}</span>`).join('')
            : '<span style="color:var(--color-text-secondary);font-size:11px">ไม่มีงาน</span>';

        //? ตรวจสอบว่ามีการส่งปัญหา (Problems) มาหรือไม่ เพื่อไฮไลท์ให้หัวหน้าเห็น
        const problemHTML = report.problems && report.problems !== '-'
            ? `<div class="rproblem"><div class="pdot"></div>${report.problems}</div>`
            : '';

        const progressColor = report.progress >= 80 ? '#27500A' : report.progress >= 40 ? '#633806' : '#8B4513';
        const progressBgColor = report.progress >= 80 ? '#639922' : report.progress >= 40 ? '#EF9F27' : '#E24B4A';

        //? กำหนด Attributes สำหรับใช้ในการทำ Filtering (เช่น การกรอง 'prob' สำหรับรายงานที่มีปัญหา)
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

        //? แทรกแถวงานลงในตารางสรุป
        sRows.insertAdjacentHTML('beforeend', rowHTML);
    });
}
