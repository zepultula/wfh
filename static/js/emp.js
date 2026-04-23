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

//? Map เก็บ intervalId ของตัวจับเวลาแต่ละงาน (key = task-row HTMLElement)
const taskTimers = new Map();

//? แปลงวินาทีเป็น string รูปแบบ HH:MM:SS
function formatSeconds(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

//? เริ่ม (หรือ resume) การจับเวลาของงาน — offsetSeconds คือวินาทีที่ผ่านไปแล้วก่อน session นี้
function startTaskTimer(row, offsetSeconds = 0) {
  stopTaskTimer(row); //! กัน double-interval
  const startedAt = new Date(Date.now() - offsetSeconds * 1000).toISOString();
  row.dataset.startedAt = startedAt;
  row.removeAttribute('data-elapsed');
  const display = row.querySelector('.task-timer');
  const tick = () => {
    const elapsed = Math.floor((Date.now() - new Date(row.dataset.startedAt).getTime()) / 1000);
    if (display) display.textContent = '⏱ ' + formatSeconds(elapsed);
  };
  tick();
  taskTimers.set(row, setInterval(tick, 1000));
  if (display) display.classList.remove('is-done', 'is-pend');
}

//? หยุดการจับเวลา — freeze=true จะ lock เวลาสุดท้ายลง data-elapsed (ใช้เมื่อสถานะ done)
function stopTaskTimer(row, freeze = false) {
  if (taskTimers.has(row)) { clearInterval(taskTimers.get(row)); taskTimers.delete(row); }
  if (freeze) {
    const elapsed = row.dataset.startedAt
      ? Math.floor((Date.now() - new Date(row.dataset.startedAt).getTime()) / 1000) : 0;
    row.dataset.elapsed = elapsed;
    const display = row.querySelector('.task-timer');
    if (display) { display.textContent = '✓ ' + formatSeconds(elapsed); display.classList.add('is-done'); display.classList.remove('is-pend'); }
  }
}

//? หยุดชั่วคราว (pend) โดยเก็บ elapsed ไว้แต่ไม่ lock เป็น done
function pauseTaskTimer(row) {
  if (taskTimers.has(row)) { clearInterval(taskTimers.get(row)); taskTimers.delete(row); }
  const elapsed = row.dataset.startedAt
    ? Math.floor((Date.now() - new Date(row.dataset.startedAt).getTime()) / 1000)
    : parseInt(row.dataset.elapsed || '0', 10);
  row.dataset.elapsed = elapsed;
  row.removeAttribute('data-started-at');
  const display = row.querySelector('.task-timer');
  if (display) { display.textContent = '◯ ' + formatSeconds(elapsed); display.classList.add('is-pend'); display.classList.remove('is-done'); }
}

//? ฟังก์ชัน restore timer state หลัง render task จาก DB (resume/freeze/show paused)
function initTaskTimer(row, task) {
  const display = row.querySelector('.task-timer');
  if (!display) return;
  if (isHistoryMode) {
    if (task.elapsed_seconds != null) {
      display.textContent = '✓ ' + formatSeconds(task.elapsed_seconds);
      display.classList.add('is-done');
    } else if (task.started_at) {
      const elapsed = Math.floor((Date.now() - new Date(task.started_at).getTime()) / 1000);
      display.textContent = '⏱ ' + formatSeconds(elapsed);
    }
    return;
  }
  if (task.status === 'done') {
    const elapsed = task.elapsed_seconds != null ? task.elapsed_seconds
      : (task.started_at ? Math.floor((Date.now() - new Date(task.started_at).getTime()) / 1000) : 0);
    row.dataset.elapsed = elapsed;
    display.textContent = '✓ ' + formatSeconds(elapsed);
    display.classList.add('is-done');
  } else if (task.status === 'prog') {
    const offsetSeconds = task.started_at
      ? Math.floor((Date.now() - new Date(task.started_at).getTime()) / 1000)
      : (task.elapsed_seconds || 0);
    startTaskTimer(row, offsetSeconds);
  } else { // pend
    const elapsed = task.elapsed_seconds || 0;
    row.dataset.elapsed = elapsed;
    display.textContent = '◯ ' + formatSeconds(elapsed);
    display.classList.add('is-pend');
  }
}

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

      //? ควบคุม timer ตามสถานะใหม่ที่เลือก
      const newStatus = span.classList.contains('sp-done') ? 'done'
                      : span.classList.contains('sp-prog') ? 'prog' : 'pend';
      if (newStatus === 'prog') {
        const titleVal = row.querySelector('input[type="text"]')?.value.trim();
        const prevElapsed = parseInt(row.dataset.elapsed || '0', 10);
        const hasStarted = prevElapsed > 0 || !!row.dataset.startedAt;
        //? เริ่ม timer เฉพาะเมื่อมีชื่องานแล้ว หรือเคยเริ่มไปก่อนหน้านี้แล้ว
        if (titleVal || hasStarted) startTaskTimer(row, prevElapsed);
      } else if (newStatus === 'done') {
        stopTaskTimer(row, true); //? freeze elapsed และแสดงเวลาสุดท้าย
      } else {
        pauseTaskTimer(row); //? หยุดชั่วคราว เก็บ elapsed ไว้
      }

      calcAndUpdateProgress(); //? อัปเดต progress อัตโนมัติเมื่อสถานะงานเปลี่ยน
      //todo ส่งข้อมูลบันทึกอัตโนมัติเมื่อมีการเปลี่ยนสถานะ เพื่อป้องกันข้อมูลสูญหาย
      if (currentReportId && currentReportExists) autoSaveTasks();
    });
  });

  //? เริ่ม timer อัตโนมัติเมื่อผู้ใช้พิมพ์ชื่องานครั้งแรก ขณะที่สถานะเป็น "กำลังดำเนินการ" และ timer ยังไม่ได้วิ่ง
  const _ti = row.querySelector('input[type="text"]');
  if (_ti) {
    _ti.addEventListener('input', () => {
      if (_ti.value.trim() && row.querySelector('.sp-prog.on') && !taskTimers.has(row)) {
        startTaskTimer(row, parseInt(row.dataset.elapsed || '0', 10));
      }
    });
  }
}

