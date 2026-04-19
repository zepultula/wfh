//? ตรวจสอบสิทธิ์เบื้องต้นจาก LocalStorage เพื่อความรวดเร็วในการแสดงผล UI
const userLevel = parseInt(localStorage.getItem('user_level') || '0', 10);
const userRole = (localStorage.getItem('user_role') || '').toLowerCase();
//? ตรวจสอบว่าเป็น Super Admin หรือไม่ (Level > 0 หรือมี Role เป็น Admin)
const isSuperAdmin = userLevel > 0 || userRole.includes('admin') || userRole.includes('ผู้ดูแลระบบ');

//? หากไม่ใช่กลุ่มแอดมิน ให้ดีดกลับไปหน้าพนักงานทันที
if (!isSuperAdmin) {
  window.location.replace('/employee');
}

function formatSeconds(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

const thM=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const thD=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
let currentReportId = null; //? เก็บ ID รายงานที่กำลังเปิดดูรายละเอียด
let currentUser = null;     //? เก็บข้อมูลผู้ใช้ที่กำลัง Login อยู่ปัจจุบัน (สำหรับเรียกใช้ใน API)
let annEditId = null;       //? null = สร้างใหม่, string = แก้ไขประกาศที่มีอยู่
let _annsList = [];         //? cache รายการประกาศสำหรับ lookup ตอนเปิด edit modal
let reviewWeekStart = null; //? สัปดาห์ที่กำลังดูในหน้ารีวิวแผนงาน (YYYY-MM-DD ของวันจันทร์)
let detailTimerInterval = null; //? เก็บ interval ของตัวจับเวลาในหน้าละเอียด

//? ฟังก์ชันเริ่มต้น: ดึงข้อมูลตัวตนจาก API เพื่อยืนยันสิทธิ์และปรับรูปแบบเมนูตามระดับ Level
async function initUser() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) throw new Error('Unauth');
    currentUser = await res.json();
    
    //? แสดงอักษรย่อและข้อมูลส่วนตัวในแถบเมนู
    document.getElementById('nb-av').textContent = getInitials(currentUser.name);
    document.getElementById('nb-name').textContent = currentUser.name;
    document.getElementById('nb-role').textContent = currentUser.position || currentUser.role;

    //? อัปเดต Avatar และชื่อผู้ส่งในช่องคอมเมนต์ให้ตรงกับชื่อจริงของแอดมินที่ Login อยู่
    const cmtAv = document.getElementById('s-cmt-av');
    const cmtName = document.getElementById('s-cmt-name');
    if (cmtAv) cmtAv.textContent = getInitials(currentUser.name);
    if (cmtName) cmtName.textContent = `${currentUser.name} · คอมเมนต์ถึงพนักงาน`;

    //? จัดการการมองเห็นเมนูจัดการ (Management) ตามสิทธิ์
    //? Level 9 หรือ 'admin' จะเห็นเมนูจัดการผู้ใช้และสายบังคับบัญชา
    if (currentUser.level === 9 || currentUser.role.toLowerCase().includes('admin')) {
      const btn = document.getElementById('btn-users-mgmt');
      if (btn) btn.style.display = '';
      const btnEv = document.getElementById('btn-evals-mgmt');
      if (btnEv) btnEv.style.display = '';
    }
    //? เฉพาะกลุ่มหัวหน้างาน/ผู้บริหาร (Level 1 ขึ้นไป) จะเห็นเมนูสถิติ
    const btnSt = document.getElementById('btn-stats-mgmt');
    if (btnSt) btnSt.style.display = '';

    //? Super Admin เท่านั้นที่เห็นเมนูจัดการประกาศ
    const btnAnn = document.getElementById('btn-ann-mgmt');
    if (btnAnn && (currentUser.level === 9 || currentUser.role.toLowerCase().includes('admin'))) {
      btnAnn.style.display = '';
    }

    //? Admin ทุก level (1+) สามารถรีวิวแผนงานของลูกน้องได้
    const btnPlans = document.getElementById('btn-plans-mgmt');
    if (btnPlans) btnPlans.style.display = '';

    //? Admin ทุก level (1+) เห็นเมนูพลังงาน/ค่าน้ำมัน
    const btnFuel = document.getElementById('btn-fuel-mgmt');
    if (btnFuel) btnFuel.style.display = '';

    //? ตรวจสอบและแสดง Modal ประกาศ (ครั้งเดียวต่อ Login session)
    checkAndShowAnnouncement();
  } catch(e) {
    //? หากไม่มีสิทธิ์หรือ Session หมดอายุ ให้ส่งไปหน้า Login
    window.location.replace('/');
  }
}
initUser();

window.doLogout = function() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_level');
    localStorage.removeItem('user_role');
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
    document.getElementById('p-level').textContent = currentUser.level || '0';
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

