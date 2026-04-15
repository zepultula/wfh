/**
 * Site Header — ส่วนหัวระบบ
 * แก้ไขชื่อระบบ / ชื่อมหาวิทยาลัยที่ไฟล์นี้เพียงแห่งเดียว
 */
//? IIFE (Immediately Invoked Function Expression) เพื่อสร้าง Header และจัดการปุ่ม Logout ทันทีที่โหลดสคริปต์
(function () {
  const header = document.createElement('header');
  header.className = 'site-header';
  //? กำหนดรูปแบบ HTML ของ Header (Logo, ชื่อโครงการ, และปุ่มออกจากระบบ)
  header.innerHTML = `
    <div class="site-header-inner" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="site-header-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
            <rect x="9" y="3" width="6" height="4" rx="1" stroke="#fff" stroke-width="1.8"/>
            <path d="M9 12h6M9 16h4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="site-header-text">
          <div class="site-header-title">ระบบรายงานผลการปฏิบัติงานประจำวัน</div>
          <div class="site-header-sub">มหาวิทยาลัยเทคโนโลยีราชมงคลล้านนา ตาก</div>
        </div>
      </div>
      <div>
        <button id="logoutBtn" style="display:none; background:rgba(255,255,255,0.2); color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:13px; font-family:inherit;">ออกจากระบบ</button>
      </div>
    </div>
  `;
  //? นำ Header ไปใส่ไว้บนสุดของ <body>
  document.body.prepend(header);

  //? ตรวจสอบสถานะการ Login: หากพบ Token ในเครื่อง ให้แสดงปุ่มออกจากระบบ
  if (localStorage.getItem('auth_token')) {
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.style.display = 'block';
    logoutBtn.addEventListener('click', () => {
      //? ส่งไปหน้า /logout ซึ่งจะเคลียร์ token และแสดงข้อความ logout สำเร็จ
      window.location.href = '/logout';
    });
  }
})();

//? ระบบ Fetch Interceptor — หัวใจหลักในการจัดการความปลอดภัย
//? ทำการ Override ฟังก์ชัน fetch เดิมของ Browser เพื่อให้แนบ Auth Token ไปทุกครั้งที่เรียก API
const originalFetch = window.fetch;
window.fetch = async function(resource, init) {
  //? ตรวจสอบว่าเป็นการเรียกไปยัง Backend API (ยกเว้นหน้า Login)
  if (typeof resource === 'string' && resource.startsWith('/api/') && !resource.includes('/api/login')) {
    init = init || {};
    init.headers = init.headers || {};
    const token = localStorage.getItem('auth_token');
    
    //? หากมี Token อยู่ในเครื่อง ให้แนบเข้าไปใน Header (Bearer Authentication)
    if (token) {
      if (init.headers instanceof Headers) {
        init.headers.set('Authorization', 'Bearer ' + token);
      } else {
        init.headers['Authorization'] = 'Bearer ' + token;
      }
    }
  }
  
  //? เรียกใช้งาน fetch ตัวจริงพร้อมพารามิเตอร์ที่แก้ไขแล้ว
  const response = await originalFetch(resource, init);
  
  //? ตรวจสอบสถานภาพการเชื่อมต่อ: หากได้รับ 401 (Unauthorized) 
  //! แสดงว่า Token หมดอายุ หรือไม่ถูกต้อง: ให้ทำการ Logout อัตโนมัติเพื่อความปลอดภัย
  if (response.status === 401 && !resource.includes('/api/login')) {
    //! Token หมดอายุหรือถูก revoke — ไปหน้า logout เพื่อเคลียร์ session อย่างสมบูรณ์
    window.location.href = '/logout';
  }
  return response;
};