/* ── โหลดข้อมูลรายงาน (Load report) ── */
//? ฟังก์ชันดึงรายงานจากเซิร์ฟเวอร์ตามวันที่กำหนด
async function loadReport(dateStr) {
  //? ตรวจสอบว่ามีข้อมูลผู้ใช้แล้วหรือยัง (ป้องกัน Error กรณีเรียกใช้เร็วเกินไป)
  if (!currentUser) return;
  
  //? หยุด interval ทุกตัวก่อนโหลดวันใหม่ เพื่อป้องกัน memory leak
  taskTimers.forEach((id) => clearInterval(id));
  taskTimers.clear();
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
      const expBtn = document.getElementById('btn-export-excel');
      if (expBtn) expBtn.style.display = '';
      //? ส่งทั้งข้อมูลรายงานและแผนงานไปให้ฟังก์ชัน Populate จัดการ
      populateEmployeeForm(report, isHistoryMode, plannedTasks);
    } else {
      currentReportExists = false; //? รายงานใหม่ (ยังไม่เคยส่ง)
      const expBtn = document.getElementById('btn-export-excel');
      if (expBtn) expBtn.style.display = 'none';
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
  //? หยุด interval ทุกตัวก่อนล้างหน้าจอ เพื่อป้องกัน memory leak
  taskTimers.forEach((id) => clearInterval(id));
  taskTimers.clear();
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
          const attachClass = (task.files?.length > 0 || task.links?.length > 0) ? 'btn-desc has-data' : 'btn-desc';
          r.innerHTML = `
            <div class="tnum">${idx+1}</div>
            <div class="task-body">
              <input type="text" value="${task.title.replace(/"/g,'&quot;')}" readonly style="background:#F0F8FF;cursor:default" />
              <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
                <select class="task-type-select" style="width:auto;font-size:11px;padding:3px 8px;height:26px;border-radius:12px;background:#f8fafc" disabled>
                  <option value="แผนงานเชิงพัฒนา" selected>แผนงานเชิงพัฒนา</option>
                </select>
                <div class="spills" style="margin:0"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div>
              </div>
              <span class="task-timer">⏱ 00:00:00</span>
              <button class="${descClass}" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button>
              <button class="${attachClass} btn-attach" onclick="openAttachModal(this)">📎 ไฟล์/ลิงก์</button>
              <span style="font-size:11px;color:#1B5E20;background:#E8F5E9;padding:2px 7px;border-radius:8px;font-weight:500">📋 จากแผนงาน</span>
            </div>`;

          if(task.files && task.files.length > 0) r.setAttribute('data-files', JSON.stringify(task.files));
          if(task.links && task.links.length > 0) r.setAttribute('data-links', JSON.stringify(task.links));
          tasksContainer.appendChild(r);
          setupTaskStatusHandlers(r);
          r.querySelector('.sp-pend').classList.add('on'); //? default = ยังไม่เริ่ม
          initTaskTimer(r, { status: 'pend', started_at: null, elapsed_seconds: null });
        });
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
      const attachClass = (task.files?.length > 0 || task.links?.length > 0) ? 'btn-desc has-data' : 'btn-desc';
      const titleAttr = (readOnly || isFromPlan)
        ? `readonly ${isFromPlan ? 'style="background:#F0F8FF;cursor:default"' : ''}`
        : '';
      const delBtn = (readOnly || isFromPlan) ? '' : `<button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`;
      const planBadge = isFromPlan
        ? '<span style="font-size:11px;color:#1B5E20;background:#E8F5E9;padding:2px 7px;border-radius:8px;font-weight:500">📋 จากแผนงาน</span>'
        : '';

      r.innerHTML = `
        <div class="tnum">${idx+1}</div>
        <div class="task-body">
          <input type="text" value="${task.title.replace(/"/g,'&quot;')}" ${titleAttr} />
          <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
            <select class="task-type-select" style="width:auto;font-size:11px;padding:3px 8px;height:26px;border-radius:12px;background:#f8fafc" ${readOnly || isFromPlan ? 'disabled' : ''}>
              ${isFromPlan ? `
                <option value="แผนงานเชิงพัฒนา" selected>แผนงานเชิงพัฒนา</option>
              ` : `
                <option value="งานประจำ" ${task.task_type === 'งานประจำ' ? 'selected' : ''}>งานประจำ</option>
                <option value="งานที่รับมอบหมาย" ${task.task_type === 'งานที่รับมอบหมาย' ? 'selected' : ''}>งานที่รับมอบหมาย</option>
              `}
            </select>
            <div class="spills" style="margin:0"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div>
          </div>
          <span class="task-timer">⏱ 00:00:00</span>
          <button class="${descClass}" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button>
          <button class="${attachClass} btn-attach" onclick="openAttachModal(this)">📎 ไฟล์/ลิงก์</button>
          ${planBadge}
        </div>
        ${delBtn}`;

      if(task.files && task.files.length > 0) r.setAttribute('data-files', JSON.stringify(task.files));
      if(task.links && task.links.length > 0) r.setAttribute('data-links', JSON.stringify(task.links));

      tasksContainer.appendChild(r);
      setupTaskStatusHandlers(r); //? ผูก Event Listener ให้กับปุ่มสถานะในแถวงานนี้
      r.querySelector('.' + statusClass).classList.add('on'); //? ใส่ Class "on" ให้กับสถานะที่ตรงกับ DB
      initTaskTimer(r, task); //? restore timer state จาก DB (resume/freeze/show paused)
    });

    if (!readOnly) calcAndUpdateProgress();
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

//? คำนวณ % ความสำเร็จจากจำนวนงานที่เสร็จสิ้น นับเฉพาะแถวที่มีชื่องาน (ตรงกับที่ autoSaveTasks ส่งไป backend)
function calcTaskProgress() {
  const rows = [...document.querySelectorAll('#e-tasks .task-row')]
    .filter(row => row.querySelector('input[type="text"]')?.value.trim());
  if (!rows.length) return null;
  const done = rows.filter(row => row.querySelector('.sp-done.on')).length;
  return Math.round((done * 100) / rows.length);
}