//? ฟังก์ชันแสดงนาฬิกาและวันที่ปัจจุบันแบบไทย (พ.ศ.) ในหน้าจอ
function tick(){
  const n=new Date();
  const d=`${n.getDate()} ${thM[n.getMonth()]} ${n.getFullYear()+543}`;
  const t=`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
  const full=`วัน${thD[n.getDay()]}ที่ ${d}`;
  const el=document.getElementById('s-ts'); 
  //? อัปเดตเนื้อหาใน Element ทุกๆ 1 วินาที
  if(el) el.textContent=`${full} · ${t}`;
}
tick(); //? รันทันทีครั้งแรกเมื่อโหลดหน้า
setInterval(tick,1000); //? ตั้งเวลาให้รันซ้ำทุกวินาที

/* ── ฟังก์ชันช่วยจัดการเกี่ยวกับวันที่ (Date helpers) ── */

//? ดึงวันที่ปัจจุบันในรูปแบบ YYYY-MM-DD เพื่อใช้เป็นค่าเริ่มต้นใน Input และ API
function getTodayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}

//? แปลงวันที่จากรูปแบบ ISO (YYYY-MM-DD) เป็นภาษาไทยแบบเต็ม (เช่น วันจันทร์ที่ 15 เม.ย. 2569)
function formatDateThai(dateStr) {
  //? สร้าง Date Object โดยระบุเวลา 00:00:00 เพื่อป้องกันปัญหาเรื่อง Timezone กระโดดข้ามวัน
  const d = new Date(dateStr + 'T00:00:00');
  return `วัน${thD[d.getDay()]}ที่ ${d.getDate()} ${thM[d.getMonth()]} ${d.getFullYear()+543}`;
}

//? สกัด (Extract) เฉพาะส่วนวันที่ออกจาก Report ID (รูปแบบ ID คือ "UserEmail_YYYY-MM-DD")
function getReportDate(reportId) {
  const m = reportId && reportId.match(/(\d{4}-\d{2}-\d{2})$/);
  return m ? m[1] : null;
}

//? สกัด (Extract) เฉพาะ User ID (Email) ออกจาก Report ID
function getReportUserId(reportId) {
  const d = getReportDate(reportId);
  //? ตัดส่วนวันที่และขีดล่าง (_) ออกจากตอนท้ายสตริง
  return d ? reportId.slice(0, reportId.length - d.length - 1) : reportId;
}

/* ── กำหนดค่าวันที่เริ่มต้นในปฏิทิน (Default date setup) ── */
(function setDefaultDate(){
  const today = getTodayStr();
  const el = document.getElementById('s-date-filter');
  if (el) {
    el.value = today; //? ตั้งค่าเริ่มต้นเป็นวันนี้
    el.max = today;   //? //! ป้องกันไม่ให้ผู้ใช้เลือกวันที่ในอนาคต
    
    //? เมื่อมีการเปลี่ยนวันที่ผ่าน Input ให้โหลดแดชบอร์ดใหม่ทันที
    el.addEventListener('change', () => {
      const nextBtn = document.getElementById('admin-btn-next');
      //? หากเลือกถึงวันนี้แล้ว ให้ปิดปุ่ม "ถัดไป" เพราะไม่มีข้อมูลอนาคต
      if (nextBtn) nextBtn.disabled = el.value >= today;
      loadDashboard();
    });
  }
  const nextBtn = document.getElementById('admin-btn-next');
  if (nextBtn) nextBtn.disabled = true; //? เริ่มต้นที่วันปัจจุบัน ดังนั้นปุ่ม "ถัดไป" ต้องถูกปิดไว้
})();

/* ── ระบบนำทางวันที่ของแอดมิน (Admin date navigation) ── */
//? ฟังก์ชันสำหรับเปลี่ยนวันที่ดูรายงานในหน้าแดชบอร์ดสรุปภาพรวม (ใช้ปุ่ม ← →)
function navigateAdminDate(delta) {
  const today = getTodayStr();
  const dateEl = document.getElementById('s-date-filter');
  if (!dateEl) return;
  const base = dateEl.value || today;
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + delta); //? เพิ่ม/ลด วันที่ตาม delta
  
  const newDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  
  //? ป้องกันการดูรายงานในอนาคต (ซึ่งยังไม่มีข้อมูล)
  if (newDate > today) return;
  
  //? อัปเดตค่าในหน้าจอและโหลดข้อมูลแดชบอร์ดใหม่
  dateEl.value = newDate;
  const nextBtn = document.getElementById('admin-btn-next');
  if (nextBtn) nextBtn.disabled = newDate >= today; //? ปิดปุ่ม "ไปข้างหน้า" หากอยู่ที่วันปัจจุบัน
  loadDashboard();
}

/* ── ระบบนำทางวันที่ในหน้าละเอียด (Employee date navigation within detail view) ── */
//? ใช้สำหรับเปลี่ยนวันที่ดูรายงานของพนักงาน "คนเดียว" เมื่อกดปุ่ม ← → ในหน้าจอรายละเอียด
function navigateEmployeeReport(delta) {
  if (!currentReportId) return;
  const today = getTodayStr();
  //? แยกวันที่ออกจาก ID (เช่น แยก '2026-04-15' ออกจาก 'employee1_2026-04-15')
  const currentDate = getReportDate(currentReportId);
  const userId = getReportUserId(currentReportId);
  
  if (!currentDate || !userId) return;
  
  const d = new Date(currentDate + 'T00:00:00');
  d.setDate(d.getDate() + delta); //? ปรับวันที่
  const newDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  
  //? ป้องกันไม่ให้ดูรายงานล่วงหน้า
  if (newDate > today) return;
  
  //? โหลดข้อมูลรายละเอียดรายงานของวันที่ใหม่
  loadReportDetail(`${userId}_${newDate}`);
}

/* ── แดชบอร์ดสรุปพนักงาน (Dashboard) ── */
//? ฟังก์ชันหลักในการดึงข้อมูลรายงานและรายชื่อพนักงานทั้งหมดเพื่อนำมาพล็อตลงตารางสรุป
async function loadDashboard() {
  const sRows = document.getElementById('s-rows');
  //? แสดงหน้า Loading ก่อนเริ่มดึงข้อมูล
  if (sRows) sRows.innerHTML = '<div class="ld-wrap"><div class="ld-spin"></div><span class="ld-dots">กำลังโหลด</span></div>';
  try {
    const dateEl = document.getElementById('s-date-filter');
    const dateParam = dateEl ? `?date=${dateEl.value}` : '';
    
    //? เรียกใช้ APIs พร้อมกัน (Parallel) เพื่อความรวดเร็ว
    //? 1. ดึงรายงานที่พนักงานส่งมาแล้วในวันที่เลือก
    //? 2. ดึงรายชื่อผู้ใช้ทั้งหมด เพื่อนำมาเปรียบเทียบว่าใคร "ยังไม่ได้ส่ง"
    const [reportsRes, usersRes] = await Promise.all([
      fetch(`/api/reports${dateParam}`),
      fetch('/api/users')
    ]);
    
    const reports = reportsRes.ok ? await reportsRes.json() : [];
    const allFetchedUsers = usersRes.ok ? await usersRes.json() : [];
    
    //? กรองเฉพาะพนักงานที่ต้องตรวจสอบ (ignore=0) 
    //? พนักงานที่ถูกตั้งค่า ignore=1 (เช่น ผู้บริหารระดับสูงหรือตำแหน่งที่ไม่ต้องส่งรายงาน) จะไม่นำมาแสดง
    const users = allFetchedUsers.filter(u => (u.ignore ?? 0) === 0);
    
    //? ส่งต่อข้อมูลไปให้ฟังก์ชันวาดตาราง (Rendering)
    renderReports(reports, users);
  } catch(e) {
    console.error('Dashboard Error:', e);
  }
}

//? รันโหลดแดชบอร์ดครั้งแรกเมื่อเข้าหน้าเว็บ
loadDashboard();

//? จัดการเหตุการณ์การคลิกที่ปุ่ม Filter (เช่น ดูเฉพาะผู้ที่มีปัญหา, ดูเฉพาะ WFH)
document.getElementById('s-filters').addEventListener('click', e => {
  const btn = e.target.closest('.fb'); if (!btn) return;
  
  //? เปลี่ยนสถานะ Active ของปุ่มที่ถูกเลือก
  document.querySelectorAll('.fb').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  
  const f = btn.dataset.f; //? ค่า Filter (เช่น 'all', 'prob', 'wfh')
  
  //? ซ่อน/แสดง แถวพนักงานในตารางตามเงื่อนไขที่เลือก
  document.querySelectorAll('#s-rows .rrow').forEach(r => {
    //? ตรวจสอบว่า Attribute data-f ของแถวมีค่าตรงกับ Filter หรือไม่
    r.style.display = (f === 'all' || r.dataset.f.includes(f)) ? '' : 'none';
  });
});

/* ── การแสดงผลหน้าจอรายละเอียด (Detail view show/hide logic) ── */

//? ฟังก์ชันแสดงหน้าเจาะลึกรายงานรายบทสรุป (Detail Page)
function showDetail(reportId){
  //? ซ่อนหน้าหลัก (List) และสถิติ
  document.getElementById('sup-list').style.display = 'none';
  document.getElementById('sup-stats').style.display = 'none';
  
  const el = document.getElementById('sup-detail');
  el.style.display = 'block';
  _animateIn(el); //? เล่นแอนิเมชัน Fade-in
  
  //? หากมี ID รายงานมาให้โหลดข้อมูลทันที
  if (reportId) loadReportDetail(reportId);
}

//? ฟังก์ชันกลับสู่หน้าหลัก
function hideDetail(){
  if (detailTimerInterval) clearInterval(detailTimerInterval);
  document.getElementById('sup-detail').style.display = 'none';
  const el = document.getElementById('sup-list');
  el.style.display = 'block';
  _animateIn(el);
}

/* ── โหลดรายละเอียดรายงาน (Load report detail) ── */
//? ดึงข้อมูลรายงานเชิงลึกรายบุคคลตาม ID (user_id_date)
async function loadReportDetail(reportId) {
  if (detailTimerInterval) clearInterval(detailTimerInterval);
  currentReportId = reportId; //? จดจำ ID ไว้สำหรับการนำทางและคอมเมนท์
  try {
    const res = await fetch(`/api/reports/${reportId}`);
    if (res.ok) {
      const report = await res.json();
      //? เรนเดอร์ข้อมูลรายงานที่พนักงานส่งมา
      renderReportDetail(report);
    } else if (res.status === 404) {
      //? หากสถานะเป็น 404 แสดงว่ายังไม่มีการส่งรายงานในวันนั้น
      renderEmptyReportDetail(reportId);
    }
  } catch(e) {
    console.error('Error loading report:', e);
  }
}

/* ── ตัวช่วยสร้าง HTML แถบเลื่อนวันที่ (Date nav HTML helper) ── */
//? ฟังก์ชันสำหรับสร้างแถบปุ่มนำทางวันที่ (← วันก่อน | วันที่โชว์ | วันถัดไป →) ในหน้ารายละเอียด
function buildDetailDateNav(reportId) {
  const today = getTodayStr();
  const rDate = getReportDate(reportId);
  const isToday = rDate === today;
  const displayDate = rDate ? formatDateThai(rDate) : '—';
  
  //? ตรวจสอบและแสดงป้ายกำกับ (Label) ว่าเป็น "ย้อนหลัง" หรือ "วันนี้"
  const isHistoric = rDate && rDate < today;
  const historyLabel = isHistoric
    ? `<span style="font-size:10px;background:#FFF8E1;color:#5D4037;border:0.5px solid #FFCA28;border-radius:4px;padding:2px 6px;margin-left:6px">ย้อนหลัง</span>`
    : `<span style="font-size:10px;background:#E1F5EE;color:#085041;border:0.5px solid #A5D6C1;border-radius:4px;padding:2px 6px;margin-left:6px">วันนี้</span>`;
    
  return `
    <div class="date-nav" style="margin-bottom:.875rem">
      <button class="date-nav-btn" onclick="navigateEmployeeReport(-1)" title="วันก่อนหน้า"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
      <div class="date-nav-display">${displayDate}${historyLabel}</div>
      <button class="date-nav-btn" onclick="navigateEmployeeReport(1)" title="วันถัดไป" ${isToday ? 'disabled' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
    </div>`;
}

/* ── Render report detail ── */
function renderReportDetail(report) {
  const container = document.getElementById('sup-detail-content');
  if (!container) return;

  const initials = getInitials(report.name);
  const workModeBadge = report.work_mode === 'wfh' ? '<span class="bdg bdg-blue">WFH</span>' :
                       report.work_mode === 'hybrid' ? '<span class="bdg bdg-indigo">Hybrid</span>' :
                       '<span class="bdg bdg-green">On-site</span>';

  const progressBgColor = report.progress >= 80 ? '#639922' : report.progress >= 40 ? '#EF9F27' : '#E24B4A';
  const progressColor   = report.progress >= 80 ? '#27500A' : report.progress >= 40 ? '#633806' : '#8B4513';

  const tasksHTML = report.tasks && report.tasks.length > 0
    ? report.tasks.map(t => {
        const escapedDesc = (t.description || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const descBtn = t.description
          ? `<button class="btn-view-desc" onclick="viewDesc('${escapedDesc}')">📝 ดูรายละเอียด</button>`
          : '';

        let attachHTML = '';
        if ((t.files && t.files.length) || (t.links && t.links.length)) {
          let fList = (t.files || []).map(f => `<a href="${f.url}" target="_blank" style="display:inline-flex;align-items:center;background:#E6F1FB;color:#1059A3;padding:2px 8px;border-radius:4px;font-size:11px;text-decoration:none;border:1px solid #B5D4F4;margin-right:6px;margin-top:4px;">📄 ${f.name}</a>`).join('');
          let lList = (t.links || []).map(l => `<a href="${l.url}" target="_blank" style="display:inline-flex;align-items:center;background:#EEEDFE;color:#3C3489;padding:2px 8px;border-radius:4px;font-size:11px;text-decoration:none;border:1px solid #C4B8F5;margin-right:6px;margin-top:4px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🔗 ${l.title || l.url}</a>`).join('');
          attachHTML = `<div style="margin-top:6px;padding-left:36px;display:flex;flex-wrap:wrap;">${fList}${lList}</div>`;
        }

        //? คำนวณเวลาที่ใช้กับงานนี้เพื่อแสดงให้ผู้ประเมินเห็น
        let timerBadge = '';
        if (t.elapsed_seconds != null && t.elapsed_seconds > 0) {
          const icon = t.status === 'done' ? '✓' : t.status === 'pend' ? '◯' : '⏱';
          const cls  = t.status === 'done' ? 'is-done' : t.status === 'pend' ? 'is-pend' : '';
          timerBadge = `<span class="task-timer ${cls}" style="flex-shrink:0">${icon} ${formatSeconds(t.elapsed_seconds)}</span>`;
        } else if (t.started_at && t.status === 'prog') {
          const elapsed = Math.floor((Date.now() - new Date(t.started_at).getTime()) / 1000);
          timerBadge = `<span class="task-timer sup-active-timer" data-started-at="${t.started_at}" style="flex-shrink:0">⏱ ${formatSeconds(Math.max(0, elapsed))}</span>`;
        }

        return `
          <div style="padding:10px 0;border-bottom:0.5px solid var(--color-border-tertiary);">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <div style="display:flex;align-items:center;gap:10px;flex:1;flex-wrap:wrap">
                <span class="bdg ${getStatusBadgeClass(t.status)}">${getStatusSymbol(t.status)}</span>
                <span style="font-size:14px;font-weight:500;color:var(--color-text-primary)">${(t.title || '').replace(/</g, '&lt;')}</span>
                <span class="bdg ${getTaskTypeBadgeClass(t.from_plan ? 'แผนงานเชิงพัฒนา' : t.task_type)}" style="font-size:10px;margin-left:4px">${t.from_plan ? 'แผนงานเชิงพัฒนา' : (t.task_type || 'งานประจำ')}</span>
                ${timerBadge}
              </div>
              ${descBtn}
            </div>
            ${attachHTML}
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
  initDetailTimers();
}

//? ฟังก์ชันสำหรับ Tick เวลาในหน้าละเอียด
function initDetailTimers() {
  if (detailTimerInterval) clearInterval(detailTimerInterval);
  const activeTimers = document.querySelectorAll('.sup-active-timer');
  if (activeTimers.length === 0) return;

  detailTimerInterval = setInterval(() => {
    const now = Date.now();
    activeTimers.forEach(el => {
      const startedAt = el.dataset.startedAt;
      if (!startedAt) return;
      const elapsed = Math.floor((now - new Date(startedAt).getTime()) / 1000);
      el.textContent = `⏱ ${formatSeconds(Math.max(0, elapsed))}`;
    });
  }, 1000);
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
  if (thread) thread.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary);text-align:center;padding:10px">คลิกที่นี่เพื่อเริ่มการเขียนคอมเมนต์</div>';
}

/* ── Render report list ── */
/* ── เรนเดอร์ตารางรายชื่อรายงาน (Render report list) ── */
//? ฟังก์ชันที่ประมวลผลข้อมูลรายงานเทียบกับรายชื่อพนักงาน เพื่อแสดงผลสรุปว่า "ใครส่งแล้ว" และ "ใครยังไม่ส่ง"
function renderReports(reports, users = []) {
  const sRows = document.getElementById('s-rows');
  if (!sRows) return;
  sRows.innerHTML = '';

  //? แยกแยะพนักงานที่ส่งแล้ว และที่ยังค้างคาจากรายชื่อทั้งหมด
  const submittedIds = new Set(reports.map(r => r.user_id));
  const unsentUsers = users.filter(u => !submittedIds.has(u.user_id));

  //? ปรับปรุงตัวเลข KPI ด้านบนแดชบอร์ด
  const total = users.length || reports.length;
  const withProbs = reports.filter(r => r.problems && r.problems !== '-').length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-sent').textContent = reports.length;
  document.getElementById('stat-unsent').textContent = unsentUsers.length;
  document.getElementById('stat-prob').textContent = withProbs;

  //? จัดทำเมนูรายการย่อสำหรับปัญหาที่ต้องติดตามด่วน
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
                <span style="font-size:11px;color:var(--color-text-secondary)">${r.position || r.role || ''}${r.department ? ' · ' + r.department : ''}</span>
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

  //? กรณีไม่มีข้อมูลพนักงานเลย (ฐานข้อมูลว่าง)
  if (reports.length === 0 && unsentUsers.length === 0) {
    sRows.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-text-secondary)">ไม่มีรายงาน</div>';
    return;
  }

  /* ── ฟังก์ชันตัวช่วย: สร้างโครงสร้าง HTML สำหรับ 1 แถวพนักงาน (Report Row) ── */
  function buildReportRow(report, idx) {
    const initials = getInitials(report.name);
    //? วนลูปใช้สี Avatar ให้หลากหลายเพื่อความสวยงาม
    const avatarColor = avatarCycleColors[idx % avatarCycleColors.length];
    
    //? สร้างป้ายกำกับรูปแบบการทำงาน (Badge)
    const workModeBadge = report.work_mode === 'wfh' ? '<span class="bdg bdg-blue">WFH</span>' :
                         report.work_mode === 'hybrid' ? '<span class="bdg bdg-indigo">Hybrid</span>' :
                         '<span class="bdg bdg-green">On-site</span>';
                         
    //? สร้างป้ายกำกับรายการงาน (Task Badges)
    const taskBadges = report.tasks && report.tasks.length > 0
      ? report.tasks.map(t => `<span class="bdg ${getStatusBadgeClass(t.status)}">${getStatusSymbol(t.status)} ${t.title}</span>`).join('')
      : '<span style="color:var(--color-text-secondary);font-size:11px">ไม่มีงาน</span>';
      
    //? แสดงปัญหา (ถ้ามี)
    const problemHTML = report.problems && report.problems !== '-'
      ? `<div class="rproblem"><div class="pdot"></div>${report.problems}</div>` : '';
      
    //? กำหนดสีแถบความคืบหน้า (Progress Bar) ตามช่วงเปอร์เซ็นต์
    const progressColor   = report.progress >= 80 ? '#27500A' : report.progress >= 40 ? '#633806' : '#8B4513';
    const progressBgColor = report.progress >= 80 ? '#639922' : report.progress >= 40 ? '#EF9F27' : '#E24B4A';
    
    //? ข้อมูล Attributes สำหรับใช้ในการ Filter หน้าจอ (ส่งแล้ว, มีปัญหา, WFH)
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

  /* ── ส่วนแสดงรายงานที่ส่งแล้ว ── */
  if (isSuperAdmin && reports.length > 0) {
    //? สำหรับ Super Admin: จัดกลุ่มพนักงานแยกตามหน่วยงาน (Department)
    const deptReports = {};
    reports.forEach(r => {
      const dept = r.department || 'ไม่ระบุหน่วยงาน';
      if (!deptReports[dept]) deptReports[dept] = [];
      deptReports[dept].push(r);
    });

    let globalIdx = 0;
    Object.entries(deptReports).forEach(([dept, members]) => {
      //? สร้าง Header ของกลุ่มหน่วยงาน
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
    //? สำหรับหัวหน้างานระดับ 1-3: แสดงรายการเรียงลำดับแบบปกติ (ตามสายบังคับบัญชา)
    reports.forEach((report, idx) => {
      sRows.insertAdjacentHTML('beforeend', buildReportRow(report, idx));
    });
  }

  /* ── ส่วนแสดงพนักงานที่ค้างส่ง (Unsunt Users) ── */
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
      //? สร้าง Header กลุ่มที่ยังไม่ส่ง แยกตามหน่วยงาน
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
        //? แสดงแถวแบบจางลง (Opacity 0.65) เพื่อให้เห็นความแตกต่างกับคนที่ส่งแล้ว
        sRows.insertAdjacentHTML('beforeend', `
          <div class="rrow" data-f="unsent" style="opacity:.65;padding-left:24px">
            <div class="av av-sm ${avatarColor}" style="filter:grayscale(.5)">${initials}</div>
            <div class="rmain">
              <div class="rname">${u.name}</div>
              <div class="rmeta">${u.position || u.role || ''} · <span style="color:#E24B4A;font-weight:500">ยังไม่ส่งรายงาน</span></div>
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

/* ── ส่วนแสดงความคิดเห็น (Comments display logic) ── */
//? ฟังก์ชันสำหรับพ่น (Render) ข้อความสื่อสารลงใน Thread ใต้รายงาน
function renderComments(comments, containerId) {
  const thread = document.getElementById(containerId);
  if (!thread) return;
  thread.innerHTML = '';
  
  if (comments && comments.length > 0) {
    comments.forEach(c => {
      //? ตรวจสอบว่าใครเป็นคนพูด (พนักงาน หรือ หัวหน้า/แอดมิน) เพื่อจัดสไตล์ให้แตกต่างกัน
      const isSrv = c.author_role.includes('หัวหน้า') || c.author_role.includes('แอดมิน') || c.author_role.includes('ผู้ดูแล');
      const b = document.createElement('div');
      b.className = 'cbubble';
      
      //? จับคู่ Tag กับสี Badge
      const tagColorMap = { 'ต้องแก้ไข': 'bdg-red', 'ดีมาก': 'bdg-green', 'ติดตามด่วน': 'bdg-amber', 'รับทราบ': 'bdg-gray' };
      const tagClass = c.tag ? (tagColorMap[c.tag] || 'bdg-blue') : '';
      const tagHTML = c.tag ? `<span class="bdg ${tagClass}" style="font-size:10px">${c.tag}</span>` : '';
      
      b.innerHTML = `
        <div class="av ${c.avatar_color || 'av-gray'} av-sm">${c.author_initials || '??'}</div>
        <div>
          <div class="bname">${c.author_name} <span>${c.timestamp} · ${c.author_role}</span> ${tagHTML}</div>
          <div class="btext ${isSrv ? 'sv' : ''}">${c.message}</div>
        </div>
      `;
      thread.appendChild(b);
    });
  } else {
    //? //! กรณีที่ยังไม่มีใครตอบโต้กันในรายงานนี้
    thread.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary);text-align:center;padding:10px">คลิกที่นี่เพื่อเริ่มการเขียนคอมเมนต์</div>';
  }
}

