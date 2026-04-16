const thM=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']; //? รายชื่อเดือนภาษาไทยแบบย่อ
const thD=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์']; //? รายชื่อวันในสัปดาห์ภาษาไทย

//? ตัวแปรสถานะส่วนกลาง (Global State)
let currentUser = null;          //? ข้อมูลพนักงานปัจจุบัน
let currentReportId = null;      //? ID รายงาน (user_id_YYYY-MM-DD)
let currentReportExists = false; //? สถานะการมีอยู่ของรายงานในฐานข้อมูล
let viewDate = null;             //? วันที่ที่กำลังดู (null = วันปัจจุบัน)
let isHistoryMode = false;       //? สถานะ "โหมดย้อนหลัง" (ถ้าจริง จะแก้ไขข้อมูลไม่ได้)
let planWeekStart = null;        //? สัปดาห์ที่กำลังดูในหน้าแผนงาน (YYYY-MM-DD ของวันจันทร์)
let _planData = {};              //? Cache ข้อมูลแผนงานที่โหลดมาล่าสุด

//? ฟังก์ชันนาฬิกาและวันที่แบบ Real-time (อัปเดตทุก 1 วินาที เพื่อแสดงผลที่หน้าจอ)
function tick(){
  const n=new Date();
  //? แปลงปี ค.ศ. เป็น พ.ศ. โดยการ +543 และดึงชื่อเดือนจาก Array thM ที่เตรียมไว้
  const d=`${n.getDate()} ${thM[n.getMonth()]} ${n.getFullYear()+543}`;
  //? จัดรูปแบบเวลา HH:MM:SS ให้มีเลข 0 นำหน้า (PadStart) เพื่อความสวยงาม
  const t=`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
  const full=`วัน${thD[n.getDay()]}ที่ ${d}`;
  
  //? นำข้อมูลวันที่และเวลาไปแสดงผลใน Element ต่างๆ บนหน้าจอ (ตรวจสอบการมีอยู่ของ Element ก่อนเสมอ)
  const el1=document.getElementById('e-ts'); if(el1) el1.textContent=full;
  const el2=document.getElementById('e-ts2'); if(el2) el2.textContent=`${d} · ${t}`;
}
tick(); //? เรียกใช้งานทันทีเมื่อโหลดสคริปต์
setInterval(tick,1000); //? ตั้งเวลาให้ทำงานซ้ำทุก 1 วินาที (1000ms)

/* ── ตัวช่วยจัดการวันที่ (Date helpers) ── */

//? ดึงวันที่ปัจจุบันในรูปแบบ String (YYYY-MM-DD) สำหรับใช้ติดต่อกับ API หรือเปรียบเทียบค่า
function getTodayStr() {
  const n = new Date();
  //! สำคัญ: เดือนใน JS เริ่มจาก 0-11 จึงต้อง +1 เสมอเพื่อให้ได้ค่าเดือนที่ถูกต้อง (1-12)
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}

//? แปลงวันที่จาก String เป็นรูปแบบภาษาไทย (วันจันทร์ที่ 1 ม.ค. 2569)
function formatDateThai(dateStr) {
  //? ใช้ T00:00:00 เพื่อป้องกันปัญหาเรื่อง Timezone Offset ใน Browser
  const d = new Date(dateStr + 'T00:00:00');
  return `วัน${thD[d.getDay()]}ที่ ${d.getDate()} ${thM[d.getMonth()]} ${d.getFullYear()+543}`;
}

/* ── ระบบนำทางวันที่ (Date navigation) ── */

//? เปลี่ยนวันที่ไปข้างหน้าหรือย้อนหลังตามจำนวนวันที่กำหนด (delta)
function navigateDate(delta) {
  const today = getTodayStr();
  const base = viewDate || today;
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + delta); //? บวก/ลบ วันที่
  
  const newDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  
  //? ป้องกันไม่ให้เลือกดูวันที่เกินวันปัจจุบัน (อนาคต)
  if (newDate > today) return;
  
  //? หากเป็นวันปัจจุบัน ให้รีเซ็ต viewDate เป็น null (เพื่อใช้สถานะ Today ปกติ)
  viewDate = newDate === today ? null : newDate;
  updateDateNav(); //? อัปเดตการแสดงผล UI (ปุ่ม, แบนเนอร์)
  loadReport(newDate); //? โหลดรายงานของวันที่เลือก
}

//? ฟังก์ชันสำหรับรีเซ็ตกลับมาดูรายงานของ "วันปัจจุบัน" (Today)
function goToToday() {
  viewDate = null; //? ล้างค่าวันที่ที่ระบุไว้ เพื่อให้ระบบกลับไปใช้ getTodayStr() ตามปกติ
  updateDateNav(); //? รีเซ็ตสถานะปุ่มและแบนเนอร์แสดงวันที่
  loadReport(getTodayStr()); //? โหลดรายงานของวันนี้จาก Server
}

//? ฟังก์ชันจัดการเมื่อผู้ใช้เลือกวันที่ผ่านช่อง Input Date โดยตรง
function onDateInputChange(val) {
  if (!val) return;
  const today = getTodayStr();
  //? ตรวจสอบ: ห้ามเลือกดูวันที่ล่วงหน้า (อนาคต)
  if (val > today) return;
  //? หากเลือกเป็นวันนี้ ให้รีเซ็ตสถานะเป็นปกติ (ไม่ใช่โหมดย้อนหลัง)
  viewDate = val === today ? null : val;
  updateDateNav();
  loadReport(val);
}

//? อัปเดตองค์ประกอบต่างๆ บนหน้าจอตามสถานะวันที่ (ปัจจุบัน vs ย้อนหลัง)
function updateDateNav() {
  const today = getTodayStr();
  const current = viewDate || today;

  //? แสดงวันที่ที่กำลังดูอยู่ในรูปแบบภาษาไทย
  const displayEl = document.getElementById('nav-date-display');
  if (displayEl) displayEl.textContent = formatDateThai(current);

  //? ปรับค่าในช่อง Input Date ให้ตรงกับที่เลือก
  const inputEl = document.getElementById('nav-date-input');
  if (inputEl) { inputEl.value = current; inputEl.max = today; }

  //? ตรวจสอบว่าอยู่ในโหมดย้อนหลังหรือไม่
  isHistoryMode = (current !== today);

  //? แสดงแถบคำเตือนสีส้ม (History Banner) เมื่อดูข้อมูลย้อนหลัง
  const banner = document.getElementById('history-banner');
  if (banner) banner.style.display = isHistoryMode ? 'flex' : 'none';
  const bannerText = document.getElementById('history-banner-text');
  if (bannerText && isHistoryMode)
    bannerText.textContent = `กำลังดูรายงานย้อนหลัง — ${formatDateThai(current)} · ไม่สามารถแก้ไขได้`;

  //? ซ่อนปุ่ม "ไปวันนี้" หากอยู่ที่วันปัจจุบันอยู่แล้ว
  const todayBtn = document.getElementById('btn-goto-today');
  if (todayBtn) todayBtn.style.display = isHistoryMode ? '' : 'none';
  
  //? ปิดการใช้งานปุ่ม "ถัดไป" หากอยู่ที่วันปัจจุบัน (ไม่ให้ดูอนาคต)
  const nextBtn = document.getElementById('btn-next-day');
  if (nextBtn) nextBtn.disabled = !isHistoryMode;

  //? จัดการการซ่อน/แสดง องค์ประกอบต่างๆ ในโหมดย้อนหลัง
  const addBtn = document.getElementById('e-add');
  const submitBtn = document.getElementById('btn-submit');
  const composeBox = document.getElementById('e-compose-box');
  
  //! ใน History Mode พนักงานจะไม่สามารถแก้ใขข้อมูลใดๆ ได้ (ปุ่มและกล่องข้อความจะถูกซ่อน)
  if (addBtn) addBtn.style.display = isHistoryMode ? 'none' : '';
  if (submitBtn) submitBtn.style.display = isHistoryMode ? 'none' : '';
  if (composeBox) composeBox.style.display = isHistoryMode ? 'none' : '';

  //? ใส่ Class พิเศษให้ Container หลักเพื่อคุม Style แบบ Read-only ผ่าน CSS
  const screen = document.getElementById('screen-emp');
  if (screen) {
    if (isHistoryMode) screen.classList.add('history-mode');
    else screen.classList.remove('history-mode');
  }
}

/* ── จัดการสถานะงาน (Task status handlers) ── */
//? ฟังก์ชันสำหรับตั้งค่า Event Listener ให้กับปุ่มสถานะงาน (เสร็จแล้ว/กำลังทำ/ยังไม่เริ่ม)
function setupTaskStatusHandlers(row) {
  const spills = row.querySelector('.spills');
  spills.querySelectorAll('.sp').forEach(span => {
    span.style.cursor = 'pointer';
    span.addEventListener('click', () => {
      //! ตรวจสอบ: หากอยู่ในโหมดย้อนหลัง (History Mode) จะไม่สามารถเปลี่ยนสถานะได้
      if (isHistoryMode) return;
      
      //? เคลียร์ Class "on" ออกจากทุกปุ่มก่อน แล้วค่อยใส่ให้ปุ่มที่ถูกคลิก
      spills.querySelectorAll('.sp').forEach(s => s.classList.remove('on'));
      span.classList.add('on');
      
      //todo ส่งข้อมูลบันทึกอัตโนมัติเมื่อมีการเปลี่ยนสถานะ เพื่อป้องกันข้อมูลสูญหาย
      if (currentReportId && currentReportExists) autoSaveTasks();
    });
  });
}

/* ── โหลดข้อมูลรายงาน (Load report) ── */
//? ฟังก์ชันดึงรายงานจากเซิร์ฟเวอร์ตามวันที่กำหนด
async function loadReport(dateStr) {
  //? ตรวจสอบว่ามีข้อมูลผู้ใช้แล้วหรือยัง (ป้องกัน Error กรณีเรียกใช้เร็วเกินไป)
  if (!currentUser) return;
  
  const tasksEl = document.getElementById('e-tasks');
  //? แสดงหน้า Loading ก่อนเริ่มคำขอ API
  if (tasksEl) tasksEl.innerHTML = '<div class="ld-wrap"><div class="ld-spin"></div><span class="ld-dots">กำลังโหลด</span></div>';
  
  try {
    //? รหัสรายงานคือ user_id + วันที่ (เช่น employee1_2026-04-15)
    const reportId = `${currentUser.user_id}_${dateStr}`;
    currentReportId = reportId;

    //? เตรียมข้อมูลผู้ส่งคอมเมนท์ (Avatar และชื่อ)
    const cmtAv = document.getElementById('e-cmt-av');
    if (cmtAv) cmtAv.textContent = getInitials(currentUser.name);
    const cmtName = document.getElementById('e-cmt-name');
    if (cmtName) cmtName.textContent = currentUser.name + ' · ส่งข้อความถึงหัวหน้างาน';

    //? 1. ดึงงานจากแผนงานรายสัปดาห์ (Auto-inject) เตรียมไว้ก่อนหากเป็นวันปัจจุบัน
    let plannedTasks = [];
    if (!isHistoryMode) {
      try {
        const pr = await fetch(`/api/plans/tasks?date=${dateStr}`);
        if (pr.ok) plannedTasks = await pr.json();
      } catch(e) { /* จัดการ Error เงียบๆ เพื่อไม่ให้กระทบการโหลดรายงาน */ }
    }

    //? 2. ดึงข้อมูลรายงานประจำวัน (ถ้ามี)
    const res = await fetch(`/api/reports/${reportId}`);
    if (res.ok) {
      const report = await res.json();
      currentReportExists = true; //? ระบุว่ารายงานนี้มีอยู่แล้วในระบบ
      //? ส่งทั้งข้อมูลรายงานและแผนงานไปให้ฟังก์ชัน Populate จัดการ
      populateEmployeeForm(report, isHistoryMode, plannedTasks);
    } else {
      currentReportExists = false; //? รายงานใหม่ (ยังไม่เคยส่ง)
      populateEmployeeForm(null, isHistoryMode, plannedTasks);
    }
  } catch(e) {
    //! แจ้งเตือน: หากเกิดข้อผิดพลาดในการดึงข้อมูล (Network Error) ให้แสดงฟอร์มว่างปล่าว
    console.error('Error loading report:', e);
    populateEmployeeForm(null, isHistoryMode);
  }
}

// Alias used by initializeApp
function loadTodaysReport() { loadReport(getTodayStr()); }

/* ── Populate form ── */
/* ── นำข้อมูลลงฟอร์ม (Populate form) ── */
//? ฟังก์ชันหลักในการวาด (Render) ข้อมูลรายงานลงในหน้าจอพนักงาน
function populateEmployeeForm(report, readOnly, plannedTasks = []) {
  const tasksContainer = document.getElementById('e-tasks');
  tasksContainer.innerHTML = '';

  if (!report) {
    //? --- กรณีไม่มีรายงาน (ผู้ใช้เริ่มกรอกใหม่) ---
    document.getElementById('e-prog').value = 0;
    ep(0);
    document.getElementById('e-problem').value = readOnly ? '' : '-';
    document.getElementById('e-plan').value = '';

    //? ปิด/เปิด การแก้ไขตามสถานะ Read-only
    document.getElementById('e-prog').disabled = readOnly;
    document.getElementById('e-problem').readOnly = readOnly;
    document.getElementById('e-plan').readOnly = readOnly;

    if (!readOnly) {
      if (plannedTasks.length > 0) {
        //? มีงานจากแผนงาน → pre-populate (ชื่องานล็อกแก้ไขไม่ได้)
        plannedTasks.forEach((task, idx) => {
          const r = document.createElement('div');
          r.className = 'task-row';
          r.dataset.fromPlan = 'true';
          if (task.description) r.setAttribute('data-desc', task.description);
          const descClass = task.description ? 'btn-desc has-data' : 'btn-desc';
          r.innerHTML = `
            <div class="tnum">${idx+1}</div>
            <div class="task-body">
              <input type="text" value="${task.title.replace(/"/g,'&quot;')}" readonly style="background:#F0F8FF;cursor:default" />
              <div class="spills"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div>
              <button class="${descClass}" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button>
              <span style="font-size:11px;color:#1B5E20;background:#E8F5E9;padding:2px 7px;border-radius:8px;font-weight:500">📋 จากแผนงาน</span>
            </div>
            <button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`;
          tasksContainer.appendChild(r);
          setupTaskStatusHandlers(r);
          r.querySelector('.sp-pend').classList.add('on'); //? default = ยังไม่เริ่ม
        });
      } else {
        //? ไม่มีแผนงาน → สร้างแถวงานเปล่าๆ 1 แถวเริ่มต้น
        const r = document.createElement('div');
        r.className = 'task-row';
        r.innerHTML = `
          <div class="tnum">1</div>
          <div class="task-body">
            <input type="text" placeholder="ระบุงานที่ทำ..." />
            <div class="spills"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div>
            <button class="btn-desc" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button>
          </div>
          <button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`;
        tasksContainer.appendChild(r);
        setupTaskStatusHandlers(r);
        r.querySelector('.sp-done').classList.add('on'); //? ค่าเริ่มต้นคือ "เสร็จแล้ว"
      }
    } else {
      //? หากเป็นพนักงานมาเปิดดู "ย้อนหลัง" แล้วไม่มีข้อมูล: แสดงข้อความแจ้งเตือน (📭)
      tasksContainer.innerHTML = '<div style="padding:10px 0;color:var(--color-text-secondary);font-size:13px;text-align:center">📭 ไม่พบรายงานในวันที่เลือก</div>';
    }
    renderComments([], 'e-thread'); //? ล้าง Thread สำหรับคอมเมนท์แชทให้ว่างเปล่า
    return;
  }

  //? --- กรณีมีข้อมูลรายงานเดิม (ดึงมาจากฐานข้อมูล) ---
  
  //? เลือก Mode ทำงาน (WFH/Hybrid/On-site)
  const modeText = report.work_mode === 'wfh' ? 'Work from Home' :
                   report.work_mode === 'hybrid' ? 'Hybrid' : 'On-site';
  document.querySelectorAll('.mode-opt').forEach(btn => {
    btn.classList.remove('on');
    if (btn.textContent.trim() === modeText) btn.classList.add('on');
  });

  //? อัปเดต Progress Bar
  const prog = report.progress || 0;
  document.getElementById('e-prog').value = prog;
  document.getElementById('e-prog').disabled = readOnly;
  ep(prog);

  //? เติมข้อมูลลงในช่องพิมพ์ปัญหาและแผนงาน
  document.getElementById('e-problem').value = report.problems || '-';
  document.getElementById('e-problem').readOnly = readOnly;
  document.getElementById('e-plan').value = report.plan_tomorrow || '';
  document.getElementById('e-plan').readOnly = readOnly;

  //? เรนเดอร์คอมเมนท์แชท
  renderComments(report.comments, 'e-thread');

  //? 6. สร้างรายการงาน (Tasks) จากรายงานเดิม พร้อมเติมงานจากแผนที่ขาดหายไป (Smart Inject)
  const existingTasks = report.tasks || [];
  const existingTitles = new Set(existingTasks.map(t => (t.title || '').trim()));
  
  //? รวมงานจากแแผนที่ยังไม่มีในรายงาน (เฉพาะโหมดแก้ใข)
  let tasksToRender = [...existingTasks];
  if (!readOnly && plannedTasks && plannedTasks.length > 0) {
    plannedTasks.forEach(pt => {
      if (!existingTitles.has((pt.title || '').trim())) {
        //? ทำเครื่องหมายว่าเป็นงานที่มาจากแผน (เพื่อล็อก Title)
        tasksToRender.push({ ...pt, from_plan: true });
      }
    });
  }

  if (tasksToRender.length > 0) {
    tasksToRender.forEach((task, idx) => {
      const r = document.createElement('div');
      r.className = 'task-row';
      if (task.description) r.setAttribute('data-desc', task.description);
      
      const isFromPlan = task.from_plan === true;
      if (isFromPlan) r.dataset.fromPlan = 'true';

      const statusClass = task.status === 'done' ? 'sp-done' : task.status === 'prog' ? 'sp-prog' : 'sp-pend';
      const descClass = task.description ? 'btn-desc has-data' : 'btn-desc';
      const titleAttr = (readOnly || isFromPlan)
        ? `readonly ${isFromPlan ? 'style="background:#F0F8FF;cursor:default"' : ''}`
        : '';
      const delBtn = readOnly ? '' : `<button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`;
      const planBadge = isFromPlan
        ? '<span style="font-size:11px;color:#1B5E20;background:#E8F5E9;padding:2px 7px;border-radius:8px;font-weight:500">📋 จากแผนงาน</span>'
        : '';

      r.innerHTML = `
        <div class="tnum">${idx+1}</div>
        <div class="task-body">
          <input type="text" value="${task.title.replace(/"/g,'&quot;')}" ${titleAttr} />
          <div class="spills"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div>
          <button class="${descClass}" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button>
          ${planBadge}
        </div>
        ${delBtn}`;

      tasksContainer.appendChild(r);
      setupTaskStatusHandlers(r); //? ผูก Event Listener ให้กับปุ่มสถานะในแถวงานนี้
      r.querySelector('.' + statusClass).classList.add('on'); //? ใส่ Class "on" ให้กับสถานะที่ตรงกับ DB
    });
  }
}

//? ฟังก์ชันอัปเดตสถานะของ ProgressBar (สีและความกว้าง) ตามเปอร์เซ็นต์งาน
function ep(v) {
  document.getElementById('e-pv').textContent = v + '%'; //? อัปเดตตัวเลข % บนหน้าจอ
  document.getElementById('e-pb').style.width = v + '%'; //? ปรับความกว้างของแถบ Progress
  
  //? เลือกสีตามความก้าวหน้าเพื่อสื่อความหมาย (Visual Indicator)
  //! 80%+: เขียว (ดีมาก), 40-79%: ส้ม (กำลังดำเนินงาน), <40%: แดง (ยังไม่สำเร็จ)
  document.getElementById('e-pb').style.background = v >= 80 ? '#639922' : v >= 40 ? '#EF9F27' : '#E24B4A';
}

/* ── App init ── */
/* ── เริ่มต้นแอปพลิเคชัน (App init) ── */
//? ฟังก์ชันสำหรับดึงข้อมูลพื้นฐานเมื่อเริ่มต้นหน้าเว็บ (ตัวตนผู้ใช้ และสิทธิ์การใช้งาน)
async function initializeApp() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) {
        //? หาก Session หมดอายุหรือไม่ได้ Login ให้เด้งกลับไปหน้าแรกทันที
        window.location.replace('/');
        return;
    }
    currentUser = await res.json();
    
    //? นำข้อมูลพนักงาน (ชื่อ, ตำแหน่ง, ฝ่าย) มาอัปเดตลงบน Navigation Bar และ Profile Panel
    document.getElementById('nb-av').textContent = getInitials(currentUser.name);
    document.getElementById('nb-name').textContent = currentUser.name;
    document.getElementById('nb-role').textContent = currentUser.position || currentUser.role;
    document.getElementById('info-name').textContent = currentUser.name;
    document.getElementById('info-role').textContent = currentUser.position || currentUser.role;
    document.getElementById('info-dept').textContent = currentUser.department || '—';
    
    //? จัดการเรื่องสิทธิ์การใช้งาน (RBAC - Role Based Access Control) สำหรับเมนูผู้ดูแล
    const userLevel = parseInt(localStorage.getItem('user_level') || '0', 10);
    const userRole = (localStorage.getItem('user_role') || '').toLowerCase();
    //? เช็คว่า User มีสิทธิ์เป็น Admin หรือไม่ (Level > 0 หรือมีคำว่า Admin ใน Role)
    const isSuperAdmin = userLevel > 0 || userRole.includes('admin') || userRole.includes('ผู้ดูแลระบบ');
    const goAdminBtn = document.getElementById('goAdminBtn');
    
    if (!isSuperAdmin && goAdminBtn) {
        //? หากไม่มีสิทธิ์ ให้ซ่อนปุ่ม Admin ไปเลยเพื่อความสวยงามและปลอดภัย
        goAdminBtn.style.display = 'none';
    }
    
    const goAdminMenu = document.getElementById('goAdminMenu');
    if (isSuperAdmin && goAdminMenu) {
        goAdminMenu.style.display = 'flex';
    }

    //? อัปเดตสถานะการนำทางวันที่ (Today/Historical) และโหลดรายงานฉบับปัจจุบัน
    updateDateNav();
    loadTodaysReport();
    checkAndShowAnnouncement();
  } catch(e) {
    //! เตือน: หากโหลดข้อมูล User ไม่สำเร็จ (เช่น Token แปะมาผิด) ให้ส่งกลับหน้า Login ทันที
    console.error('Failed to load user info:', e);
    window.location.replace('/');
  }
}
initializeApp();

//? ฟังก์ชัน Logout: บันทึกชื่อไว้แสดงในหน้า logout แล้วพากลับหน้า Logout
window.doLogout = function() {
    if (currentUser && currentUser.name) {
        localStorage.setItem('user_name', currentUser.name);
    }
    window.location.replace('/logout');
};

/* ── ระบบจัดการ Profile และรหัสผ่าน (User Profile & Password) ── */

//? เปิด/ปิด เมนู Dropdown ของผู้ใช้
window.toggleUserMenu = function(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('um-dropdown');
    const btn = document.querySelector('.user-menu-btn');
    if (dropdown) {
        const isOpen = dropdown.classList.contains('on');
        dropdown.classList.toggle('on', !isOpen);
        if (btn) btn.classList.toggle('active', !isOpen);
    }
};

//? ปิด Dropdown เมื่อคลิกที่อื่นบนหน้าจอ
document.addEventListener('click', () => {
    const dropdown = document.getElementById('um-dropdown');
    const btn = document.querySelector('.user-menu-btn');
    if (dropdown && dropdown.classList.contains('on')) {
        dropdown.classList.remove('on');
        if (btn) btn.classList.remove('active');
    }
});

//? แสดง Modal ข้อมูลส่วนตัว และเติมข้อมูลปัจจุบัน
window.showProfileModal = function() {
    if (!currentUser) return;
    
    //? เติมข้อมูลลงในฟิลด์ที่แสดงผล (Read-only)
    document.getElementById('p-name').textContent = currentUser.name || '—';
    document.getElementById('p-email').textContent = currentUser.email || '—';
    document.getElementById('p-id').textContent = currentUser.user_id || '—';
    document.getElementById('p-role').textContent = currentUser.position || currentUser.role || '—';
    //? แปลงค่า level เป็นชื่อสิทธิ์ภาษาไทยเพื่อแสดงผลในโปรไฟล์
    const levelLabels = { 0: 'ผู้ปฏิบัติงาน', 1: 'หัวหน้างาน', 2: 'ผอ.กอง/รองคณบดี', 3: 'ผอ.สน.' };
    const lvl = parseInt(currentUser.level ?? 0, 10);
    document.getElementById('p-level').textContent = levelLabels[lvl] ?? `ระดับ ${lvl}`;
    document.getElementById('p-dept').textContent = currentUser.department + (currentUser.agency ? ` / ${currentUser.agency}` : '');
    
    //? ล้างค่าในช่องกรอกรหัสผ่านและข้อความแจ้งเตือนทุกครั้งที่เปิด
    document.getElementById('p-new-pw').value = '';
    document.getElementById('p-conf-pw').value = '';
    const msg = document.getElementById('pw-match-msg');
    if (msg) {
        msg.textContent = '';
        msg.className = 'validation-msg';
    }
    
    document.getElementById('profile-modal').classList.add('on');
};

window.closeProfileModal = function() {
    document.getElementById('profile-modal').classList.remove('on');
};

//? ตรวจสอบการจับคู่ของรหัสผ่านแบบ Real-time
window.validatePasswordMatch = function() {
    const newPw = document.getElementById('p-new-pw').value;
    const confPw = document.getElementById('p-conf-pw').value;
    const msg = document.getElementById('pw-match-msg');
    
    if (!newPw && !confPw) {
        msg.textContent = '';
        msg.className = 'validation-msg';
        return;
    }
    
    if (newPw === confPw) {
        msg.textContent = '✓ รหัสผ่านตรงกัน';
        msg.className = 'validation-msg success';
    } else {
        msg.textContent = '✗ รหัสผ่านยังไม่ตรงกัน';
        msg.className = 'validation-msg error';
    }
};

//? ฟังก์ชันส่งคำขอเปลี่ยนรหัสผ่าน
window.updatePassword = function() {
    const newPw = document.getElementById('p-new-pw').value.trim();
    const confPw = document.getElementById('p-conf-pw').value.trim();
    
    //? 1. ตรวจสอบเงื่อนไขเบื้องต้นก่อนส่ง API
    if (!newPw) {
        Swal.fire({ icon: 'warning', title: 'กรุณากรอกรหัสผ่านใหม่', confirmButtonColor: '#1059A3' });
        return;
    }
    if (newPw.length < 4) {
        Swal.fire({ icon: 'warning', title: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร', confirmButtonColor: '#1059A3' });
        return;
    }
    if (newPw !== confPw) {
        Swal.fire({ icon: 'error', title: 'รหัสผ่านไม่ตรงกัน', text: 'กรุณาตรวจสอบการยืนยันรหัสผ่านอีกครั้ง', confirmButtonColor: '#1059A3' });
        return;
    }
    
    //? 2. ยืนยันการดำเนินการผ่าน SweetAlert2
    Swal.fire({
        title: 'ยืนยันการแก้ไข?',
        text: 'เมื่อเปลี่ยนรหัสผ่านแล้ว ระบบจะทำการออกจากระบบเพื่อให้คุณเข้าสู่ระบบใหม่ด้วยรหัสผ่านใหม่',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#1059A3',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const saveBtn = document.getElementById('btn-save-pw');
            const originalText = saveBtn.textContent;
            
            try {
                //? แสดงสถานะ Loading ระหว่างเรียก API
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<span class="ld-spin" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px"></span> กำลังบันทึก...';

                const res = await fetch('/api/me/password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_password: newPw, confirm_password: confPw })
                });

                if (res.ok) {
                    Swal.fire({
                        icon: 'success',
                        title: 'สำเร็จ!',
                        text: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว ระบบกำลังพาคุณไปหน้าออกจากระบบ',
                        confirmButtonColor: '#1D9E75'
                    }).then(() => {
                        window.doLogout(); //? ออกจากระบบทันทีเพื่อความปลอดภัย
                    });
                } else {
                    const err = await res.json();
                    Swal.fire({ icon: 'error', title: 'ล้มเหลว', text: err.detail || 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน', confirmButtonColor: '#1059A3' });
                    saveBtn.disabled = false;
                    saveBtn.textContent = originalText;
                }
            } catch (e) {
                Swal.fire({ icon: 'error', title: 'ข้อผิดพลาดเครือข่าย', text: 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้', confirmButtonColor: '#1059A3' });
                saveBtn.disabled = false;
                saveBtn.textContent = originalText;
            }
        }
    });
};

/* ── จัดการลำดับงาน (Task management) ── */
//? ฟังก์ชันสำหรับเรียงลำดับเลขที่งาน (1, 2, 3...) ใหม่ให้ถูกต้องหลังย้ายหรือลบแถว
function reindexTasks() {
  document.querySelectorAll('#e-tasks .task-row').forEach((row, idx) => {
    row.querySelector('.tnum').textContent = idx + 1;
  });
}

//? ฟังก์ชันสำหรับลบแถวงานที่เลือก
function deleteTask(btn) {
  //! ตรวจสอบ: ห้ามลบข้อมูลในโหมดย้อนหลัง
  if (isHistoryMode) return;
  btn.closest('.task-row').remove();
  reindexTasks(); //? ทำการ Re-index เลขข้อหลังจากลบออก
  
  //todo เพิ่มการ Auto-save ทันทีหลังลบ เพื่อให้ข้อมูลใน DB ตรงกับหน้าจอ
  if (currentReportId && currentReportExists) autoSaveTasks();
}

/* ── ป๊อปอัปคำอธิบายงาน (Description modal) ── */
let currentEditingRow = null; //? ตัวแปรเก็บแถวที่กำลังแก้ไขรายละเอียดล่าสุด

//? ฟังก์ชันเปิด Modal เพื่อกรอกคำอธิบายเพิ่มเติมของแต่ละงาน
function openDescModal(btn) {
  currentEditingRow = btn.closest('.task-row');
  const desc = currentEditingRow.getAttribute('data-desc') || '';
  const inputEl = document.getElementById('task-desc-input');
  const titleEl = document.getElementById('modal-desc-title');
  const saveBtn = document.getElementById('modal-save-btn');
  const cancelBtn = document.getElementById('modal-cancel-btn');

  inputEl.value = desc; //? โหลดข้อมูลเก่ามาใส่ไว้ใน Input แถวนั้น

  //? ปรับเปลี่ยนหน้าตา Modal หากอยู่ในโหมดย้อนหลัง (ดูได้อย่างเดียว)
  if (isHistoryMode) {
    inputEl.readOnly = true;
    if (titleEl) titleEl.textContent = '🔍 รายละเอียดงาน (ย้อนหลัง)';
    if (saveBtn) saveBtn.style.display = 'none'; //? ซ่อนปุ่มบันทึก
    if (cancelBtn) cancelBtn.textContent = 'ปิด';
  } else {
    inputEl.readOnly = false;
    if (titleEl) titleEl.textContent = '📝 คำอธิบายงาน';
    if (saveBtn) saveBtn.style.display = '';
    if (cancelBtn) cancelBtn.textContent = 'ยกเลิก';
  }

  document.getElementById('desc-modal').classList.add('on'); //? แสดง Modal (ควบคุมผ่าน CSS)
}

function closeDescModal() {
  document.getElementById('desc-modal').classList.remove('on');
  currentEditingRow = null;
}

//? ฟังก์ชันบันทึกข้อมูลรายละเอียดที่กรอกกลับลงไปที่แถวงานเดิม
function saveTaskDesc() {
  //! ตรวจสอบ: หากเป็น History Mode ให้ปิด Modal โดยไม่มีการเปลี่ยนแปลง
  if (isHistoryMode) { closeDescModal(); return; }
  if (!currentEditingRow) return;
  
  const val = document.getElementById('task-desc-input').value.trim();
  if (val) {
    //? เก็บข้อมูลใน Custom Attribute "data-desc" และแสดง Icon ว่ามีรายละเอียดแล้ว
    currentEditingRow.setAttribute('data-desc', val);
    currentEditingRow.querySelector('.btn-desc').classList.add('has-data');
  } else {
    //? หากถูกลบข้อมูลจนว่าง ให้เอา Attribute และ Icon ออก
    currentEditingRow.removeAttribute('data-desc');
    currentEditingRow.querySelector('.btn-desc').classList.remove('has-data');
  }
  closeDescModal();
  
  //? หากรายงานนี้มีอยู่ในระบบแล้ว (เคย Save มาก่อน) ให้ทำการ Auto-save ทันที
  if (currentReportId && currentReportExists) autoSaveTasks();
}

/* ── บันทึกงานอัตโนมัติ (Auto-save tasks) ── */
//? ฟังก์ชันสำหรับส่งข้อมูลงานไปบันทึกที่เซิร์ฟเวอร์แบบเบื้องหลัง
async function autoSaveTasks() {
  //? สำคัญ: ห้ามรัน Auto-save หากอยู่ในโหมดย้อนหลัง
  if (isHistoryMode) return;
  const tasks = [];
  document.querySelectorAll('#e-tasks .task-row').forEach((row, idx) => {
    const title = row.querySelector('input').value.trim();
    if (title) {
      const spills = row.querySelector('.spills');
      let status = 'done';
      if (spills.querySelector('.sp-prog').classList.contains('on')) status = 'prog';
      else if (spills.querySelector('.sp-pend').classList.contains('on')) status = 'pend';
      tasks.push({ id: idx + 1, title, status, description: row.getAttribute('data-desc') || '', from_plan: row.dataset.fromPlan === 'true' });
    }
  });
  try {
    //? ใช้เมธอด PATCH เพื่ออัปเดตเฉพาะส่วนของรายการงาน
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

/* ── เพิ่มแถวงานใหม่ (Add task) ── */
document.getElementById('e-add').addEventListener('click', () => {
  //! ห้ามเพิ่มงานในโหมดย้อนหลัง
  if (isHistoryMode) return;
  
  const r = document.createElement('div');
  r.className = 'task-row';
  //? สร้างโครงสร้าง HTML สำหรับแถวงานใหม่
  r.innerHTML = `<div class="tnum"></div><div class="task-body"><input type="text" placeholder="ระบุงานที่ทำ..." style="margin-bottom:5px"/><div class="spills"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div><button class="btn-desc" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button></div><button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`;
  document.getElementById('e-tasks').appendChild(r);
  
  //? ตั้งสถานะเริ่มต้นเป็น "เสร็จแล้ว" (Done) และเปิดฟัง Event เปลี่ยนสถานะ
  setupTaskStatusHandlers(r);
  r.querySelector('.sp-done').classList.add('on');
  
  reindexTasks(); //? รันใหม่เพื่อให้เลขข้อเรียงลำดับถูก
  
  //todo เลื่อนโฟกัสไปที่ Input ที่สร้างใหม่เพื่อให้พนักงานพิมพ์ได้ทันที
  r.querySelector('input').focus();
});

/* ── จัดการเลือกโหมดการทำงาน (Work mode) ── */
document.querySelectorAll('.mode-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    //! ตรวจสอบ: ห้ามเปลี่ยนแนวทางการทำงานในโหมดย้อนหลัง
    if (isHistoryMode) return;
    document.querySelectorAll('.mode-opt').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    
    //todo เพิ่มการ Auto-save เมื่อมีการเปลี่ยน Work Mode ไม่ต้องรอคลิกส่งรายงาน
    if (currentReportId && currentReportExists) autoSaveTasks();
  });
});

/* ── Submit report ── */
/* ── ส่งรายงาน (Submit report) ── */
//? ฟังก์ชันหลักในการรวบรวมข้อมูลทั้งหมดในหน้าจอพนักงาน แล้วส่งไปยัง Backend
document.getElementById('btn-submit').addEventListener('click', async () => {
  //? ป้องกันการส่งงานหากอยู่ในโหมดดูย้อนหลัง
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

  const submitBtn = document.getElementById('btn-submit');
  const originalText = submitBtn.textContent;
  
  //? เปลี่ยนปุ่มให้เป็นสถานะ Loading (ปิดการใช้งานชั่วคราวและแสดง Spinner)
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;justify-content:center;">'
    + '<span class="ld-spin" style="width:18px;height:18px;border-width:2px;border-top-color:#fff;border-color:rgba(255,255,255,0.3);flex-shrink:0;"></span>'
    + '<span>กำลังส่งรายงาน...</span></span>';

  //? เตรียม Payload: ดึงข้อมูลรูปแบบการทำงาน (Work Mode)
  const modeText = document.querySelector('.mode-opt.on').textContent.trim().toLowerCase();
  let work_mode = 'onsite';
  if (modeText.includes('home')) work_mode = 'wfh';
  else if (modeText.includes('hybrid')) work_mode = 'hybrid';

  //? รวบรวมข้อมูลส่วนตัวและสรุปภาพรวมรายวัน
  const reportData = {
    user_id: currentUser.user_id,
    name: currentUser.name,
    role: currentUser.position || currentUser.role,  //? แสดงตำแหน่งงานจริง (position) ในรายงาน แทนการแสดง auth role
    department: currentUser.department,
    work_mode,
    progress: parseInt(document.getElementById('e-prog').value) || 0,
    problems: document.getElementById('e-problem').value,
    plan_tomorrow: document.getElementById('e-plan').value,
    tasks: [] //? สำหรับเก็บรายการงานย่อย
  };

  //? วนลูปอ่านข้อมูลทีละแถวงาน (Tasks) จากหน้าจอ
  document.querySelectorAll('#e-tasks .task-row').forEach((row, idx) => {
    const title = row.querySelector('input').value;
    //? จะเก็บเฉพาะงานที่มีการระบุชื่อ (Title) เท่านั้น
    if (title) {
      const spills = row.querySelector('.spills');
      let status = 'done';
      //? ตรวจสอบสถานะว่าพนักงานเลือกอะไรไว้ (on)
      if (spills.querySelector('.sp-prog').classList.contains('on')) status = 'prog';
      else if (spills.querySelector('.sp-pend').classList.contains('on')) status = 'pend';
      
      //? เพิ่มลงในรายการงานย่อย
      reportData.tasks.push({
        id: idx+1,
        title,
        status,
        description: row.getAttribute('data-desc') || '', //? รายละเอียดที่เก็บซ่อนไว้ใน Attribute
        from_plan: row.dataset.fromPlan === 'true'        //? งานจากแผน: ชื่อจะถูกล็อกเมื่อโหลดซ้ำ
      });
    }
  });

  try {
    //? ยิง API ขา POST เพื่อส่งรายงานเข้าฐานข้อมูล
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportData)
    });
    
    if (res.ok) {
      currentReportExists = true;
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
      
      //? แสดง SweetAlert2 แจ้งเตือนความสำเร็จ
      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ!',
        text: 'ส่งรายงานเรียบร้อยแล้ว',
        confirmButtonColor: '#1D9E75'
      }).then(() => {
        //? หลังจากส่งเสร็จ ให้เด้งกลับไปหน้า Admin (หน้าแรกของผู้ใช้)
        window.location.href = '/admin';
      });
    } else {
      //? รับข้อมูล Error จาก Backend มาแสดงผลให้ผู้ใช้ทราบ
      const errorData = await res.json();
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: errorData.detail || 'Unknown error',
        confirmButtonColor: '#1059A3'
      });
    }
  } catch(e) {
    //? กรณีเกิด Network Error
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
    Swal.fire({
      icon: 'error',
      title: 'เชื่อมต่อล้มเหลว',
      text: e.message,
      confirmButtonColor: '#1059A3'
    });
  }
});

/* ── ส่งคอมเมนท์แชท (Comment) ── */
//? ฟังก์ชันสำหรับส่งข้อความตอบกลับใน Thread รายงานให้กับหัวหน้างาน
async function sendCmt() {
  //! ห้ามส่งคอมเมนท์ในรายงานย้อนหลัง เพื่อรักษาความถูกต้องของข้อมูลเหตุการณ์
  if (isHistoryMode) return;

  //! ห้ามส่งคอมเมนท์หากยังไม่มีรายงานวันนี้ในระบบ
  if (!currentReportExists) {
    Swal.fire({ icon: 'warning', title: 'ยังไม่มีรายงาน', text: 'กรุณาส่งรายงานประจำวันก่อนจึงจะสามารถแสดงความคิดเห็นได้', confirmButtonColor: '#1059A3' });
    return;
  }

  const msg = document.getElementById('e-msg').value.trim();
  if (!msg || !currentReportId || !currentUser) return;

  //? เตรียมโครงสร้างข้อมูลคอมเมนท์
  const commentData = {
    author_id: currentUser.user_id,
    author_name: currentUser.name,
    author_role: currentUser.role,
    avatar_color: 'av-teal', //? สีพื้นหลังของตัวย่อชื่อพนักงาน
    author_initials: getInitials(currentUser.name),
    message: msg,
    tag: '' //? พนักงานปกติจะไม่สามารถใส่ Tag (เช่น รับทราบ/ต้องแก้ไข) ได้เหมือน Admin
  };

  try {
    const res = await fetch(`/api/reports/${currentReportId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commentData)
    });
    if (res.ok) {
      document.getElementById('e-msg').value = ''; //? ล้างช่องพิมพ์
      //? แสดงข้อความกำกับเบาๆ ว่าส่งสำเร็จแล้ว
      const ok = document.getElementById('e-ok');
      if (ok) {
        ok.style.display = 'block';
        setTimeout(() => ok.style.display = 'none', 3000);
      }
      //? โหลดรายงานใหม่เพื่อแสดงคอมเมนท์ล่าสุดที่เพิ่งส่งไป
      loadReport(viewDate || getTodayStr());
    }
  } catch(e) {
    //! เตือน: แสดง Error หากไม่สามารถส่งคอมเมนท์ได้
    console.error('Error sending comment:', e);
  }
}