//? คำนวณแล้วอัปเดต slider + progress bar อัตโนมัติ (ใช้ทั้ง status change, add, delete)
function calcAndUpdateProgress() {
  const auto = calcTaskProgress();
  if (auto !== null) {
    document.getElementById('e-prog').value = auto;
    ep(auto);
  }
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
  const row = btn.closest('.task-row');
  const title = row.querySelector('input[type="text"]')?.value?.trim() || 'งานนี้';
  Swal.fire({
    title: 'ลบงาน?',
    text: `"${title}"`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'ลบ',
    cancelButtonText: 'ยกเลิก',
  }).then(result => {
    if (!result.isConfirmed) return;
    stopTaskTimer(row, false); //? หยุด interval ก่อน remove เพื่อป้องกัน memory leak
    row.remove();
    reindexTasks(); //? ทำการ Re-index เลขข้อหลังจากลบออก
    calcAndUpdateProgress(); //? งานลดลงทำให้สัดส่วน % เปลี่ยน — คำนวณใหม่ทันที

    //todo เพิ่มการ Auto-save ทันทีหลังลบ เพื่อให้ข้อมูลใน DB ตรงกับหน้าจอ
    if (currentReportId && currentReportExists) autoSaveTasks();
  });
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
      
      let files = [];
      let links = [];
      try {
        if(row.hasAttribute('data-files')) files = JSON.parse(row.getAttribute('data-files'));
        if(row.hasAttribute('data-links')) links = JSON.parse(row.getAttribute('data-links'));
      } catch(e) {}

      tasks.push({
        id: idx + 1,
        title,
        task_type: row.querySelector('.task-type-select').value,
        status,
        description: row.getAttribute('data-desc') || '',
        from_plan: row.dataset.fromPlan === 'true',
        files,
        links,
        started_at: row.dataset.startedAt || null,
        elapsed_seconds: row.dataset.elapsed != null ? parseInt(row.dataset.elapsed, 10) : null
      });
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
  r.innerHTML = `
    <div class="tnum"></div>
    <div class="task-body">
      <input type="text" placeholder="ระบุงานที่ทำ..." style="margin-bottom:8px"/>
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
        <select class="task-type-select" style="width:auto;font-size:11px;padding:3px 8px;height:26px;border-radius:12px;background:#f8fafc">
          <option value="งานประจำ" selected>งานประจำ</option>
          <option value="งานที่รับมอบหมาย">งานที่รับมอบหมาย</option>
        </select>
        <div class="spills" style="margin:0"><span class="sp sp-done">✓ เสร็จแล้ว</span><span class="sp sp-prog">⋯ กำลังดำเนินการ</span><span class="sp sp-pend">◯ ยังไม่เริ่ม</span></div>
      </div>
      <span class="task-timer">⏱ 00:00:00</span>
      <button class="btn-desc" onclick="openDescModal(this)"><span class="icon">📝</span> คำอธิบาย</button>
      <button class="btn-desc btn-attach" onclick="openAttachModal(this)">📎 ไฟล์/ลิงก์</button>
    </div>
    <button class="btn-del-task" onclick="deleteTask(this)" title="ลบงาน"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`;
  document.getElementById('e-tasks').appendChild(r);

  //? ตั้งสถานะเริ่มต้นเป็น "กำลังดำเนินการ" — timer จะเริ่มเมื่อพิมพ์ชื่องาน (จัดการใน setupTaskStatusHandlers)
  setupTaskStatusHandlers(r);
  r.querySelector('.sp-prog').classList.add('on');
  
  reindexTasks(); //? รันใหม่เพื่อให้เลขข้อเรียงลำดับถูก
  calcAndUpdateProgress(); //? งานใหม่เป็น pend ทำให้ % ลด — คำนวณใหม่ทันที

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
      
      let files = [];
      let links = [];
      try {
        if(row.hasAttribute('data-files')) files = JSON.parse(row.getAttribute('data-files'));
        if(row.hasAttribute('data-links')) links = JSON.parse(row.getAttribute('data-links'));
      } catch(e) {}

      //? เพิ่มลงในรายการงานย่อย
      reportData.tasks.push({
        id: idx+1,
        title,
        task_type: row.querySelector('.task-type-select').value,
        status,
        description: row.getAttribute('data-desc') || '', //? รายละเอียดที่เก็บซ่อนไว้ใน Attribute
        from_plan: row.dataset.fromPlan === 'true',       //? งานจากแผน: ชื่อจะถูกล็อกเมื่อโหลดซ้ำ
        files,
        links,
        started_at: row.dataset.startedAt || null,
        elapsed_seconds: row.dataset.elapsed != null ? parseInt(row.dataset.elapsed, 10) : null
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

//? แสดงหน้าแผนงานเชิงพัฒนา (ซ่อนฟอร์มรายงานปัจจุบัน)
function showPlanView() {
  document.getElementById('e-main').style.display = 'none';
  document.getElementById('e-plan-view').style.display = '';
  planWeekStart = getMondayOfWeek(getTodayStr());
  loadPlanForWeek(planWeekStart);
}

//? ซ่อนหน้าแผนงานเชิงพัฒนา กลับไปหน้าฟอร์มรายงาน
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

//? ดึงแผนงานเชิงพัฒนาจาก API แล้ว render
async function loadPlanForWeek(weekStart) {
  document.getElementById('plan-week-label').textContent = formatPlanWeekLabel(weekStart);
  const container = document.getElementById('plan-days-container');
  container.innerHTML = '<div class="ld-wrap"><div class="ld-spin"></div><span class="ld-dots">กำลังโหลด</span></div>';
  try {
    const res = await fetch(`/api/plans?week=${weekStart}`);
    _planData = res.ok ? await res.json() : { tasks: [] };
  } catch(e) {
    _planData = { tasks: [] };
  }
  renderPlanTasks(_planData, weekStart);
}

//? Trash SVG icon สำหรับปุ่มลบ
const _trashSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='3 6 5 6 21 6'/><path d='M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'/><path d='M10 11v6'/><path d='M14 11v6'/><path d='M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'/></svg>`;

//? ชื่อวัน (สั้น) สำหรับ day-selector buttons
const _dayShort = ['จ','อ','พ','พฤ','ศ','ส'];

//? สร้าง HTML ของ day-selector buttons สำหรับงานหนึ่ง
function _buildDaySelectorHtml(weekDates, activeDays, locked) {
  return weekDates.map((ds, i) => {
    const d = new Date(ds + 'T00:00:00');
    const isActive = activeDays.includes(ds);
    const activeClass = isActive ? ' pdb-active' : '';
    const disabledAttr = locked ? ' disabled' : '';
    const label = `${_dayShort[i]}<br><span style="font-size:9px">${d.getDate()}</span>`;
    return `<button type="button" class="plan-day-btn${activeClass}" data-date="${ds}"${disabledAttr} onclick="togglePlanDay(this)">${label}</button>`;
  }).join('');
}

//? Toggle การเลือก/ยกเลิก วันใน day-selector
function togglePlanDay(btn) {
  btn.classList.toggle('pdb-active');
}

//? วาดหน้าแผนงานเชิงพัฒนา — flat task list พร้อม day-selector
function renderPlanTasks(planData, weekStart) {
  const container = document.getElementById('plan-days-container');
  const tasks = planData.tasks || [];
  const weekDates = getWeekDates(weekStart);

  container.innerHTML = '';

  //? render task cards
  const taskList = document.createElement('div');
  taskList.id = 'plan-task-list';
  tasks.forEach((t, i) => {
    taskList.appendChild(_buildPlanTaskCard(t, i, weekDates));
  });
  container.appendChild(taskList);

  //? ปุ่ม + เพิ่มงาน (global)
  const addBtn = document.createElement('button');
  addBtn.className = 'nav-btn nav-btn-blue';
  addBtn.style.cssText = 'margin-top:10px;font-size:12px';
  addBtn.textContent = '+ เพิ่มงาน';
  addBtn.onclick = () => addPlanTaskRow(weekDates);
  container.appendChild(addBtn);
}

//? สร้าง DOM element ของ task card สำหรับหนึ่งงาน
function _buildPlanTaskCard(t, idx, weekDates) {
  const isApproved = t.approved === true;
  const isRejected = !t.approved && t.approved_by;
  const approvalBadge = isApproved
    ? `<span class="plan-task-approved yes">✓ อนุมัติแล้ว</span>`
    : isRejected
    ? `<span class="plan-task-approved no">✗ ไม่อนุมัติ</span>`
    : `<span class="plan-task-approved pending">⋯ รอการอนุมัติ</span>`;
  const locked = isApproved;
  const _lk = locked ? 'readonly' : '';
  const _ls = locked ? ';background:#F0F8FF;cursor:default' : '';
  const activeDays = Array.isArray(t.active_days) ? t.active_days : [];

  const card = document.createElement('div');
  card.className = 'plan-task-card';
  card.dataset.taskId = t.id || '';
  if (locked) card.dataset.approved = '1';

  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span class="plan-task-num">${idx + 1}</span>
      ${approvalBadge}
      <button onclick="removePlanTaskRow(this)" title="ลบ"
        style="background:none;border:none;cursor:pointer;color:#e74c3c;padding:4px;margin-left:auto${locked ? ';opacity:0.3;pointer-events:none' : ''}"
        ${locked ? 'disabled' : ''}>${_trashSvg}</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <div>
        <label class="plan-field-lbl">ชื่องาน <span style="color:#e74c3c">*</span></label>
        <input type="text" class="inp plan-task-title" value="${escHtml(t.title)}" placeholder="ชื่องาน..." style="font-size:13px${_ls}" ${_lk}>
      </div>
      <div>
        <label class="plan-field-lbl">วันที่ทำงาน <span style="color:#e74c3c">*</span></label>
        <div class="plan-day-selector">${_buildDaySelectorHtml(weekDates, activeDays, locked)}</div>
      </div>
      <div>
        <label class="plan-field-lbl">เป้าหมาย <span style="color:#e74c3c">*</span></label>
        <input type="text" class="inp plan-task-goal" value="${escHtml(t.goal||'')}" placeholder="เป้าหมาย..." style="font-size:12px${_ls}" ${_lk}>
      </div>
      <div>
        <label class="plan-field-lbl">ผลผลิต <span style="color:#e74c3c">*</span></label>
        <input type="text" class="inp plan-task-output" value="${escHtml(t.output||'')}" placeholder="ผลผลิต..." style="font-size:12px${_ls}" ${_lk}>
      </div>
      <div class="plan-kpi-row">
        <div>
          <label class="plan-field-lbl">ตัวชี้วัด (KPI) <span style="color:#e74c3c">*</span></label>
          <input type="text" class="inp plan-task-kpi-name" value="${escHtml(t.kpi_name||'')}" placeholder="ตัวชี้วัด (KPI)..." style="font-size:12px${_ls}" ${_lk}>
        </div>
        <div>
          <label class="plan-field-lbl">ค่าเป้าหมาย <span style="color:#e74c3c">*</span></label>
          <input type="text" class="inp plan-task-kpi-target" value="${escHtml(t.kpi_target||'')}" placeholder="ค่าเป้าหมาย..." style="font-size:12px${_ls}" ${_lk}>
        </div>
      </div>
      <div>
        <label class="plan-field-lbl">คำอธิบายเพิ่มเติม</label>
        <input type="text" class="inp plan-task-desc" value="${escHtml(t.description||'')}" placeholder="คำอธิบายเพิ่มเติม (ไม่บังคับ)..." style="font-size:12px${_ls}" ${_lk}>
      </div>
    </div>`;
  return card;
}

//? เพิ่ม task card ใหม่ (ระดับสัปดาห์)
function addPlanTaskRow(weekDates) {
  //? รองรับการเรียกจากปุ่มเก่าที่ส่ง weekDates หรือไม่ส่ง
  const dates = weekDates || getWeekDates(planWeekStart);
  const list  = document.getElementById('plan-task-list');
  const count = list ? list.querySelectorAll('.plan-task-card').length : 0;
  const newTask = { id: Date.now(), title: '', active_days: [], goal: '', output: '',
                    kpi_name: '', kpi_target: '', description: '', approved: false, approved_by: '', approved_at: '' };
  const card = _buildPlanTaskCard(newTask, count, dates);
  if (list) {
    list.appendChild(card);
    card.querySelector('.plan-task-title').focus();
    //? re-index task numbers
    _reindexPlanCards();
  }
}

//? ลบ task card แล้ว re-index
function removePlanTaskRow(btn) {
  const card = btn.closest('.plan-task-card');
  if (card.dataset.approved === '1') {
    Swal.fire({ icon: 'warning', title: 'ไม่สามารถลบได้',
                text: 'งานนี้ได้รับการอนุมัติแล้ว ไม่สามารถแก้ไขหรือลบได้',
                confirmButtonColor: '#1059A3' });
    return;
  }
  card.remove();
  _reindexPlanCards();
}

//? re-index เลขงาน (1, 2, 3…) หลังเพิ่ม/ลบ
function _reindexPlanCards() {
  const list = document.getElementById('plan-task-list');
  if (!list) return;
  list.querySelectorAll('.plan-task-card').forEach((c, i) => {
    const numEl = c.querySelector('.plan-task-num');
    if (numEl) numEl.textContent = i + 1;
  });
}

//? บันทึกแผนงานเชิงพัฒนา → POST /api/plans พร้อม Validation ฟิลด์บังคับ
async function savePlan() {
  const btn = document.getElementById('btn-save-plan');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'กำลังตรวจสอบ...';

  const tasks = [];
  let validationError = null; //! short-circuit เมื่อพบช่องว่างที่บังคับกรอก
  let nextNewId = Date.now();

  const list = document.getElementById('plan-task-list');
  if (list) {
    list.querySelectorAll('.plan-task-card').forEach(card => {
      if (validationError) return;
      const title = card.querySelector('.plan-task-title').value.trim();
      if (!title) return; // ข้าม card ที่ไม่มีชื่องาน

      //? active_days: เก็บ date ของปุ่มวันที่ถูก toggle (class pdb-active)
      const active_days = [...card.querySelectorAll('.plan-day-btn.pdb-active')].map(b => b.dataset.date);

      //? ตรวจสอบฟิลด์บังคับ
      const goal       = card.querySelector('.plan-task-goal').value.trim();
      const output     = card.querySelector('.plan-task-output').value.trim();
      const kpi_name   = card.querySelector('.plan-task-kpi-name').value.trim();
      const kpi_target = card.querySelector('.plan-task-kpi-target').value.trim();

      if (!active_days.length) { validationError = { card, sel: '.plan-day-selector', label: 'วันที่ทำงาน' }; return; }
      if (!goal)       { validationError = { card, sel: '.plan-task-goal',       label: 'เป้าหมาย' };       return; }
      if (!output)     { validationError = { card, sel: '.plan-task-output',     label: 'ผลผลิต' };         return; }
      if (!kpi_name)   { validationError = { card, sel: '.plan-task-kpi-name',   label: 'ตัวชี้วัด (KPI)' }; return; }
      if (!kpi_target) { validationError = { card, sel: '.plan-task-kpi-target', label: 'ค่าเป้าหมาย' };    return; }

      const storedId = parseInt(card.dataset.taskId, 10);
      const id = isNaN(storedId) ? nextNewId++ : storedId;
      tasks.push({ id, title, active_days, goal, output, kpi_name, kpi_target,
                   description: card.querySelector('.plan-task-desc').value.trim() });
    });
  }

  //! แสดง error และหยุดการบันทึกถ้ามีฟิลด์บังคับที่ยังว่างอยู่
  if (validationError) {
    btn.disabled = false;
    btn.textContent = origText;
    //? สำหรับ day-selector: highlight ทั้ง group แทนการ focus input เดี่ยว
    if (validationError.sel === '.plan-day-selector') {
      const sel = validationError.card.querySelector('.plan-day-selector');
      if (sel) { sel.style.outline = '2px solid #e74c3c'; sel.style.borderRadius = '6px';
                 setTimeout(() => { sel.style.outline = ''; }, 2500); }
    } else {
      const offending = validationError.card.querySelector(validationError.sel);
      if (offending) { offending.focus(); offending.style.borderColor = '#e74c3c';
                       offending.addEventListener('input', () => { offending.style.borderColor = ''; }, { once: true }); }
    }
    Swal.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูลให้ครบ',
                text: `กรุณาระบุ "${validationError.label}" ให้ครบก่อนบันทึก`,
                confirmButtonColor: '#1059A3' });
    return;
  }

  btn.textContent = 'กำลังบันทึก...';
  try {
    const res = await fetch('/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start: planWeekStart, tasks })
    });
    if (res.ok) {
      _planData = await res.json();
      renderPlanTasks(_planData, planWeekStart);
      Swal.fire({ icon: 'success', title: 'บันทึกแล้ว!', text: 'แผนงานเชิงพัฒนาสัปดาห์นี้ถูกบันทึกเรียบร้อย', confirmButtonColor: '#2E7D32', timer: 2000, showConfirmButton: false });
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

//? เริ่มทำงานเมื่อโหลดโค้ดเสร็จ (ส่วนสุดท้ายของแอป)
/* ── การแนบไฟล์และลิงก์ (Attachments) ── */
let currentAttachRow = null;
let tempFiles = [];
let tempLinks = [];
let newlyUploadedUrls = [];

//? ฟังก์ชันเปิด Modal สำหรับแนบสื่อในแต่ละงาน
window.openAttachModal = function(btn) {
  currentAttachRow = btn.closest('.task-row');
  
  // นำข้อมูลออกจาก Row (ถ้ามี) มาพักไว้ในตัวแปรชั่วคราว
  tempFiles = [];
  tempLinks = [];
  newlyUploadedUrls = [];
  try {
    if(currentAttachRow.hasAttribute('data-files')) tempFiles = JSON.parse(currentAttachRow.getAttribute('data-files'));
    if(currentAttachRow.hasAttribute('data-links')) tempLinks = JSON.parse(currentAttachRow.getAttribute('data-links'));
  } catch(e) {}
  
  // วาดข้อมูลลงบน Modal
  renderAttachFiles();
  renderAttachLinks();

  // จัดการมุมมอง History Mode (ห้ามอัปโหลดเพิ่ม)
  const isHistory = typeof isHistoryMode !== 'undefined' ? isHistoryMode : false;
  document.getElementById('attach-file-input').disabled = isHistory;
  document.getElementById('btn-upload-file').disabled = isHistory;
  document.getElementById('attach-link-title').disabled = isHistory;
  document.getElementById('attach-link-url').disabled = isHistory;
  
  const saveBtn = document.querySelector('#attach-modal .btn-save[onclick="saveAttachModal()"]');
  if (saveBtn) saveBtn.style.display = isHistory ? 'none' : '';
  
  document.getElementById('attach-modal').classList.add('on');
};

window.closeAttachModal = async function(saved = false) {
  if (!saved && newlyUploadedUrls.length > 0) {
    const toDelete = newlyUploadedUrls.filter(url => tempFiles.some(f => f.url === url));
    for (const url of toDelete) {
      const filename = url.split('/').pop();
      try { await fetch(`/api/upload/${filename}`, { method: 'DELETE' }); }
      catch(e) { console.warn('Orphan cleanup failed:', filename, e); }
    }
  }
  newlyUploadedUrls = [];
  document.getElementById('attach-modal').classList.remove('on');
  currentAttachRow = null;
};

//? อัปเดตรายการไฟล์ใน UI ของ Modal
window.renderAttachFiles = function() {
  const list = document.getElementById('attach-files-list');
  if(!list) return;
  list.innerHTML = '';
  if(tempFiles.length === 0) {
    list.innerHTML = '<span style="color:var(--color-text-secondary);font-size:12px;">ไม่มีไฟล์แนบ</span>';
    return;
  }
  
  tempFiles.forEach((f, idx) => {
    const isHistory = typeof isHistoryMode !== 'undefined' ? isHistoryMode : false;
    const hideTrash = isHistory ? 'display:none;' : '';
    const isImage = /\.(jpg|jpeg|png|webp)$/i.test(f.url);
    const preview = isImage
      ? `<img src="${f.url}" onclick="openImageLightbox('${f.url}')" style="height:32px;width:32px;object-fit:cover;border-radius:3px;margin-right:6px;vertical-align:middle;cursor:zoom-in;" />`
      : '📄 ';
    const nameEl = isImage
      ? `<span onclick="openImageLightbox('${f.url}')" style="cursor:zoom-in;">${f.name}</span>`
      : `<a href="${f.url}" target="_blank" style="color:var(--color-text-primary);text-decoration:none;">${f.name}</a>`;
    list.innerHTML += `
      <div style="display:flex;align-items:center;justify-content:space-between;background:var(--color-bg-primary);padding:6px 10px;border-radius:4px;border:1px solid var(--color-border-tertiary);font-size:12px;margin-bottom:4px;">
        <div style="display:flex;align-items:center;">${preview}${nameEl}</div>
        <button onclick="deleteAttachFile(${idx})" style="border:none;background:none;color:#E24B4A;cursor:pointer;${hideTrash}">🗑️</button>
      </div>
    `;
  });
};

//? อัปเดตรายการลิงก์ใน UI ของ Modal
window.renderAttachLinks = function() {
  const list = document.getElementById('attach-links-list');
  if(!list) return;
  list.innerHTML = '';
  if(tempLinks.length === 0) {
    list.innerHTML = '<span style="color:var(--color-text-secondary);font-size:12px;">ไม่มีลิงก์แนบ</span>';
    return;
  }
  
  tempLinks.forEach((l, idx) => {
    const isHistory = typeof isHistoryMode !== 'undefined' ? isHistoryMode : false;
    const hideTrash = isHistory ? 'display:none;' : '';
    list.innerHTML += `
      <div style="display:flex;align-items:center;justify-content:space-between;background:var(--color-bg-primary);padding:6px 10px;border-radius:4px;border:1px solid var(--color-border-tertiary);font-size:12px;margin-bottom:4px;">
        <a href="${l.url}" target="_blank" style="color:#1059A3;text-decoration:none;max-width:350px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🔗 ${l.title || l.url}</a>
        <button onclick="deleteAttachLink(${idx})" style="border:none;background:none;color:#E24B4A;cursor:pointer;${hideTrash}">🗑️</button>
      </div>
    `;
  });
};

//? ฟังก์ชันลบลิงก์ (UI)
window.deleteAttachLink = function(idx) {
  const l = tempLinks[idx];
  if(!l) return;
  Swal.fire({
    title: 'ยืนยันการลบลิงก์?',
    text: 'คุณต้องการลบลิงก์นี้ใช่หรือไม่?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#E24B4A',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'ลบลิงก์',
    cancelButtonText: 'ยกเลิก'
  }).then((result) => {
    if (result.isConfirmed) {
      tempLinks.splice(idx, 1);
      renderAttachLinks();
    }
  });
};

//? ฟังก์ชันลบไฟล์ทั้งจาก UI และ Server
window.deleteAttachFile = async function(idx) {
  const f = tempFiles[idx];
  if (!f) return;
  
  Swal.fire({
    title: 'ยืนยันการลบไฟล์?',
    text: `คุณต้องการลบไฟล์ "${f.name}" ใช่หรือไม่?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#E24B4A',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'ลบไฟล์',
    cancelButtonText: 'ยกเลิก'
  }).then(async (result) => {
    if (result.isConfirmed) {
      // ดึงชื่อไฟล์จาก URL
      const filename = f.url.split('/').pop();
      try {
        await fetch(`/api/upload/${filename}`, { method: "DELETE" });
      } catch(e) {
        console.warn("Could not delete file from server:", e);
      }
      
      // ลบจาก UI
      tempFiles.splice(idx, 1);
      renderAttachFiles();
    }
  });
};

//? ฟังก์ชันอัปโหลดไฟล์ PDF
window.uploadPdfFile = async function() {
  const isHistory = typeof isHistoryMode !== 'undefined' ? isHistoryMode : false;
  if (isHistory) return;
  
  if (tempFiles.length >= 5) {
    Swal.fire({icon:'warning', title:'จำกัดสูงสุด', text:'สามารถแนบไฟล์ได้ 5 ไฟล์ต่องานเท่านั้น', confirmButtonColor:'#1059A3'});
    return;
  }
  
  const input = document.getElementById('attach-file-input');
  if (!input.files || input.files.length === 0) {
    Swal.fire({icon:'info', title:'กรุณาเลือกไฟล์', confirmButtonColor:'#1059A3'});
    return;
  }
  
  const file = input.files[0];
  if(file.size > 10 * 1024 * 1024) {
    Swal.fire({icon:'warning', title:'ไฟล์ใหญ่เกินขนาด', text:'จำกัดขนาดไม่เกิน 10MB', confirmButtonColor:'#1059A3'});
    return;
  }
  
  const btn = document.getElementById('btn-upload-file');
  btn.disabled = true;
  btn.textContent = "กำลังโหลด...";
  
  const formData = new FormData();
  formData.append("file", file);
  
  try {
    const res = await fetch('/api/upload', {
      method: "POST",
      body: formData
    });
    if(res.ok) {
      const data = await res.json();
      tempFiles.push({name: data.name, url: data.url});
      newlyUploadedUrls.push(data.url);
      renderAttachFiles();
      input.value = ""; // เคลียร์ฟอร์ม
    } else {
      const err = await res.json();
      Swal.fire({icon:'error', title:'อัปโหลดไม่สำเร็จ', text:err.detail, confirmButtonColor:'#1059A3'});
    }
  } catch(e) {
    Swal.fire({icon:'error', title:'การเชื่อมต่อล้มเหลว', text:e.message, confirmButtonColor:'#1059A3'});
  }
  btn.disabled = false;
  btn.textContent = "อัปโหลด";
};

//? ฟังก์ชันเพิ่มลิงก์
window.addLinkItem = function() {
  const isHistory = typeof isHistoryMode !== 'undefined' ? isHistoryMode : false;
  if (isHistory) return;
  
  if (tempLinks.length >= 5) {
    Swal.fire({icon:'warning', title:'จำกัดสูงสุด', text:'สามารถแนบลิงก์ได้ 5 ลิงก์ต่องานเท่านั้น', confirmButtonColor:'#1059A3'});
    return;
  }
  const tInput = document.getElementById('attach-link-title');
  const uInput = document.getElementById('attach-link-url');
  let title = tInput.value.trim();
  let url = uInput.value.trim();
  if(!url) return;
  if(!url.startsWith('http')) url = 'http://' + url;
  
  tempLinks.push({title: title || url, url});
  renderAttachLinks();
  tInput.value = "";
  uInput.value = "";
};

//? ยืนยันการแนบสื่อกลับเข้าสู่หน้าจอรายงาน
window.saveAttachModal = function() {
  if (typeof isHistoryMode !== 'undefined' && isHistoryMode) { closeAttachModal(); return; }
  
  if (currentAttachRow) {
    // เซฟเป็น stringified payload
    if(tempFiles.length > 0) currentAttachRow.setAttribute('data-files', JSON.stringify(tempFiles));
    else currentAttachRow.removeAttribute('data-files');
    
    if(tempLinks.length > 0) currentAttachRow.setAttribute('data-links', JSON.stringify(tempLinks));
    else currentAttachRow.removeAttribute('data-links');
    
    // อัปเดตการแสดงผลปุ่มให้รู้ว่ามีไฟล์
    const btnAttach = currentAttachRow.querySelector('.btn-attach');
    if (btnAttach) {
      if (tempFiles.length > 0 || tempLinks.length > 0) btnAttach.classList.add('has-data');
      else btnAttach.classList.remove('has-data');
    }
  }
  closeAttachModal(true);

  // เซฟเข้า DB เผื่อรีเฟรชหน้าแล้วหาย
  if (typeof currentReportId !== 'undefined' && typeof currentReportExists !== 'undefined') {
    if (currentReportId && currentReportExists) autoSaveTasks();
  }
};


/* ── Image Lightbox ── */
window.openImageLightbox = function(url) {
  document.getElementById('img-lightbox-src').src = url;
  document.getElementById('img-lightbox').style.display = 'flex';
};
window.closeImageLightbox = function() {
  document.getElementById('img-lightbox').style.display = 'none';
  document.getElementById('img-lightbox-src').src = '';
};

/* ══════════════════════════════════════════════════════
   ระบบคำนวณประหยัดค่าน้ำมัน (Fuel Savings)
   ══════════════════════════════════════════════════════ */

//? state ของ week ปัจจุบันในหน้าพลังงาน (Monday YYYY-MM-DD)
let _fuelWeekMonday = null;

//? คำนวณวันจันทร์ของสัปดาห์ที่มี dateStr อยู่
function _fuelGetMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

//? แปลง monday string เป็น label "DD MMM – DD MMM พ.ศ."
function _fuelWeekLabel(mondayStr) {
  const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const mon = new Date(mondayStr + 'T00:00:00');
  const sun = new Date(mondayStr + 'T00:00:00');
  sun.setDate(sun.getDate() + 6);
  const fmt = d => `${d.getDate()} ${TH_MONTHS[d.getMonth()]}`;
  return `${fmt(mon)} – ${fmt(sun)} ${sun.getFullYear() + 543}`;
}

//? สลับ tab รายอาทิตย์ / รายเดือน
function setFuelTab(tab) {
  const isWeek = tab === 'week';
  document.getElementById('fuel-calc-week').style.display = isWeek ? '' : 'none';
  document.getElementById('fuel-calc-month').style.display = isWeek ? 'none' : '';
  document.getElementById('fuel-tab-week').className = isWeek ? 'nav-btn nav-btn-blue active' : 'nav-btn nav-btn-back';
  document.getElementById('fuel-tab-month').className = isWeek ? 'nav-btn nav-btn-back' : 'nav-btn nav-btn-blue active';
  //? ซ่อนผลลัพธ์เดิมเมื่อสลับ tab
  document.getElementById('fuel-results').style.display = 'none';
}

//? เลื่อนอาทิตย์ (delta = -1 ก่อนหน้า, +1 ถัดไป)
function navigateFuelWeek(delta) {
  const d = new Date(_fuelWeekMonday + 'T00:00:00');
  d.setDate(d.getDate() + delta * 7);
  _fuelWeekMonday = d.toISOString().split('T')[0];
  document.getElementById('fuel-week-label').textContent = _fuelWeekLabel(_fuelWeekMonday);
  document.getElementById('fuel-results').style.display = 'none';
}

//? แสดงหน้าจอคำนวณค่าน้ำมัน ซ่อน e-main และ e-plan-view
function showFuelView() {
  document.getElementById('e-main').style.display = 'none';
  document.getElementById('e-plan-view').style.display = 'none';
  document.getElementById('e-fuel').style.display = '';
  // ตั้งค่า week เริ่มต้นเป็นอาทิตย์ปัจจุบัน
  const today = new Date().toISOString().split('T')[0];
  _fuelWeekMonday = _fuelGetMonday(today);
  document.getElementById('fuel-week-label').textContent = _fuelWeekLabel(_fuelWeekMonday);
  // ตั้งค่า default month เป็นเดือนปัจจุบัน
  const picker = document.getElementById('fuel-month');
  if (picker && !picker.value) {
    const n = new Date();
    picker.value = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  }
  loadFuelSettings();
}

//? กลับไปหน้ารายงานประจำวัน
function hideFuelView() {
  document.getElementById('e-fuel').style.display = 'none';
  document.getElementById('e-main').style.display = '';
}

//? โหลดการตั้งค่าน้ำมันจาก API แล้วเติมลงในฟอร์ม + แสดงประวัติราคา
async function loadFuelSettings() {
  try {
    const res = await fetch('/api/fuel/settings');
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('fuel-distance').value = data.distance_km || '';
    document.getElementById('fuel-efficiency').value = data.fuel_efficiency || '';
    document.getElementById('fuel-price').value = data.fuel_price || '';
    document.getElementById('fuel-toll').value = data.toll_parking || '';
    //? ตั้ง default วันที่มีผล = วันนี้ (ถ้ายังไม่ได้เลือก)
    const datePicker = document.getElementById('fuel-price-date');
    if (datePicker && !datePicker.value) {
      datePicker.value = new Date().toISOString().split('T')[0];
    }
    //? แสดงประวัติราคาน้ำมัน
    renderPriceHistory(data.price_history || []);
  } catch (e) {
    console.error('loadFuelSettings error:', e);
  }
}

//? แสดงประวัติราคาน้ำมันในรูปแบบ timeline
function renderPriceHistory(history) {
  const card = document.getElementById('fuel-history-card');
  const list = document.getElementById('fuel-history-list');
  if (!history || history.length === 0) {
    card.style.display = 'none';
    return;
  }
  //? เรียงจากใหม่ → เก่า เพื่อแสดง
  const sorted = [...history].sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const fmtDate = str => {
    const d = new Date(str + 'T00:00:00');
    return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
  };
  list.innerHTML = sorted.map((e, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0;${i < sorted.length - 1 ? 'border-bottom:1px solid var(--color-border-primary)' : ''}">
      <span style="font-size:11px;color:var(--color-text-secondary);min-width:110px">${fmtDate(e.effective_from)}</span>
      <span style="font-size:13px;font-weight:600;color:var(--color-text-primary)">${parseFloat(e.fuel_price).toFixed(2)} บาท/ลิตร</span>
      ${i === 0 ? '<span style="font-size:10px;background:#1D9E75;color:#fff;border-radius:6px;padding:1px 6px;font-weight:600">ล่าสุด</span>' : ''}
    </div>`).join('');
  card.style.display = '';
}

//? บันทึกการตั้งค่าน้ำมัน พร้อม validate ก่อนส่ง
async function saveFuelSettings() {
  const distance = parseFloat(document.getElementById('fuel-distance').value);
  const efficiency = parseFloat(document.getElementById('fuel-efficiency').value);
  const price = parseFloat(document.getElementById('fuel-price').value);
  const toll = parseFloat(document.getElementById('fuel-toll').value) || 0;

  if (!distance || distance <= 0) {
    Swal.fire({ icon: 'warning', title: 'กรุณากรอกระยะทาง', confirmButtonColor: '#1059A3' });
    return;
  }
  if (!efficiency || efficiency <= 0) {
    Swal.fire({ icon: 'warning', title: 'กรุณากรอกอัตราสิ้นเปลืองน้ำมัน', confirmButtonColor: '#1059A3' });
    return;
  }
  if (!price || price <= 0) {
    Swal.fire({ icon: 'warning', title: 'กรุณากรอกราคาน้ำมัน', confirmButtonColor: '#1059A3' });
    return;
  }

  const btn = document.getElementById('btn-fuel-save');
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';

  try {
    const effectiveFrom = document.getElementById('fuel-price-date').value
      || new Date().toISOString().split('T')[0];
    const res = await fetch('/api/fuel/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ distance_km: distance, fuel_efficiency: efficiency, fuel_price: price, toll_parking: toll, effective_from: effectiveFrom })
    });
    if (res.ok) {
      await loadFuelSettings();  //? รีโหลดเพื่ออัปเดตประวัติราคาทันที
      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: `ราคาน้ำมัน ${price.toFixed(2)} บาท/ลิตร มีผลตั้งแต่ ${effectiveFrom}`, confirmButtonColor: '#1D9E75' });
    } else {
      const err = await res.json().catch(() => ({}));
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.detail || '', confirmButtonColor: '#1059A3' });
    }
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้', confirmButtonColor: '#1059A3' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'บันทึกการตั้งค่า';
  }
}