/* ── การเลือก Tag (Tag selection logic) ── */
let selTag = ''; //? ตัวแปรเก็บค่า Tag ที่เลือกปัจจุบัน (สมมติว่า 'ต้องแก้ไข')
function stag(el){
  //? รีเซ็ตสไตล์ของปุ่ม Tag อื่นๆ
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
  
  //? หากกดซ้ำตัวเดิม ให้ยกเลิกการเลือก (Deselect)
  if (selTag !== el.textContent) { 
    el.classList.add('on'); 
    selTag = el.textContent; 
  } else { 
    selTag = ''; 
  }
}

/* ── Send comment ── */
/* ── ส่งคอมเมนท์แชท (Send comment) ── */
//? ฟังก์ชันสำหรับส่งข้อความตอบกลับหรือคำสั่งการจากหัวหน้างานไปยังรายงานของลูกน้อง
async function sendCmt() {
  const msg = document.getElementById('s-msg').value.trim();
  //? ป้องกันการส่งข้อความว่าง หรือส่งในกรณีที่ไม่ได้เปิดรายงานใดๆ
  if (!msg || !currentReportId) return;

  const commentData = {
    author_id: currentUser.user_id,
    author_name: currentUser.name,
    author_role: currentUser.role,
    avatar_color: 'av-blue',
    author_initials: getInitials(currentUser.name),
    message: msg,
    tag: selTag //? แนบ Tag (ถ้ามี) เช่น 'ต้องแก้ไข', 'รับทราบ'
  };

  try {
    const res = await fetch(`/api/reports/${currentReportId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commentData)
    });
    if (res.ok) {
      //? เคลียร์ช่องพิมพ์และรีเซ็ต Tag หลังจากส่งสำเร็จ
      document.getElementById('s-msg').value = '';
      document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
      selTag = '';
      
      //? แสดงสัญลักษณ์ "สำเร็จ" (Checkmark) ชั่วคราว
      const ok = document.getElementById('s-ok');
      ok.style.display = 'block';
      setTimeout(() => ok.style.display = 'none', 3000);
      
      //? โหลดหน้าแสดงผลใหม่เพื่ออัปเดตประวัติการสื่อสารล่าสุด
      loadReportDetail(currentReportId);
    }
  } catch(e) {
    console.error('Error sending comment:', e);
  }
}

/* ── ฟังก์ชันดูคำอธิบายงาน (Description modal) ── */
//? แสดง Modal เพื่ออ่านรายละเอียดของงานแบบเต็มๆ (เนื่องจากในหน้าสรุปถูกย่อให้อยู่บรรทัดเดียว)
function viewDesc(desc) {
  const inputEl = document.getElementById('task-desc-input');
  if (inputEl) inputEl.value = desc;
  document.getElementById('desc-modal').classList.add('on');
}

//? ปิด Modal รายละเอียดงาน
function closeDescModal() {
  document.getElementById('desc-modal').classList.remove('on');
}

/* ── ฟังก์ชันตัวช่วยขนาดเล็ก (Helpers) ── */

//? สร้างอักษรย่อจากชื่อ (เช่น "สมชาย รักดี" -> "สม") เพื่อแสดงในวงกลม Avatar
function getInitials(name) {
  if (!name) return '??';
  return name.split(' ').slice(0, 2).map(n => n.charAt(0)).join('').toUpperCase();
}

//? คืนค่าชื่อ Class CSS ตามสถานะของงาน
function getStatusBadgeClass(status) {
  if (status === 'done') return 'bdg-green'; //? สำเร็จ
  if (status === 'prog') return 'bdg-amber'; //? กำลังทำ
  return 'bdg-gray'; //? ยังไม่เริ่ม
}

//? คืนค่าสัญลักษณ์ (Emoji/Symbol) ตามสถานะของงาน
function getStatusSymbol(status) {
  if (status === 'done') return '✓';
  if (status === 'prog') return '⋯';
  return '◯';
}

//? คืนค่าชื่อ Class CSS ตามประเภทงาน
function getTaskTypeBadgeClass(type) {
  if (type === 'แผนงานเชิงพัฒนา') return 'bdg-teal';
  if (type === 'งานที่รับมอบหมาย') return 'bdg-indigo';
  return 'bdg-blue'; // งานประจำ
}

/* ════════════════════════════════════════
   USER MANAGEMENT (super admin only)
   ════════════════════════════════════════ */

let userEditMode = false;
let userEditEmail = null;
let allUsers = [];
let ignoreMigrated = false;
let collapsedDepts = null; // null = ยังไม่ initialize (จะ collapse ทั้งหมดครั้งแรก)
let _deptKeyMap = [];    // index → dept name (user table)
let _evalDeptKeyMap = []; // index → dept name (eval table)

function _animateIn(el) {
  if (!el) return;
  el.classList.remove('sub-enter');
  void el.offsetWidth; // force reflow
  el.classList.add('sub-enter');
}

function _animateDeptWrap(wrap, collapse) {
  if (!wrap) return;
  wrap.classList.remove('collapsed');
  if (collapse) {
    wrap.style.maxHeight = wrap.scrollHeight + 'px';
    wrap.style.opacity = '1';
    requestAnimationFrame(() => {
      wrap.style.maxHeight = '0px';
      wrap.style.opacity = '0';
    });
  } else {
    const h = wrap.scrollHeight;
    wrap.style.maxHeight = '0px';
    wrap.style.opacity = '0';
    requestAnimationFrame(() => {
      wrap.style.maxHeight = h + 'px';
      wrap.style.opacity = '1';
      wrap.addEventListener('transitionend', () => {
        wrap.style.maxHeight = 'none';
      }, { once: true });
    });
  }
}

const levelRoleMap = { '0':'employee','1':'supervisor','2':'director','3':'executive','9':'super_admin' };
const levelLabelMap = { 0:'พนักงาน',1:'หัวหน้างาน',2:'ผู้อำนวยการ',3:'ผู้บริหาร',9:'ผู้ดูแลระบบ' };
const avatarCycleColors = ['av-teal','av-purple','av-coral','av-amber','av-blue'];

function setNavActive(activeId) {
  ['btn-users-mgmt','btn-evals-mgmt','btn-stats-mgmt','btn-ann-mgmt','btn-plans-mgmt','btn-fuel-mgmt'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === activeId);
  });
}

function showUsersScreen() {
  document.getElementById('sup-list').style.display = 'none';
  document.getElementById('sup-detail').style.display = 'none';
  document.getElementById('sup-evals').style.display = 'none';
  document.getElementById('sup-stats').style.display = 'none';
  const el = document.getElementById('sup-users');
  el.style.display = 'block';
  _animateIn(el);
  setNavActive('btn-users-mgmt');
  loadUserManagement();
}

function hideUsersScreen() {
  document.getElementById('sup-users').style.display = 'none';
  const el = document.getElementById('sup-list');
  el.style.display = 'block';
  _animateIn(el);
  setNavActive(null);
}

/* ── ระบบจัดการผู้ใช้ (User Management - Super Admin Only) ── */
//? ฟังก์ชันโหลดข้อมูลผู้ใช้ทั้งหมดเพื่อนำมาบริหารจัดการ (จำกัดสิทธิ์เฉพาะระดับผู้ดูแลระบบ)
async function loadUserManagement() {
  collapsedDepts = null; //? รีเซ็ตสถานะการย่อหน่วยงานทุกครั้งที่โหลดข้อมูลใหม่
  document.getElementById('u-rows').innerHTML =
    '<div class="ld-wrap"><div class="ld-spin"></div><span class="ld-dots">กำลังโหลด</span></div>';
    
  //? การย้ายฟิลด์ (Migration): ตรวจสอบและอัปเดตสถานะ 'ignore' ในไฟล์ฐานข้อมูล (รันครั้งเดียวต่อ Session)
  if (!ignoreMigrated) {
    ignoreMigrated = true;
    fetch('/api/admin/migrate/ignore', { method:'POST' }).catch(() => {});
  }
  
  try {
    const res = await fetch('/api/admin/users');
    if (!res.ok) throw new Error('Forbidden'); //? ป้องกันการเข้าถึงหากไม่มีสิทธิ์
    allUsers = await res.json();
    
    //? นำข้อมูลรายชื่อพนักงานทั้งหมดไปเรนเดอร์ลงตารางจัดการ
    renderUserTable(allUsers);
  } catch(e) {
    document.getElementById('u-rows').innerHTML =
      '<div style="text-align:center;color:#e24b4a;padding:1.5rem">ไม่มีสิทธิ์เข้าถึงข้อมูล</div>';
  }
}

function renderUserTable(users, isFiltered = false) {
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

  // initialize collapsedDepts ครั้งแรก — collapse ทุก department
  if (collapsedDepts === null) {
    collapsedDepts = new Set(Object.keys(groups));
  }

  _deptKeyMap = [];
  let html = '';
  let colorIdx = 0;
  Object.entries(groups).forEach(([dept, members]) => {
    const idx = _deptKeyMap.length;
    _deptKeyMap.push(dept);
    const isCollapsed = !isFiltered && collapsedDepts.has(dept);

    html += `
      <div style="background:#F3EEE8;border-left:3px solid #C9A96E;padding:7px 14px;margin-top:6px;border-radius:0 4px 4px 0;cursor:pointer;display:flex;align-items:center;gap:7px;user-select:none"
        onclick="toggleDeptCollapse(${idx})">
        <span class="dept-hd-icon${isCollapsed ? ' rot' : ''}" data-dept-icon="${idx}">▼</span>
        <span style="font-size:11px;font-weight:700;color:#5D4A2E;letter-spacing:.05em">${dept}</span>
        <span style="font-size:10px;color:#8C7A5E">${members.length} คน</span>
      </div>
      <div class="dept-wrap${isCollapsed ? ' collapsed' : ''}" data-dept-wrap="${idx}">`;

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
            <button class="btn-detail btn-danger"
              onclick="confirmDeleteUser('${emailSafe}','${nameSafe}')">ลบ</button>
          </div>
        </div>`;
    });

    html += `</div>`;
  });
  container.innerHTML = html;
}