/* ── แสดงผลคอมเมนท์ (Render comments) ── */
//? ฟังก์ชันสำหรับวาดกล่องคอมเมนท์ทั้งหมดลงในหน้าจอ (ใช้ทั้งหน้าพนักงานและหน้าจัดการ)
function renderComments(comments, containerId) {
  const thread = document.getElementById(containerId);
  if (!thread) return;
  thread.innerHTML = ''; //? ล้าง Thread เก่าทิ้งก่อน
  
  if (comments && comments.length > 0) {
    comments.forEach(c => {
      //? ตรวจสอบบทบาทว่าเป็นหัวหน้าหรือไม่ เพื่อปรับ Style ให้แตกต่าง
      const isSrv = c.author_role.includes('หัวหน้า') || c.author_role.includes('แอดมิน');
      const b = document.createElement('div');
      b.className = 'cbubble';
      
      //? แผนผังสีของ Tag สถานะจากหัวหน้างาน
      const tagColorMap = { 'ต้องแก้ไข': 'bdg-red', 'ดีมาก': 'bdg-green', 'ติดตามด่วน': 'bdg-amber', 'รับทราบ': 'bdg-gray' };
      const tagClass = c.tag ? (tagColorMap[c.tag] || 'bdg-blue') : '';
      const tag = c.tag ? `<span class="bdg ${tagClass}" style="font-size:10px">${c.tag}</span>` : '';
      
      //? วาด HTML สำหรับกล่องข้อความ
      b.innerHTML = `
        <div class="av ${c.avatar_color || 'av-gray'} av-sm">${c.author_initials || '??'}</div>
        <div>
          <div class="bname">${c.author_name} <span>${c.timestamp} · ${c.author_role}</span> ${tag}</div>
          <div class="btext ${isSrv ? 'sv' : ''}">${c.message}</div>
        </div>
      `;
      thread.appendChild(b);
    });
    //todo เพิ่มการเลื่อน Scrollbar ลงด้านล่างสุดอัตโนมัติเมื่อหัวข้อคอมเมนท์เยอะ
  } else {
    //? แจ้งพนักงานหากยังไม่มีคอมเมนท์ใดๆ
    thread.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary);text-align:center;padding:10px">คลิกที่นี่เพื่อเริ่มการเขียนคอมเมนต์</div>';
  }
}