//? คำนวณและแสดงผลประหยัดค่าน้ำมันประจำเดือน
async function loadFuelSavings() {
  const month = document.getElementById('fuel-month').value;
  if (!month) {
    Swal.fire({ icon: 'warning', title: 'กรุณาเลือกเดือน', confirmButtonColor: '#1059A3' });
    return;
  }

  //? แสดง loading state บนปุ่มและ results card ระหว่างรอ API
  const btn = document.querySelector('#e-fuel .btn-save[onclick="loadFuelSavings()"]');
  const resultsEl = document.getElementById('fuel-results');
  const bodyEl = document.getElementById('fuel-results-body');
  if (btn) { btn.disabled = true; btn.textContent = 'กำลังคำนวณ…'; }
  //? แสดงการ์ด และ replace body ด้วย spinner (heading ยังคงอยู่)
  resultsEl.style.display = '';
  bodyEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:18px 0;color:var(--color-text-secondary);font-size:14px">
      <span class="ld-spin" style="width:18px;height:18px;border-width:2.5px"></span>
      กำลังนับวัน WFH และคำนวณ…
    </div>`;

  try {
    const res = await fetch(`/api/fuel/savings?month=${encodeURIComponent(month)}`);
    if (res.status === 404) {
      resultsEl.style.display = 'none';
      Swal.fire({ icon: 'info', title: 'กรุณาบันทึกการตั้งค่าก่อน', text: 'กรอกข้อมูลการเดินทางและกดบันทึกการตั้งค่า', confirmButtonColor: '#1059A3' });
      return;
    }
    if (!res.ok) throw new Error();
    const data = await res.json();

    //? เติมผลลัพธ์กลับเข้า body wrapper (heading ยังคงอยู่ไม่ถูกแทนที่)
    bodyEl.innerHTML = `
      <div class="stat-grid">
        <div class="stat"><div class="sn" id="fuel-r-daily-fuel">${data.daily_fuel_cost.toFixed(2)}</div><div class="sl">ค่าน้ำมันต่อวัน (บาท)</div></div>
        <div class="stat"><div class="sn sg" id="fuel-r-daily-total">${data.daily_total_cost.toFixed(2)}</div><div class="sl">ค่าใช้จ่ายรวมต่อวัน (บาท)</div></div>
        <div class="stat"><div class="sn sa" id="fuel-r-wfh-days">${data.wfh_days}</div><div class="sl">วัน WFH ในเดือนนี้</div></div>
        <div class="stat"><div class="sn sr" id="fuel-r-monthly">${data.monthly_savings.toFixed(2)}</div><div class="sl">ประหยัดรวม/เดือน (บาท)</div></div>
      </div>
      <div id="fuel-r-note" style="font-size:11px;color:var(--color-text-secondary);margin-top:.5rem;text-align:right">
        คำนวณจากรายงาน WFH จำนวน ${data.wfh_days} วัน ในเดือน ${month}
      </div>`;
  } catch (e) {
    resultsEl.style.display = 'none';
    Swal.fire({ icon: 'error', title: 'ไม่สามารถคำนวณได้', confirmButtonColor: '#1059A3' });
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'คำนวณ'; }
  }
}

//? คำนวณและแสดงผลประหยัดค่าน้ำมันรายอาทิตย์ (Weekly)
async function loadFuelSavingsWeekly() {
  if (!_fuelWeekMonday) return;

  const btn = document.querySelector('#fuel-calc-week .btn-save');
  const resultsEl = document.getElementById('fuel-results');
  const bodyEl = document.getElementById('fuel-results-body');
  if (btn) { btn.disabled = true; btn.textContent = 'กำลังคำนวณ…'; }
  resultsEl.style.display = '';
  bodyEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:18px 0;color:var(--color-text-secondary);font-size:14px">
      <span class="ld-spin" style="width:18px;height:18px;border-width:2.5px"></span>
      กำลังนับวัน WFH และคำนวณ…
    </div>`;

  try {
    const res = await fetch(`/api/fuel/savings/weekly?week=${encodeURIComponent(_fuelWeekMonday)}`);
    if (res.status === 404) {
      resultsEl.style.display = 'none';
      Swal.fire({ icon: 'info', title: 'กรุณาบันทึกการตั้งค่าก่อน', text: 'กรอกข้อมูลการเดินทางและกดบันทึกการตั้งค่า', confirmButtonColor: '#1059A3' });
      return;
    }
    if (!res.ok) throw new Error();
    const data = await res.json();
    bodyEl.innerHTML = `
      <div class="stat-grid">
        <div class="stat"><div class="sn" id="fuel-r-daily-fuel">${data.daily_fuel_cost.toFixed(2)}</div><div class="sl">ค่าน้ำมันต่อวัน (บาท)</div></div>
        <div class="stat"><div class="sn sg" id="fuel-r-daily-total">${data.daily_total_cost.toFixed(2)}</div><div class="sl">ค่าใช้จ่ายรวมต่อวัน (บาท)</div></div>
        <div class="stat"><div class="sn sa" id="fuel-r-wfh-days">${data.wfh_days}</div><div class="sl">วัน WFH ในอาทิตย์นี้</div></div>
        <div class="stat"><div class="sn sr" id="fuel-r-weekly">${data.weekly_savings.toFixed(2)}</div><div class="sl">ประหยัดรวม/อาทิตย์ (บาท)</div></div>
      </div>
      <div style="font-size:11px;color:var(--color-text-secondary);margin-top:.5rem;text-align:right">
        คำนวณจากรายงาน WFH จำนวน ${data.wfh_days} วัน ใน ${_fuelWeekLabel(data.week_start)}
      </div>`;
  } catch (e) {
    resultsEl.style.display = 'none';
    Swal.fire({ icon: 'error', title: 'ไม่สามารถคำนวณได้', confirmButtonColor: '#1059A3' });
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'คำนวณ'; }
  }
}

/* ── Export รายงานประจำวันเป็น Excel ── */
async function exportMyReport() {
  if (!currentReportId) return;
  const btn = document.getElementById('btn-export-excel');
  const origText = btn ? btn.innerHTML : '';
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="ld-spin" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px"></span>กำลังดาวน์โหลด...';
    }
    const res = await fetch(`/api/reports/${currentReportId}/export`);
    if (!res.ok) throw new Error('export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily_report_${currentReportId}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    if (btn) {
      btn.innerHTML = '✓ ดาวน์โหลดแล้ว';
      setTimeout(() => { btn.innerHTML = origText; btn.disabled = false; }, 2000);
    }
  } catch {
    Swal.fire({ icon: 'error', title: 'ไม่สามารถดาวน์โหลดได้', confirmButtonColor: '#1059A3' });
    if (btn) { btn.innerHTML = origText; btn.disabled = false; }
  }
}