function toggleDeptCollapse(idx) {
  const dept = _deptKeyMap[idx];
  if (dept === undefined) return;
  if (!collapsedDepts) collapsedDepts = new Set();
  const willCollapse = !collapsedDepts.has(dept);
  if (willCollapse) collapsedDepts.add(dept); else collapsedDepts.delete(dept);
  const wrap = document.querySelector(`[data-dept-wrap="${idx}"]`);
  const icon = document.querySelector(`[data-dept-icon="${idx}"]`);
  _animateDeptWrap(wrap, willCollapse);
  if (icon) icon.classList.toggle('rot', willCollapse);
}

function filterUsers(query) {
  const q = query.trim().toLowerCase();
  if (q) {
    const filtered = allUsers.filter(u => {
      const name = `${u.firstname||''} ${u.lastname||''}`.toLowerCase();
      return name.includes(q)
        || (u.email||'').toLowerCase().includes(q)
        || (u.department||'').toLowerCase().includes(q)
        || (u.position||'').toLowerCase().includes(q);
    });
    renderUserTable(filtered, true); // isFiltered=true → expand ทั้งหมด
  } else {
    renderUserTable(allUsers, false); // isFiltered=false → ใช้ collapsedDepts
  }
}

//? ฟังก์ชันช่วยรีเรนเดอร์ตารางผู้ใช้ใหม่โดยอิงจากคำค้นหาที่ค้างอยู่ในช่อง Search
function _reRenderUsers() {
  const q = (document.getElementById('u-search') || {}).value || '';
  filterUsers(q);
}

//? เมื่อเลือก Level ระบบจะเลือก Role เริ่มต้นที่เหมาะสมให้อัตโนมัติ (เช่น Level 1 -> Supervisor)
function autoFillRole() {
  const lv = document.getElementById('u-level').value;
  document.getElementById('u-role').value = levelRoleMap[lv] || 'employee';
}

function _setModalField(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

//? เปิด Modal สำหรับ "เพิ่มผู้ใช้ใหม่"
function openAddUserModal() {
  userEditMode = false; //? โหมดเพิ่มข้อมูลใหม่
  userEditEmail = null;
  document.getElementById('user-modal-title').textContent = 'เพิ่มผู้ใช้ใหม่';
  
  //? เปิดให้กรอกอีเมลได้ (หากเป็นโหมดแก้ไขจะถูกล็อค)
  document.getElementById('u-email').readOnly = false;
  document.getElementById('u-email').style.opacity = '1';
  document.getElementById('u-pwd-hint').textContent = '(จำเป็น)';
  
  //? ล้างค่าในช่องกรอกข้อมูลทั้งหมด
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

//? บันทึกข้อมูลผู้ใช้ (ทั้งกรณีเพิ่มใหม่ และ แก้ไขข้อมูลเดิม)
async function saveUser() {
  const firstname   = document.getElementById('u-firstname').value.trim();
  const lastname    = document.getElementById('u-lastname').value.trim();
  const email       = document.getElementById('u-email').value.trim();
  const personal_id = document.getElementById('u-personal-id').value.trim();
  const password    = document.getElementById('u-password').value.trim();

  //? //! Validation: ตรวจสอบฟิลด์ที่จำเป็นต้องกรอก
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
  
  //? หากมีการกรอกรหัสผ่าน (ใช้ตอนกำหนดใหม่ หรือเปลี่ยนรหัสผ่านเดิม) ให้แนบไปใน API
  if (password) payload.password = password;

  try {
    let res;
    if (userEditMode) {
      //? กรณีแก้ไข: ใช้เมธอด PUT พร้อมระบุ Email เดิมใน URL
      res = await fetch(`/api/admin/users/${encodeURIComponent(userEditEmail)}`, {
        method: 'PUT',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      //? กรณีเพิ่มใหม่: ใช้เมธอด POST
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
      
      if (userEditMode) {
        //? อัปเดตข้อมูลในอาร์เรย์ Local ทันทีโดยไม่ต้องโหลด API ใหม่
        const idx = allUsers.findIndex(u => u.email === userEditEmail);
        if (idx >= 0) Object.assign(allUsers[idx], payload);
      } else {
        //? เพิ่มผู้ใช้ใหม่ลงในลิสต์ และเรียงลำดับหน่วยงานใหม่
        payload.email = email;
        allUsers.push(payload);
        allUsers.sort((a, b) => {
          const d = (a.department || '').localeCompare(b.department || '', 'th');
          return d !== 0 ? d : (a.firstname || '').localeCompare(b.firstname || '', 'th');
        });
      }
      _reRenderUsers(); //? พ่นตารางใหม่
    } else {
      const err = await res.json().catch(() => ({}));
      Swal.fire({ icon:'error', title:'เกิดข้อผิดพลาด', text: err.detail || 'ไม่สามารถบันทึกได้', confirmButtonText:'ตกลง' });
    }
  } catch(e) {
    Swal.fire({ icon:'error', title:'เกิดข้อผิดพลาด', text:'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์', confirmButtonText:'ตกลง' });
  }
}

//? ลบข้อมูลผู้ใช้
async function confirmDeleteUser(email, name) {
  //? //! คำเตือน: ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้
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
      allUsers = allUsers.filter(u => u.email !== email);
      _reRenderUsers();
    } else {
      Swal.fire({ icon:'error', title:'ลบไม่สำเร็จ', confirmButtonText:'ตกลง' });
    }
  } catch(e) {
    Swal.fire({ icon:'error', title:'เกิดข้อผิดพลาด', confirmButtonText:'ตกลง' });
  }
}

//? สลับสถานะ Ignore (ซ่อน/แสดง) ของพนักงาน
//? พนักงานที่ถูกตั้งค่า Ignore=1 จะยังอยู่ในระบบ Login ได้ปกติ แต่ชื่อจะไม่โชว์ในตารางรายงานแดชบอร์ด
async function toggleIgnore(email, currentIgnore) {
  const newIgnore = currentIgnore ? 0 : 1;
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ ignore: newIgnore })
    });
    if (res.ok) {
      const u = allUsers.find(u => u.email === email);
      if (u) u.ignore = newIgnore;
      _reRenderUsers();
    }
  } catch(e) { console.error(e); }
}

/* ════════════════════════════════════════
   ระบบจัดการสายบังคับบัญชา (EVALUATION MANAGEMENT - Super Admin Only)
   ════════════════════════════════════════ */

let allEvalsData = [];     //? ข้อมูลสายบังคับบัญชาทั้งหมด
let allUsersForEval = [];  //? รายชื่อผู้ใช้แบบย่อสำหรับนำมาทำลิสต์ผู้ประเมิน
let evalTargetId = null;   //? พนักงานที่กำลังถูกแก้ไขสายบังคับบัญชา
let evalCurrentIds = [];   //? ลิสต์ ID ผู้ประเมินปัจจุบันของพนักงานที่เลือก
let collapsedEvalDepts = null; //? สถานะการย่อ/ขยาย แต่ละหน่วยงานในหน้าจัดการสายงาน

//? แสดงหน้าจอจัดการสายบังคับบัญชา
function showEvalsScreen() {
  document.getElementById('sup-list').style.display = 'none';
  document.getElementById('sup-detail').style.display = 'none';
  document.getElementById('sup-users').style.display = 'none';
  document.getElementById('sup-stats').style.display = 'none';
  const el = document.getElementById('sup-evals');
  el.style.display = 'block';
  _animateIn(el);
  setNavActive('btn-evals-mgmt');
  loadEvalManagement(); //? โหลดสิทธิ์และข้อมูลประเมิน
}

//? ปิดหน้าจอจัดการสายงาน
function hideEvalsScreen() {
  document.getElementById('sup-evals').style.display = 'none';
  const el = document.getElementById('sup-list');
  el.style.display = 'block';
  _animateIn(el);
  setNavActive(null);
}

//? ลอจิกโหลดข้อมูลสายบังคับบัญชาจาก API
async function loadEvalManagement() {
  collapsedEvalDepts = null; //? รีเซ็ตสถานะการย่อหน่วยงาน
  document.getElementById('ev-rows').innerHTML =
    '<div class="ld-wrap"><div class="ld-spin"></div><span class="ld-dots">กำลังโหลด</span></div>';
    
  try {
    const res = await fetch('/api/admin/evaluations');
    if (!res.ok) throw new Error('Forbidden');
    const data = await res.json();
    
    allEvalsData = data.evaluations; //? เก็บข้อมูลสายงาน
    allUsersForEval = data.users;    //? เก็บข้อมูลผู้ใช้สำหรับช่อง Search
    renderEvalTable(allEvalsData);   //? วาดตารางสายงาน
  } catch(e) {
    document.getElementById('ev-rows').innerHTML =
      '<div style="text-align:center;color:#e24b4a;padding:1.5rem">ไม่มีสิทธิ์เข้าถึงข้อมูล</div>';
  }
}