/* ── ฟังก์ชันเสริม (Helpers) ── */
//? สร้างตัวอักษรย่อสำหรับใช้ใน Avatar (เช่น "สมชาย ดีใจ" -> "สดี")
function getInitials(name) {
  return name.split(' ').slice(0, 2).map(n => n.charAt(0)).join('').toUpperCase();
}

/* ── ระบบแผนงานรายสัปดาห์ (Weekly Plan) ── */

//? คืน YYYY-MM-DD ของวันจันทร์ในสัปดาห์ที่มี dateStr
function getMondayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

//? คืน array 6 วัน (จันทร์–เสาร์) จาก mondayStr
function getWeekDates(mondayStr) {
  const dates = [];
  const d = new Date(mondayStr + 'T00:00:00');
  for (let i = 0; i < 6; i++) {
    dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

//? สร้าง Label แสดงช่วงสัปดาห์เป็นภาษาไทย เช่น "14 เม.ย. — 19 เม.ย. 2569"
function formatPlanWeekLabel(mondayStr) {
  const dates = getWeekDates(mondayStr);
  const s = new Date(dates[0] + 'T00:00:00');
  const e = new Date(dates[5] + 'T00:00:00');
  return `${s.getDate()} ${thM[s.getMonth()]} — ${e.getDate()} ${thM[e.getMonth()]} ${e.getFullYear()+543}`;
}

//? Escape HTML เพื่อป้องกัน XSS เมื่อใส่ค่าลง innerHTML
function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

//? แสดงหน้าแผนงาน (ซ่อนฟอร์มรายงานปัจจุบัน)
function showPlanView() {
  document.getElementById('e-main').style.display = 'none';
  document.getElementById('e-plan-view').style.display = '';
  planWeekStart = getMondayOfWeek(getTodayStr());
  loadPlanForWeek(planWeekStart);
}

//? ซ่อนหน้าแผนงาน กลับไปหน้าฟอร์มรายงาน
function hidePlanView() {
  document.getElementById('e-plan-view').style.display = 'none';
  document.getElementById('e-main').style.display = '';
}

//? เลื่อนสัปดาห์ในหน้าแผนงาน (delta: -1 = ก่อนหน้า, +1 = ถัดไป)
function navigatePlanWeek(delta) {
  const d = new Date(planWeekStart + 'T00:00:00');
  d.setDate(d.getDate() + delta * 7);
  planWeekStart = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  loadPlanForWeek(planWeekStart);
}

//? ดึงแผนงานจาก API แล้ว render
async function loadPlanForWeek(weekStart) {
  document.getElementById('plan-week-label').textContent = formatPlanWeekLabel(weekStart);
  const container = document.getElementById('plan-days-container');
  container.innerHTML = '<div class="ld-wrap"><div class="ld-spin"></div><span class="ld-dots">กำลังโหลด</span></div>';
  try {
    const res = await fetch(`/api/plans?week=${weekStart}`);
    _planData = res.ok ? await res.json() : { days: {} };
  } catch(e) {
    _planData = { days: {} };
  }
  renderPlanDays(_planData, weekStart);
}

//? วาดหน้าแผนงาน — day cards (จ–ส) พร้อมช่อง input งานแต่ละวัน
function renderPlanDays(planData, weekStart) {
  const container = document.getElementById('plan-days-container');
  const days = planData.days || {};
  const dates = getWeekDates(weekStart);
  const dayLabels = ['วันจันทร์','วันอังคาร','วันพุธ','วันพฤหัสบดี','วันศุกร์','วันเสาร์'];
  const trashSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='3 6 5 6 21 6'/><path d='M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'/><path d='M10 11v6'/><path d='M14 11v6'/><path d='M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'/></svg>`;

  container.innerHTML = '';
  dates.forEach((dateStr, di) => {
    const tasks = days[dateStr] || [];
    const d = new Date(dateStr + 'T00:00:00');
    const dateLabel = `${dayLabels[di]}ที่ ${d.getDate()} ${thM[d.getMonth()]} ${d.getFullYear()+543}`;

    const card = document.createElement('div');
    card.className = 'plan-day-card';
    card.dataset.date = dateStr;

    let tasksHtml = '';
    tasks.forEach((t, i) => {
      const isApproved = t.approved === true;
      const isRejected = !t.approved && t.approved_by;
      const approvalBadge = isApproved
        ? `<span class="plan-task-approved yes" style="font-size:11px;cursor:default">✓ อนุมัติแล้ว</span>`
        : isRejected
        ? `<span class="plan-task-approved no" style="font-size:11px;cursor:default;background:#FFEBEE;color:#C62828">✗ ไม่อนุมัติ</span>`
        : '';
      tasksHtml += `
        <div class="plan-input-row" style="display:flex;gap:6px;margin-bottom:6px;align-items:flex-start" data-task-id="${t.id}">
          <span style="font-size:12px;color:var(--color-text-secondary);padding-top:7px;min-width:18px;flex-shrink:0">${i+1}</span>
          <div style="flex:1;display:flex;flex-direction:column;gap:4px">
            <input type="text" class="inp plan-task-title" value="${escHtml(t.title)}" placeholder="ชื่องาน..." style="font-size:13px${isApproved ? ';background:#F0F8FF;cursor:default' : ''}" ${isApproved ? 'readonly' : ''}>
            <input type="text" class="inp plan-task-desc" value="${escHtml(t.description||'')}" placeholder="คำอธิบาย (ไม่บังคับ)..." style="font-size:12px">
            ${approvalBadge}
          </div>
          <button onclick="removePlanTaskRow(this)" title="ลบ" style="background:none;border:none;cursor:pointer;color:#e74c3c;padding:4px;flex-shrink:0;margin-top:2px${isApproved ? ';opacity:0.3;pointer-events:none' : ''}" ${isApproved ? 'disabled' : ''}>${trashSvg}</button>
        </div>`;
    });

    card.innerHTML = `
      <div class="plan-day-hd">${dateLabel}</div>
      <div class="plan-tasks-list">${tasksHtml}</div>
      <button class="nav-btn nav-btn-back" style="margin-top:6px;font-size:11px" onclick="addPlanTaskRow(this)">+ เพิ่มงาน</button>`;

    container.appendChild(card);
  });
}

//? เพิ่มแถวงานใหม่ในวัน (dateStr) ที่ระบุ
function addPlanTaskRow(btn) {
  const list = btn.previousElementSibling; // .plan-tasks-list
  const count = list.querySelectorAll('.plan-input-row').length;
  const trashSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='3 6 5 6 21 6'/><path d='M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'/><path d='M10 11v6'/><path d='M14 11v6'/><path d='M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'/></svg>`;
  const row = document.createElement('div');
  row.className = 'plan-input-row';
  row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;align-items:flex-start';
  row.innerHTML = `
    <span style="font-size:12px;color:var(--color-text-secondary);padding-top:7px;min-width:18px;flex-shrink:0">${count+1}</span>
    <div style="flex:1;display:flex;flex-direction:column;gap:4px">
      <input type="text" class="inp plan-task-title" placeholder="ชื่องาน..." style="font-size:13px">
      <input type="text" class="inp plan-task-desc" placeholder="คำอธิบาย (ไม่บังคับ)..." style="font-size:12px">
    </div>
    <button onclick="removePlanTaskRow(this)" title="ลบ" style="background:none;border:none;cursor:pointer;color:#e74c3c;padding:4px;flex-shrink:0;margin-top:2px">${trashSvg}</button>`;
  list.appendChild(row);
  row.querySelector('.plan-task-title').focus();
}

//? ลบแถวงานออกจาก day card แล้ว re-index
function removePlanTaskRow(btn) {
  const row = btn.closest('.plan-input-row');
  const list = row.parentElement;
  row.remove();
  list.querySelectorAll('.plan-input-row').forEach((r, i) => {
    r.querySelector('span').textContent = i + 1;
  });
}

//? บันทึกแผนงาน → POST /api/plans
async function savePlan() {
  const btn = document.getElementById('btn-save-plan');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';

  const days = {};
  document.querySelectorAll('.plan-day-card').forEach(card => {
    const dateStr = card.dataset.date;
    const tasks = [];
    let nextNewId = 10000; // ใช้ ID สูงสำหรับงานใหม่ที่ยังไม่มี ID
    card.querySelectorAll('.plan-input-row').forEach(row => {
      const title = row.querySelector('.plan-task-title').value.trim();
      if (title) {
        const storedId = parseInt(row.dataset.taskId, 10);
        const id = isNaN(storedId) ? nextNewId++ : storedId;
        tasks.push({ id, title, description: row.querySelector('.plan-task-desc').value.trim() });
      }
    });
    if (tasks.length > 0) days[dateStr] = tasks;
  });

  try {
    const res = await fetch('/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start: planWeekStart, days })
    });
    if (res.ok) {
      _planData = await res.json();
      Swal.fire({ icon: 'success', title: 'บันทึกแล้ว!', text: 'แผนงานสัปดาห์นี้ถูกบันทึกเรียบร้อย', confirmButtonColor: '#2E7D32', timer: 2000, showConfirmButton: false });
    } else {
      const err = await res.json().catch(() => ({}));
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.detail || 'บันทึกไม่สำเร็จ', confirmButtonColor: '#1059A3' });
    }
  } catch(e) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อล้มเหลว', text: e.message, confirmButtonColor: '#1059A3' });
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

//? คืนค่า Class ของสถานะสำหรับสี Badge
function getStatusBadgeClass(status) {
  if (status === 'done') return 'bdg-green';
  if (status === 'prog') return 'bdg-amber';
  return 'bdg-gray';
}

//? คืนค่าสัญลักษณ์ Emoji ที่แสดงแทนสถานะของงาน
function getStatusSymbol(status) {
  if (status === 'done') return '✓'; //? เสร็จแล้ว
  if (status === 'prog') return '⋯'; //? กำลังทำ
  return '◯'; //? ยังไม่เริ่ม
}