function renderEvalTable(evals, isFiltered = false) {
  const container = document.getElementById('ev-rows');
  if (!evals.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--color-text-secondary);padding:1.5rem">ไม่พบข้อมูล</div>';
    return;
  }

  const groups = {};
  evals.forEach(ev => {
    const dept = ev.target_department || 'ไม่ระบุหน่วยงาน';
    if (!groups[dept]) groups[dept] = [];
    groups[dept].push(ev);
  });

  // initialize collapsedEvalDepts ครั้งแรก — collapse ทุก department
  if (collapsedEvalDepts === null) {
    collapsedEvalDepts = new Set(Object.keys(groups));
  }

  _evalDeptKeyMap = [];
  let html = '';
  let colorIdx = 0;
  Object.entries(groups).forEach(([dept, members]) => {
    const idx = _evalDeptKeyMap.length;
    _evalDeptKeyMap.push(dept);
    const isCollapsed = !isFiltered && collapsedEvalDepts.has(dept);

    html += `
      <div style="background:#F3EEE8;border-left:3px solid #C9A96E;padding:7px 14px;margin-top:6px;border-radius:0 4px 4px 0;cursor:pointer;display:flex;align-items:center;gap:7px;user-select:none"
        onclick="toggleEvalDeptCollapse(${idx})">
        <span class="dept-hd-icon${isCollapsed ? ' rot' : ''}" data-eval-dept-icon="${idx}">▼</span>
        <span style="font-size:11px;font-weight:700;color:#5D4A2E;letter-spacing:.05em">${dept}</span>
        <span style="font-size:10px;color:#8C7A5E">${members.length} คน</span>
      </div>
      <div class="dept-wrap${isCollapsed ? ' collapsed' : ''}" data-eval-dept-wrap="${idx}">`;

    members.forEach(ev => {
      const initials = getInitials(ev.target_name || ev.target_id);
      const avColor = avatarCycleColors[colorIdx++ % avatarCycleColors.length];
      const targetIdSafe = (ev.target_id || '').replace(/'/g, "\\'");

      const evalChips = ev.evaluators.length > 0
        ? ev.evaluators.map(e =>
            `<span class="bdg bdg-blue" style="font-size:11px">${e.name || e.evaluator_id}</span>`
          ).join('')
        : '<span style="font-size:11px;color:var(--color-text-secondary)">— ไม่มีผู้ประเมิน —</span>';

      html += `
        <div class="rrow" style="${ev.target_ignore ? 'opacity:.55' : ''}">
          <div class="av av-sm ${avColor}">${initials}</div>
          <div class="rmain">
            <div class="rname">${ev.target_name || ev.target_id}</div>
            <div class="rmeta">${ev.target_position || '—'}</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px">${evalChips}</div>
          </div>
          <div style="align-self:center">
            <button class="btn-detail" onclick="openEditEvalModal('${targetIdSafe}')">✏ แก้ไข</button>
          </div>
        </div>`;
    });

    html += `</div>`;
  });
  container.innerHTML = html;
}

function toggleEvalDeptCollapse(idx) {
  const dept = _evalDeptKeyMap[idx];
  if (dept === undefined) return;
  if (!collapsedEvalDepts) collapsedEvalDepts = new Set();
  const willCollapse = !collapsedEvalDepts.has(dept);
  if (willCollapse) collapsedEvalDepts.add(dept); else collapsedEvalDepts.delete(dept);
  const wrap = document.querySelector(`[data-eval-dept-wrap="${idx}"]`);
  const icon = document.querySelector(`[data-eval-dept-icon="${idx}"]`);
  _animateDeptWrap(wrap, willCollapse);
  if (icon) icon.classList.toggle('rot', willCollapse);
}

function filterEvals(query) {
  const q = query.trim().toLowerCase();
  if (q) {
    const filtered = allEvalsData.filter(ev =>
      (ev.target_name || '').toLowerCase().includes(q) ||
      (ev.target_department || '').toLowerCase().includes(q) ||
      (ev.target_position || '').toLowerCase().includes(q) ||
      ev.evaluators.some(e => (e.name || '').toLowerCase().includes(q))
    );
    renderEvalTable(filtered, true); // isFiltered=true → expand ทั้งหมด
  } else {
    renderEvalTable(allEvalsData, false); // isFiltered=false → ใช้ collapsedEvalDepts
  }
}

function _reRenderEvals() {
  const q = (document.getElementById('ev-search') || {}).value || '';
  filterEvals(q);
}

//? แสดงหน้าจอแก้ไขผู้ประเมิน (Modal)
function openEditEvalModal(targetId) {
  const ev = allEvalsData.find(x => x.target_id === targetId);
  if (!ev) return;
  evalTargetId = targetId; //? จดจำพนักงานเป้าหมาย
  evalCurrentIds = ev.evaluators.map(e => e.evaluator_id); //? รายชื่อผู้ประเมินปัจจุบัน

  //? แสดงข้อมูลเบื้องต้นของพนักงานที่กำลังถูกแก้ไข
  document.getElementById('eval-target-info').innerHTML = `
    <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">พนักงาน</div>
    <div style="font-size:14px;font-weight:500">${ev.target_name}</div>
    <div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px">${ev.target_position || '—'} · ${ev.target_department || '—'}</div>`;

  //? ล้างค่าหน้าการค้นหา
  const searchInput = document.getElementById('eval-search-input');
  if (searchInput) searchInput.value = '';
  const resultsEl = document.getElementById('eval-search-results');
  if (resultsEl) resultsEl.style.display = 'none';

  renderEvalChips(); //? วาดรายการผู้ประเมินที่เป็นเม็ด (Chips)
  document.getElementById('eval-modal').classList.add('on');
}

//? วาดรายการผู้ประเมินในรูปแบบ Chips พร้อมปุ่ม เลื่อนลำดับ และปุ่มลบ
function renderEvalChips() {
  const container = document.getElementById('eval-chips');
  if (!evalCurrentIds.length) {
    container.innerHTML = '<span style="font-size:12px;color:var(--color-text-secondary)">ยังไม่มีผู้ประเมิน</span>';
    return;
  }
  
  const last = evalCurrentIds.length - 1;
  container.innerHTML = evalCurrentIds.map((pid, idx) => {
    const u = allUsersForEval.find(x => x.personal_id === pid);
    const name = u ? u.name : pid;
    const dept = u ? (u.department || '') : '';
    const pidSafe = pid.replace(/'/g, "\\'");
    
    //? เงื่อนไขสำหรับปิดปุ่ม ขึ้น/ลง เมื่ออยู่ที่หัวหรือท้ายแถว
    const disUp = idx === 0 ? 'disabled' : '';
    const disDown = idx === last ? 'disabled' : '';
    
    return `
      <div style="display:flex;align-items:center;gap:5px;background:#E6F1FB;border:0.5px solid #B8CFF0;border-radius:20px;padding:3px 8px 3px 4px;font-size:12px">
        <span style="width:20px;height:20px;border-radius:50%;background:#1059A3;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${idx + 1}</span>
        <span style="color:#0C447C;font-weight:500">${name}</span>
        ${dept ? `<span style="color:#64748b;font-size:10px">${dept}</span>` : ''}
        <div style="display:flex;gap:2px;margin-left:1px">
          <button onclick="moveEvaluator('${pidSafe}',-1)" ${disUp}
            title="เลื่อนขึ้น"
            style="background:none;border:0.5px solid #B8CFF0;border-radius:4px;cursor:pointer;color:#1059A3;font-size:10px;padding:1px 5px;line-height:1.5;opacity:${disUp ? '.35' : '1'}">↑</button>
          <button onclick="moveEvaluator('${pidSafe}',1)" ${disDown}
            title="เลื่อนลง"
            style="background:none;border:0.5px solid #B8CFF0;border-radius:4px;cursor:pointer;color:#1059A3;font-size:10px;padding:1px 5px;line-height:1.5;opacity:${disDown ? '.35' : '1'}">↓</button>
        </div>
        <button onclick="removeEvaluator('${pidSafe}')"
          style="background:none;border:none;cursor:pointer;color:#64748b;font-size:15px;padding:0;line-height:1;margin-left:1px">&times;</button>
      </div>`;
  }).join('');
}

//? ฟังก์ชันสลับลำดับผู้ประเมิน (เพื่อกำหนดว่าใครจะเป็นหัวหน้าลำดับถัดไป)
function moveEvaluator(pid, dir) {
  const idx = evalCurrentIds.indexOf(pid);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= evalCurrentIds.length) return;
  
  //? สลับตำแหน่งในอาร์เรย์
  evalCurrentIds.splice(idx, 1);
  evalCurrentIds.splice(newIdx, 0, pid);
  renderEvalChips(); //? วาดใหม่
}

//? ค้นหาข้อมูลผู้ใช้ที่ตรงกับเงื่อนไขการค้นหา เพื่อเพิ่มเข้าไปในสายบังคับบัญชา
function onEvalSearchInput(value) {
  const q = value.trim().toLowerCase();
  const resultsEl = document.getElementById('eval-search-results');
  if (!q) { resultsEl.style.display = 'none'; return; }

  //? กรองรายชื่อ: ไม่เอาตัวเอง และไม่เอาคนที่อยู่ในลิสต์ผู้ประเมินอยู่แล้ว
  const matches = allUsersForEval
    .filter(u => u.personal_id !== evalTargetId && !evalCurrentIds.includes(u.personal_id))
    .filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q) ||
      (u.position || '').toLowerCase().includes(q)
    )
    .slice(0, 8); //? แสดงผลสูงสุด 8 รายการเพื่อความรวดเร็ว

  if (!matches.length) {
    resultsEl.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--color-text-secondary)">ไม่พบผู้ใช้ที่ตรงกัน</div>';
    resultsEl.style.display = 'block';
    return;
  }

  resultsEl.innerHTML = matches.map(u => {
    const pidSafe = (u.personal_id || '').replace(/'/g, "\\'");
    return `
      <div onclick="selectEvalUser('${pidSafe}')"
        onmouseover="this.style.background='#EEF3FB'" onmouseout="this.style.background=''"
        style="padding:8px 14px;cursor:pointer;border-bottom:0.5px solid var(--color-border-tertiary)">
        <div style="font-size:13px;font-weight:500;color:var(--color-text-primary)">${u.name}</div>
        <div style="font-size:11px;color:var(--color-text-secondary);margin-top:1px">${u.department || '—'} · ${u.position || '—'}</div>
      </div>`;
  }).join('');
  resultsEl.style.display = 'block';
}

//? เลือกผู้ใช้จากการค้นหามาลงในลิสต์ผู้ประเมิน
function selectEvalUser(pid) {
  if (!pid || evalCurrentIds.includes(pid)) return;
  evalCurrentIds.push(pid);
  
  //? รีเซ็ตช่องค้นหา
  const searchInput = document.getElementById('eval-search-input');
  if (searchInput) searchInput.value = '';
  const resultsEl = document.getElementById('eval-search-results');
  if (resultsEl) resultsEl.style.display = 'none';
  
  renderEvalChips(); //? วาดรายการใหม่
}

//? ลบผู้ประเมินออกจากลิสต์
function removeEvaluator(pid) {
  evalCurrentIds = evalCurrentIds.filter(x => x !== pid);
  renderEvalChips();
}

//? ปิด Modal การจัดการสายงาน และล้างสถานะชั่วคราว
function closeEvalModal() {
  document.getElementById('eval-modal').classList.remove('on');
  const searchInput = document.getElementById('eval-search-input');
  if (searchInput) searchInput.value = '';
  const resultsEl = document.getElementById('eval-search-results');
  if (resultsEl) resultsEl.style.display = 'none';
  evalTargetId = null;
  evalCurrentIds = [];
}

async function saveEval() {
  if (!evalTargetId) return;
  try {
    const res = await fetch(`/api/admin/evaluations/${encodeURIComponent(evalTargetId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evaluator_ids: evalCurrentIds })
    });
    if (!res.ok) throw new Error('Error');
    // บันทึกค่าก่อน closeEvalModal() จะรีเซ็ตเป็น null/[]
    const savedTargetId = evalTargetId;
    const savedIds = evalCurrentIds.slice();
    closeEvalModal();
    Swal.fire({ icon:'success', title:'บันทึกสำเร็จ', timer:1500, showConfirmButton:false });
    const evEntry = allEvalsData.find(x => x.target_id === savedTargetId);
    if (evEntry) {
      evEntry.evaluators = savedIds.map((pid) => {
        const u = allUsersForEval.find(x => x.personal_id === pid);
        return {
          evaluator_id: pid,
          name: u ? u.name : pid,
          position: u ? (u.position || '') : '',
          department: u ? (u.department || '') : '',
        };
      });
    }
    _reRenderEvals();
  } catch(e) {
    Swal.fire({ icon:'error', title:'เกิดข้อผิดพลาด', text:'ไม่สามารถบันทึกได้', confirmButtonText:'ตกลง' });
  }
}

// ── Monthly Stats ──────────────────────────────────────────────────────────

let statsCurrentMonth = '';
let collapsedStatsDepts = null; // null = ยังไม่ initialize
let statsData = null;

function _getDefaultMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

function showStatsScreen() {
  document.getElementById('sup-list').style.display = 'none';
  document.getElementById('sup-detail').style.display = 'none';
  document.getElementById('sup-users').style.display = 'none';
  document.getElementById('sup-evals').style.display = 'none';
  const el = document.getElementById('sup-stats');
  el.style.display = 'block';
  _animateIn(el);
  setNavActive('btn-stats-mgmt');
  // set default month = current month
  const picker = document.getElementById('stats-month-picker');
  if (picker && !picker.value) {
    picker.value = _getDefaultMonth();
  }
  const month = picker ? picker.value : _getDefaultMonth();
  loadStats(month);
}

function hideStatsScreen() {
  document.getElementById('sup-stats').style.display = 'none';
  document.getElementById('sup-list').style.display = 'block';
}

//? ฟังก์ชันหลักในการโหลดสถิติ
async function loadStats(month) {
  if (!month) return;
  statsCurrentMonth = month;
  collapsedStatsDepts = null; //? รีเซ็ตการย่อหน่วยงาน
  
  //? แสดง Loading สปินเนอร์
  document.getElementById('stats-rows').innerHTML =
    '<div class="ld-wrap"><div class="ld-spin"></div><span class="ld-dots">กำลังโหลด</span></div>';
    
  //? รีเซ็ตตัวเลข KPI (Dash) เป็นเครื่องหมาย — ก่อนแสดงค่าใหม่
  ['sk-users','sk-submitted','sk-compliance','sk-progress'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });

  try {
    //? เรียก API ดึงสถิติรายเดือน
    const res = await fetch(`/api/admin/stats?month=${encodeURIComponent(month)}`);
    if (!res.ok) throw new Error('Forbidden');
    statsData = await res.json();
    renderStats(statsData); //? วาดตารางและอัปเดต KPI
  } catch(e) {
    document.getElementById('stats-rows').innerHTML =
      '<div style="text-align:center;color:#e24b4a;padding:1.5rem">ไม่สามารถโหลดข้อมูลได้</div>';
  }
}

//? ฟังก์ชันหลักในการวาด (Render) ข้อมูลสถิติลงในตารางหลัก
function renderStats(data, isFiltered = false) {
  const users = data.users;
  const weekdays = data.weekdays;

  //? --- ส่วนการคำนวณ KPI สรุปภาพรวม (Aggregation) ---
  const totalUsers = users.length;
  //? หาจำนวนความถี่ในการส่งงานรวมของทุกคน
  const totalSubmitted = users.reduce((s, u) => s + u.days_submitted, 0);
  //? ค่าเฉลี่ย Compliance (วินัยในการส่งรายงาน)
  const avgCompliance = totalUsers > 0
    ? Math.round(users.reduce((s, u) => s + u.compliance, 0) / totalUsers * 10) / 10
    : 0;
  
  //? ค่าเฉลี่ยความก้าวหน้า (Avg Progress) กรองเฉพาะผู้ที่ "เคยส่งงาน" เท่านั้น
  const activeUsers = users.filter(u => u.days_submitted > 0);
  const avgProgress = activeUsers.length > 0
    ? Math.round(activeUsers.reduce((s, u) => s + u.avg_progress, 0) / activeUsers.length * 10) / 10
    : 0;

  //? อัปเดตตัวเลขใส่ลงใน Card สรุป (สี่เหลี่ยมด้านบน)
  const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setKpi('sk-users', totalUsers);
  setKpi('sk-submitted', totalSubmitted);
  setKpi('sk-compliance', `${avgCompliance}%`);
  setKpi('sk-progress', `${avgProgress}%`);

  if (!users.length) {
    document.getElementById('stats-rows').innerHTML =
      '<div style="text-align:center;color:var(--color-text-secondary);padding:1.5rem">ไม่มีข้อมูลในเดือนนี้</div>';
    return;
  }

  //? จัดกลุ่มตามแผนก (Department) เพื่อความสวยงามของตารางสถิติ
  const groups = {};
  users.forEach(u => {
    const dept = u.department || 'ไม่ระบุหน่วยงาน';
    if (!groups[dept]) groups[dept] = [];
    groups[dept].push(u);
  });

  //? ตั้งค่าการย่อ/ขยายเริ่มต้น
  if (collapsedStatsDepts === null) {
    collapsedStatsDepts = new Set(Object.keys(groups));
  }

  //? ฟังก์ชันตัวช่วยเลือกสีตามค่าเฉลี่ย (%) เพื่อแสดงผลแบบไฟจราจร
  const compColor = v => v >= 80 ? '#D4EDDA;color:#1A5C28' : v >= 50 ? '#FFF3CD;color:#665200' : '#F8D7DA;color:#721C24';
  const progColor = v => v >= 80 ? '#D4EDDA;color:#1A5C28' : v >= 40 ? '#FFF3CD;color:#665200' : '#F8D7DA;color:#721C24';

  let html = `
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px">
      <thead>
        <tr style="background:#F3EEE8;border-bottom:1.5px solid #C9A96E">
          <th style="padding:7px 10px;text-align:left;font-size:10px;color:#5D4A2E;font-weight:700;white-space:nowrap">ชื่อ-สกุล / ตำแหน่ง</th>
          <th style="padding:7px 8px;text-align:center;font-size:10px;color:#5D4A2E;font-weight:700;white-space:nowrap">ส่งรายงาน<br><span style="font-weight:400;color:#8C7A5E">/ ${weekdays} วัน</span></th>
          <th style="padding:7px 8px;text-align:center;font-size:10px;color:#5D4A2E;font-weight:700;white-space:nowrap">Compliance</th>
          <th style="padding:7px 8px;text-align:center;font-size:10px;color:#5D4A2E;font-weight:700;white-space:nowrap">Avg Progress</th>
          <th style="padding:7px 8px;text-align:center;font-size:10px;color:#5D4A2E;font-weight:700;white-space:nowrap">รูปแบบทำงาน<br><span style="font-weight:400;color:#8C7A5E">WFH / On-site / Hybrid</span></th>
          <th style="padding:7px 8px;text-align:center;font-size:10px;color:#5D4A2E;font-weight:700;white-space:nowrap">งานเสร็จ<br><span style="font-weight:400;color:#8C7A5E">/ ทั้งหมด</span></th>
          <th style="padding:7px 8px;text-align:center;font-size:10px;color:#5D4A2E;font-weight:700;white-space:nowrap">มีปัญหา<br><span style="font-weight:400;color:#8C7A5E">(วัน)</span></th>
        </tr>
      </thead>
      <tbody>`;

  Object.entries(groups).forEach(([dept, members]) => {
    const isCollapsed = !isFiltered && collapsedStatsDepts.has(dept);
    const icon = isCollapsed ? '▶' : '▼';
    const deptSafe = dept.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    //? ส่วนหัวของแต่ละแผนกในตารางสถิติ
    html += `
      <tr style="background:#F3EEE8;border-top:1px solid #DDD0C0;cursor:pointer;user-select:none"
        onclick="toggleStatsDeptCollapse('${deptSafe}')">
        <td colspan="7" style="padding:7px 12px">
          <span style="font-size:9px;color:#8C7A5E;margin-right:5px">${icon}</span>
          <span style="font-size:11px;font-weight:700;color:#5D4A2E">${dept}</span>
          <span style="font-size:10px;color:#8C7A5E;margin-left:6px">${members.length} คน</span>
        </td>
      </tr>`;

    if (!isCollapsed) {
      members.forEach((u, idx) => {
        const rowBg = idx % 2 === 0 ? '#FAFBFC' : '#FFFFFF';
        const cc = compColor(u.compliance);
        const pc = progColor(u.avg_progress);
        
        //? ข้อมูลสถิติของพนักงานรายคน
        html += `
          <tr style="background:${rowBg};border-bottom:0.5px solid var(--color-border-tertiary)">
            <td style="padding:8px 10px">
              <div style="font-size:12px;font-weight:500;color:var(--color-text-primary)">${u.name}</div>
              <div style="font-size:10px;color:var(--color-text-secondary);margin-top:1px">${u.position || '—'}</div>
            </td>
            <td style="padding:8px;text-align:center;font-size:12px;font-weight:600">${u.days_submitted}</td>
            <td style="padding:8px;text-align:center">
              <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:${cc.split(';')[0]};${cc.split(';')[1]}">${u.compliance}%</span>
            </td>
            <td style="padding:8px;text-align:center">
              <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:${pc.split(';')[0]};${pc.split(';')[1]}">${u.avg_progress > 0 ? u.avg_progress + '%' : '—'}</span>
            </td>
            <td style="padding:8px;text-align:center;font-size:11px;color:var(--color-text-secondary)">
              ${u.wfh_days > 0 ? `<span style="color:#0C447C">WFH ${u.wfh_days}</span>` : ''}
              ${u.onsite_days > 0 ? `${u.wfh_days > 0 ? ' · ' : ''}<span style="color:#5D4A2E">On-site ${u.onsite_days}</span>` : ''}
              ${u.hybrid_days > 0 ? `${(u.wfh_days + u.onsite_days) > 0 ? ' · ' : ''}<span style="color:#3C3489">Hybrid ${u.hybrid_days}</span>` : ''}
              ${u.wfh_days + u.onsite_days + u.hybrid_days === 0 ? '—' : ''}
            </td>
            <td style="padding:8px;text-align:center;font-size:12px">
              ${u.total_tasks > 0 ? `<span style="font-weight:600">${u.done_tasks}</span><span style="color:var(--color-text-secondary)"> / ${u.total_tasks}</span>` : '—'}
            </td>
            <td style="padding:8px;text-align:center;font-size:12px">
              ${u.problem_days > 0 ? `<span style="color:#E24B4A;font-weight:600">${u.problem_days}</span>` : '<span style="color:#1D9E75">—</span>'}
            </td>
          </tr>`;
      });
    }
  });

  html += '</tbody></table></div>';
  document.getElementById('stats-rows').innerHTML = html;
}

//? สลับสถานะ ยุบ/ขยาย (Collapse/Expand) ของแผนกในหน้าตารางสถิติ
function toggleStatsDeptCollapse(dept) {
  if (!collapsedStatsDepts) collapsedStatsDepts = new Set();
  
  if (collapsedStatsDepts.has(dept)) {
    collapsedStatsDepts.delete(dept); //? ขยาย
  } else {
    collapsedStatsDepts.add(dept);    //? ยุบ
  }
  
  //? วาดตารางใหม่เพื่อสะท้อนสถานะปัจจุบัน
  if (statsData) renderStats(statsData, false);
}

/* ── ส่วนการส่งออกข้อมูลสถิติ (Export Monthly Stats Excel) ── */
//? ฟังก์ชันแปลงข้อมูลตารางสถิติรายเดือนเป็นไฟล์ Excel และสั่งดาวน์โหลด
async function exportStatsExcel() {
  const month = (document.getElementById('stats-month-picker') || {}).value || _getDefaultMonth();
  const btn = document.getElementById('btn-export-excel');
  const origText = btn ? btn.innerHTML : '';
  
  try {
    if (btn) {
      btn.disabled = true;
      //? แสดง Spinner ขณะรอการประมวลผลจาก Backend
      btn.innerHTML = '<span class="ld-spin" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px"></span>กำลังดาวน์โหลด...';
    }
    
    //? ยิงคำขอไปยัง Endpoint สำหรับ Export สถิติเฉพาะเดือนที่เลือก
    const res = await fetch(`/api/admin/stats/export?month=${encodeURIComponent(month)}`);
    if (!res.ok) throw new Error('Export failed');
    
    //? รับข้อมูลเป็น Blob (Binary Large Object) เพื่อจัดการไฟล์บนหน่วยความจำ Browser
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    
    //? สร้าง Element สำหรับดาวน์โหลด และสั่ง Click อัตโนมัติ
    const a = document.createElement('a');
    a.href = url;
    a.download = `stats_${month}.xlsx`; //? ตั้งชื่อไฟล์เป็น 'stats_YYYY-MM.xlsx'
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url); //? คืนหน่วยความจำเมื่อดาวน์โหลดเสร็จ
    
    if (btn) { 
      btn.innerHTML = '✓ ดาวน์โหลดแล้ว'; 
      setTimeout(() => { btn.innerHTML = origText; btn.disabled = false; }, 2000); 
    }
  } catch(e) {
    alert('ไม่สามารถดาวน์โหลดไฟล์ได้');
    if (btn) { btn.innerHTML = origText; btn.disabled = false; }
  }
}

/* ── ระบบออกรายงานรายงานประจำวันละเอียด (Export Daily Report Details) ── */
//? ฟังก์ชันสำหรับดาวน์โหลดรายงานของพนักงาน "ทุกคนในวันที่กำหนด" ในรูปแบบ Excel (.xlsx)
//? ข้อมูลจะประกอบด้วย รายละเอียดงาน ปัญหา Progress และรูปแบบการทำงานอย่างละเอียด
async function exportDailyReportExcel() {
  const dateEl = document.getElementById('s-date-filter');
  const dateVal = dateEl ? dateEl.value : getTodayStr(); //? หากไม่เลือกวัน ให้ใช้ค่าวันปัจจุบัน
  if (!dateVal) { alert('กรุณาเลือกวันที่'); return; }
  
  const btn = document.querySelector('[onclick="exportDailyReportExcel()"]');
  const origText = btn ? btn.innerHTML : '';
  
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="ld-spin" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:4px"></span>กำลังโหลด...';
    }
    
    //? เรียก API เพื่อดึง Blob (Binary File) ของ Excel
    const res = await fetch(`/api/admin/reports/export?date=${encodeURIComponent(dateVal)}`);
    if (!res.ok) throw new Error('Export failed');
    
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    
    //? สร้างลิงก์หลอกขึ้นมาใน DOM และทำการจำลองการคลิก (Trigger Click) เพื่อดาวน์โหลดไฟล์
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily_report_${dateVal}.xlsx`; //? ตั้งชื่อไฟล์ตามวันที่เลือก
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url); //? ล้างหน่วยความจำ Blob หลังจากดาวน์โหลดเสร็จ
    
    //? ยืนยันสถานะสำเร็จชั่วคราวบนปุ่ม
    if (btn) { btn.innerHTML = '✓ สำเร็จ'; setTimeout(() => { btn.innerHTML = origText; btn.disabled = false; }, 2000); }
  } catch(e) {
    alert('ไม่สามารถดาวน์โหลดไฟล์ได้');
    if (btn) { btn.innerHTML = origText; btn.disabled = false; }
  }
}

/* ════════════════════════════════════════════════════════════════
   ANNOUNCEMENT MANAGEMENT (Super Admin เท่านั้น)
   ════════════════════════════════════════════════════════════════ */

//? แสดงหน้าจัดการประกาศ — ซ่อน view อื่นทั้งหมด
function showAnnScreen() {
  ['sup-list','sup-detail','sup-users','sup-evals','sup-stats'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const el = document.getElementById('sup-ann');
  el.style.display = 'block';
  _animateIn(el);
  setNavActive('btn-ann-mgmt');
  loadAnnManagement();
}

//? กลับ Dashboard หลัก
function hideAnnScreen() {
  document.getElementById('sup-ann').style.display = 'none';
  const el = document.getElementById('sup-list');
  el.style.display = 'block';
  _animateIn(el);
  setNavActive(null);
}

//? โหลดรายการประกาศทั้งหมด (admin=1 เพื่อดูรวม inactive)
async function loadAnnManagement() {
  const rows = document.getElementById('ann-rows');
  rows.innerHTML = '<div class="ld-wrap"><div class="ld-spin"></div><span class="ld-dots">กำลังโหลด</span></div>';
  try {
    const res = await fetch('/api/announcements?admin=1');
    if (!res.ok) throw new Error();
    const anns = await res.json();
    _annsList = anns;
    renderAnnManagementTable(anns);
  } catch(e) {
    rows.innerHTML = '<div style="text-align:center;color:#e24b4a;padding:1.5rem">ไม่สามารถโหลดข้อมูลได้</div>';
  }
}

//? แสดงตารางรายการประกาศ
function renderAnnManagementTable(anns) {
  const rows = document.getElementById('ann-rows');
  if (!anns.length) {
    rows.innerHTML = '<div style="text-align:center;color:var(--color-text-secondary);padding:1.5rem">ยังไม่มีประกาศ</div>';
    return;
  }
  const targetLabel = { all: 'ทั้งหมด', employee: 'พนักงาน', admin: 'แอดมิน' };
  rows.innerHTML = anns.map(a => `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:0.5px solid var(--color-border-tertiary)">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-size:13px;font-weight:600">${a.title}</span>
          <span class="bdg ${a.is_active ? 'bdg-green' : 'bdg-gray'}">${a.is_active ? 'เปิด' : 'ปิด'}</span>
          <span class="bdg bdg-blue">${targetLabel[a.target] || a.target}</span>
        </div>
        <div style="font-size:12px;color:var(--color-text-secondary);line-height:1.5;white-space:pre-wrap;max-height:48px;overflow:hidden">${a.body}</div>
        <div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px">โดย: ${a.created_by} · ${a.created_at}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
        <button class="fb" onclick="openEditAnnModal('${a.id}')">แก้ไข</button>
        <button class="fb" onclick="toggleAnnActive('${a.id}', ${!a.is_active})">${a.is_active ? 'ปิด' : 'เปิด'}</button>
        <button class="fb" style="color:#e24b4a;border-color:#f5c0c0" onclick="deleteAnn('${a.id}')">ลบ</button>
      </div>
    </div>`).join('');
}

//? เปิด Modal สร้างประกาศใหม่
function openCreateAnnModal() {
  annEditId = null;
  document.getElementById('ann-form-title').textContent = '📢 สร้างประกาศใหม่';
  document.getElementById('ann-f-title').value = '';
  document.getElementById('ann-f-body').value = '';
  document.getElementById('ann-f-target').value = 'all';
  document.getElementById('ann-f-active').checked = true;
  document.getElementById('ann-form-modal').classList.add('on');
}

//? เปิด Modal แก้ไขประกาศที่มีอยู่
function openEditAnnModal(id) {
  const a = _annsList.find(x => x.id === id);
  if (!a) return;
  annEditId = id;
  document.getElementById('ann-form-title').textContent = '📢 แก้ไขประกาศ';
  document.getElementById('ann-f-title').value = a.title;
  document.getElementById('ann-f-body').value = a.body;
  document.getElementById('ann-f-target').value = a.target;
  document.getElementById('ann-f-active').checked = a.is_active;
  document.getElementById('ann-form-modal').classList.add('on');
}

window.closeAnnFormModal = function() {
  document.getElementById('ann-form-modal').classList.remove('on');
};

//? บันทึกประกาศ (POST = สร้างใหม่, PATCH = แก้ไข)
async function saveAnnouncement() {
  const title = document.getElementById('ann-f-title').value.trim();
  const body  = document.getElementById('ann-f-body').value.trim();
  const target = document.getElementById('ann-f-target').value;
  const is_active = document.getElementById('ann-f-active').checked;

  if (!title || !body) {
    Swal.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูลให้ครบ', text: 'หัวข้อและเนื้อหาเป็นข้อมูลที่จำเป็น', confirmButtonColor: '#1059A3' });
    return;
  }

  const url    = annEditId ? `/api/announcements/${annEditId}` : '/api/announcements';
  const method = annEditId ? 'PATCH' : 'POST';
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, target, is_active })
    });
    if (!res.ok) throw new Error();
    closeAnnFormModal();
    loadAnnManagement();
  } catch(e) {
    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกประกาศได้', confirmButtonColor: '#1059A3' });
  }
}

//? สลับสถานะ active/inactive ของประกาศ
async function toggleAnnActive(id, newState) {
  try {
    const res = await fetch(`/api/announcements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: newState })
    });
    if (!res.ok) throw new Error();
    loadAnnManagement();
  } catch(e) {
    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', confirmButtonColor: '#1059A3' });
  }
}

//? ลบประกาศ (ต้องยืนยันก่อน)
async function deleteAnn(id) {
  const result = await Swal.fire({
    title: 'ยืนยันการลบ?',
    text: 'ประกาศนี้จะถูกลบออกถาวร ไม่สามารถกู้คืนได้',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#e74c3c',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ลบเลย',
    cancelButtonText: 'ยกเลิก'
  });
  if (!result.isConfirmed) return;
  try {
    const res = await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    loadAnnManagement();
  } catch(e) {
    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', confirmButtonColor: '#1059A3' });
  }
}

/* ── ระบบรีวิวแผนงานรายสัปดาห์ (Admin Plan Review) ── */

//? helpers (คัดลอกมาจาก emp.js เพราะไม่มี shared utils file)
function _getMondayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _getWeekDates(mondayStr) {
  const dates = [];
  const d = new Date(mondayStr + 'T00:00:00');
  for (let i = 0; i < 6; i++) {
    dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}
function _formatReviewWeekLabel(mondayStr) {
  const dates = _getWeekDates(mondayStr);
  const s = new Date(dates[0] + 'T00:00:00');
  const e = new Date(dates[5] + 'T00:00:00');
  return `${s.getDate()} ${thM[s.getMonth()]} — ${e.getDate()} ${thM[e.getMonth()]} ${e.getFullYear()+543}`;
}

//? แสดงหน้ารีวิวแผนงาน
function showPlansScreen() {
  ['sup-list','sup-detail','sup-users','sup-evals','sup-stats','sup-ann'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const el = document.getElementById('sup-plans');
  el.style.display = 'block';
  _animateIn(el);
  setNavActive('btn-plans-mgmt');
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  reviewWeekStart = _getMondayOfWeek(todayStr);
  loadPlansReview();
}

//? ซ่อนหน้ารีวิวแผนงาน กลับหน้า Dashboard
function hidePlansScreen() {
  document.getElementById('sup-plans').style.display = 'none';
  const el = document.getElementById('sup-list');
  el.style.display = 'block';
  _animateIn(el);
  setNavActive(null);
}

//? เลื่อนสัปดาห์ในหน้ารีวิว
function navigateReviewWeek(delta) {
  const d = new Date(reviewWeekStart + 'T00:00:00');
  d.setDate(d.getDate() + delta * 7);
  reviewWeekStart = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  loadPlansReview();
}

//? ดึงแผนของลูกน้องทั้งหมดสำหรับสัปดาห์ที่ระบุ
async function loadPlansReview() {
  document.getElementById('review-week-label').textContent = _formatReviewWeekLabel(reviewWeekStart);
  const container = document.getElementById('plans-review-container');
  container.innerHTML = '<div class="ld-wrap"><div class="ld-spin"></div><span class="ld-dots">กำลังโหลด</span></div>';
  try {
    const res = await fetch(`/api/plans/subordinates?week=${reviewWeekStart}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Load failed');
    const plans = await res.json();
    renderPlansReview(plans);
  } catch(e) {
    container.innerHTML = '<div style="padding:1rem;color:var(--color-text-secondary);font-size:13px;text-align:center">ไม่สามารถโหลดแผนงานได้</div>';
  }
}

//? ชื่อวันสั้น (จ,อ,พ,พฤ,ศ,ส) สำหรับ day-badges ในหน้ารีวิว
const _dayShortSup = ['จ','อ','พ','พฤ','ศ','ส'];

//? แปลง list ของ YYYY-MM-DD → HTML day badges "จ อ พ"
function _activeDaysBadges(activeDays) {
  if (!activeDays || !activeDays.length) return '<span style="font-size:11px;color:var(--color-text-secondary)">—</span>';
  return activeDays.map(ds => {
    try {
      const d = new Date(ds + 'T00:00:00');
      const wi = d.getDay(); // 0=อา,1=จ,...,6=ส
      const idx = wi === 0 ? 6 : wi - 1; // แปลง: จ=0,อ=1,...,ส=5
      return `<span class="day-badge">${_dayShortSup[idx]}</span>`;
    } catch { return ''; }
  }).join('');
}

//? วาดหน้ารีวิวแผนงานเชิงพัฒนา — card ต่อพนักงาน (flat task list + day badges)
function renderPlansReview(plans) {
  const container = document.getElementById('plans-review-container');
  if (!plans.length) {
    container.innerHTML = '<div style="padding:1.5rem;color:var(--color-text-secondary);font-size:13px;text-align:center">ไม่มีแผนงานสำหรับสัปดาห์นี้</div>';
    return;
  }

  container.innerHTML = '';
  plans.forEach(plan => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'padding:.875rem 1.25rem;margin-bottom:.875rem';

    const tasks = plan.tasks || [];
    let tasksHtml = '';
    tasks.forEach((t, i) => {
      const isApproved = t.approved === true;
      const isRejected = !t.approved && !!t.approved_by;
      //? inReport: อนุมัติแล้วและถูก inject ลงใน report อย่างน้อย 1 วัน — ล็อกไม่ให้ยกเลิก
      const inReport = isApproved && t.in_report === true;
      const byText = t.approved_by
        ? `<span style="font-size:11px;color:${isApproved ? '#388E3C' : '#C62828'};align-self:center">โดย ${escHtmlSup(t.approved_by)}</span>`
        : '';
      const actionBtns = inReport
        ? `<span class="plan-inprogress-tag">⋯ อยู่ระหว่างดำเนินการ</span>${byText}`
        : `<button class="plan-approval-btn${isApproved ? ' apt-active' : ''}"
                  onclick="approveTask('${plan.id}',${t.id},true,this)">✓ อนุมัติ</button>
           <button class="plan-approval-btn${isRejected ? ' rej-active' : ''}"
                  onclick="approveTask('${plan.id}',${t.id},false,this)">✗ ไม่อนุมัติ</button>
           ${byText}`;
      tasksHtml += `
      <div class="plan-task-row">
        <span class="plan-task-num">${i+1}</span>
        <div class="plan-task-body">
          <div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:1px">ชื่องาน</div>
          <div style="font-size:13px;font-weight:500">${escHtmlSup(t.title)}</div>
          <div style="font-size:12px;margin-top:4px;display:flex;align-items:center;gap:5px;flex-wrap:wrap">
            <span style="color:var(--color-text-secondary)">วันที่ทำงาน:</span>
            ${_activeDaysBadges(t.active_days)}
          </div>
          ${t.description ? `<div style="font-size:12px;margin-top:3px"><span style="color:var(--color-text-secondary)">คำอธิบายงาน:</span> ${escHtmlSup(t.description)}</div>` : ''}
          ${t.goal   ? `<div style="font-size:12px;margin-top:3px"><span style="color:var(--color-text-secondary)">เป้าหมาย:</span> ${escHtmlSup(t.goal)}</div>` : ''}
          ${t.output ? `<div style="font-size:12px"><span style="color:var(--color-text-secondary)">ผลผลิต:</span> ${escHtmlSup(t.output)}</div>` : ''}
          ${(t.kpi_name || t.kpi_target) ? `
          <div style="font-size:12px;display:flex;gap:12px;flex-wrap:wrap">
            ${t.kpi_name   ? `<span><span style="color:var(--color-text-secondary)">ตัวชี้วัด:</span> ${escHtmlSup(t.kpi_name)}</span>` : ''}
            ${t.kpi_target ? `<span><span style="color:var(--color-text-secondary)">ค่าเป้าหมาย:</span> ${escHtmlSup(t.kpi_target)}</span>` : ''}
          </div>` : ''}
          <div style="display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap">
            ${actionBtns}
          </div>
        </div>
      </div>`;
    });

    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:.75rem">
        <div class="av av-teal" style="width:28px;height:28px;font-size:11px;flex-shrink:0">${getInitials(plan.user_name || '?')}</div>
        <div>
          <div style="font-size:13px;font-weight:600">${escHtmlSup(plan.user_name || '—')}</div>
          <div style="font-size:11px;color:var(--color-text-secondary)">${escHtmlSup(plan.department || '')}</div>
        </div>
      </div>
      ${tasksHtml || '<div style="font-size:12px;color:var(--color-text-secondary)">ไม่มีงานในสัปดาห์นี้</div>'}`;

    container.appendChild(card);
  });
}

function escHtmlSup(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

//? อนุมัติหรือไม่อนุมัติงานในแผนเชิงพัฒนา — optimistic update (อัปเดต DOM ทันที ไม่ต้อง reload ทั้งหน้า)
async function approveTask(planId, taskId, approved, btn) {
  const container   = btn.closest('div');
  const [aptBtn, rejBtn] = container.querySelectorAll('.plan-approval-btn');
  const bySpan      = container.querySelector('span[style*="align-self"]');

  //? บันทึกสถานะเดิมไว้ก่อน เพื่อ revert ถ้า API fail
  const prevAptClass = aptBtn.className;
  const prevRejClass = rejBtn.className;
  const prevByHtml   = bySpan ? bySpan.outerHTML : '';

  //? ป้องกันกดซ้ำระหว่างรอ API
  aptBtn.disabled = rejBtn.disabled = true;

  //? อัปเดต UI ทันที (optimistic)
  aptBtn.className = `plan-approval-btn${approved ? ' apt-active' : ''}`;
  rejBtn.className = `plan-approval-btn${!approved ? ' rej-active' : ''}`;
  const byName = currentUser && currentUser.name ? escHtmlSup(currentUser.name) : '';
  if (bySpan) {
    bySpan.style.color = approved ? '#388E3C' : '#C62828';
    bySpan.textContent = byName ? `โดย ${byName}` : '';
  } else if (byName) {
    const s = document.createElement('span');
    s.style.cssText = `font-size:11px;color:${approved ? '#388E3C' : '#C62828'};align-self:center`;
    s.textContent = `โดย ${byName}`;
    container.appendChild(s);
  }

  try {
    const res = await fetch(`/api/plans/${planId}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, approved })
    });
    if (!res.ok) {
      //! 409: งานอยู่ระหว่างดำเนินการแล้ว — ยกเลิกอนุมัติไม่ได้
      const errMsg = res.status === 409
        ? 'ไม่สามารถยกเลิกการอนุมัติได้ เนื่องจากงานนี้อยู่ระหว่างดำเนินการในรายงานแล้ว'
        : 'ไม่สามารถอัปเดตสถานะการอนุมัติได้';
      throw Object.assign(new Error(errMsg), { status: res.status });
    }
  } catch(e) {
    //! fail — คืนค่าเดิมทั้งหมด
    aptBtn.className = prevAptClass;
    rejBtn.className = prevRejClass;
    const newBy = container.querySelector('span[style*="align-self"]');
    if (newBy && !prevByHtml) newBy.remove();
    else if (newBy && prevByHtml) newBy.outerHTML = prevByHtml;
    const icon = e.status === 409 ? 'warning' : 'error';
    const title = e.status === 409 ? 'ไม่สามารถดำเนินการได้' : 'เกิดข้อผิดพลาด';
    Swal.fire({ icon, title, text: e.message || 'ไม่สามารถอัปเดตสถานะการอนุมัติได้', confirmButtonColor: '#1059A3' });
  } finally {
    aptBtn.disabled = rejBtn.disabled = false;
  }
}

/* ── ส่งออก Excel แผนงาน (Plans Export) ── */
//? ส่งออกแผนงานของสัปดาห์ที่กำลังดูอยู่เป็นไฟล์ Excel
async function exportPlansWeekly() {
  const btn = document.getElementById('btn-export-plans-week');
  const origText = btn ? btn.innerHTML : '';
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="ld-spin" style="width:13px;height:13px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:5px"></span>กำลังดาวน์โหลด...';
    }
    const res = await fetch(`/api/plans/export/weekly?week=${reviewWeekStart}`);
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `plans_weekly_${reviewWeekStart}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (btn) { btn.innerHTML = '✓ ดาวน์โหลดแล้ว'; setTimeout(() => { btn.innerHTML = origText; btn.disabled = false; }, 2000); }
  } catch(e) {
    alert('ไม่สามารถดาวน์โหลดไฟล์ได้');
    if (btn) { btn.innerHTML = origText; btn.disabled = false; }
  }
}

//? ส่งออกแผนงานทั้งเดือน (เลือกเดือนจาก input #plans-export-month) เป็นไฟล์ Excel
async function exportPlansMonthly() {
  const monthEl = document.getElementById('plans-export-month');
  const month   = (monthEl && monthEl.value) ? monthEl.value : _getDefaultMonth();
  const btn     = document.getElementById('btn-export-plans-month');
  const origText = btn ? btn.innerHTML : '';
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="ld-spin" style="width:13px;height:13px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:5px"></span>กำลังดาวน์โหลด...';
    }
    const res = await fetch(`/api/plans/export/monthly?month=${encodeURIComponent(month)}`);
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `plans_monthly_${month}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (btn) { btn.innerHTML = '✓ ดาวน์โหลดแล้ว'; setTimeout(() => { btn.innerHTML = origText; btn.disabled = false; }, 2000); }
  } catch(e) {
    alert('ไม่สามารถดาวน์โหลดไฟล์ได้');
    if (btn) { btn.innerHTML = origText; btn.disabled = false; }
  }
}


/* ══════════════════════════════════════════════════════
   ระบบพลังงาน/ค่าน้ำมัน (Admin Fuel View)
   ══════════════════════════════════════════════════════ */

//? helper: คืนเดือนปัจจุบันในรูปแบบ YYYY-MM
function _getDefaultMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

//? แสดงหน้าจอพลังงาน ซ่อนทุก section อื่น
function showFuelScreen() {
  ['sup-list','sup-detail','sup-users','sup-evals','sup-stats','sup-ann','sup-plans'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const el = document.getElementById('sup-fuel');
  el.style.display = 'block';
  _animateIn(el);
  setNavActive('btn-fuel-mgmt');
  const picker = document.getElementById('fuel-admin-month');
  if (picker && !picker.value) picker.value = _getDefaultMonth();
  loadFuelAdminData(picker ? picker.value : _getDefaultMonth());
}

//? กลับ Dashboard จากหน้าพลังงาน
function hideFuelScreen() {
  document.getElementById('sup-fuel').style.display = 'none';
  const el = document.getElementById('sup-list');
  el.style.display = 'block';
  _animateIn(el);
  setNavActive(null);
}

//? โหลดข้อมูลประหยัดค่าน้ำมันทุกคนจาก API
async function loadFuelAdminData(month) {
  if (!month) return;
  const rows = document.getElementById('fuel-admin-rows');
  if (rows) rows.innerHTML = '<div class="ld-wrap"><div class="ld-spin"></div><span class="ld-dots">กำลังโหลด</span></div>';
  try {
    const res = await fetch(`/api/fuel/savings/all?month=${encodeURIComponent(month)}`);
    if (!res.ok) throw new Error('Forbidden');
    const data = await res.json();
    renderFuelAdminRows(data);
  } catch (e) {
    if (rows) rows.innerHTML = '<div style="text-align:center;color:#e24b4a;padding:1.5rem">ไม่สามารถโหลดข้อมูลได้</div>';
  }
}

//? แสดงตารางข้อมูลประหยัดค่าน้ำมันรายบุคคล
function renderFuelAdminRows(data) {
  const rows = document.getElementById('fuel-admin-rows');
  if (!rows) return;
  if (!data.users || data.users.length === 0) {
    rows.innerHTML = '<div style="text-align:center;color:var(--color-text-secondary);padding:1.5rem">ยังไม่มีผู้ใช้บันทึกข้อมูลการเดินทาง</div>';
    return;
  }
  const totalSavings = data.users.reduce((s, u) => s + u.monthly_savings, 0);
  let html = `
    <div class="stat-grid" style="margin-bottom:.75rem">
      <div class="stat"><div class="sn">${data.users.length}</div><div class="sl">บันทึกข้อมูลแล้ว (คน)</div></div>
      <div class="stat"><div class="sn sg">${totalSavings.toFixed(0)}</div><div class="sl">รวมประหยัด/เดือน (บาท)</div></div>
    </div>
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:var(--color-background-secondary);font-size:11px;color:var(--color-text-secondary)">
          <th style="padding:7px 10px;text-align:left">ชื่อ-สกุล</th>
          <th style="padding:7px 10px;text-align:center">หน่วยงาน</th>
          <th style="padding:7px 10px;text-align:right">วัน WFH</th>
          <th style="padding:7px 10px;text-align:right">ค่าน้ำมัน/วัน</th>
          <th style="padding:7px 10px;text-align:right">รวม/วัน</th>
          <th style="padding:7px 10px;text-align:right">ประหยัด/เดือน</th>
        </tr>
      </thead>
      <tbody>`;
  data.users.forEach((u, i) => {
    const bg = i % 2 === 0 ? '' : 'background:#f9fafb';
    html += `
      <tr style="${bg}">
        <td style="padding:7px 10px">${u.name}</td>
        <td style="padding:7px 10px;text-align:center;font-size:11px;color:var(--color-text-secondary)">${u.department}</td>
        <td style="padding:7px 10px;text-align:right">${u.wfh_days}</td>
        <td style="padding:7px 10px;text-align:right">${u.daily_fuel_cost.toFixed(2)}</td>
        <td style="padding:7px 10px;text-align:right">${u.daily_total_cost.toFixed(2)}</td>
        <td style="padding:7px 10px;text-align:right;font-weight:600;color:#1D9E75">${u.monthly_savings.toFixed(2)}</td>
      </tr>`;
  });
  html += '</tbody></table></div>';
  rows.innerHTML = html;
}
