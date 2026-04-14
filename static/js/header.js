/**
 * Site Header — ส่วนหัวระบบ
 * แก้ไขชื่อระบบ / ชื่อมหาวิทยาลัยที่ไฟล์นี้เพียงแห่งเดียว
 */
(function () {
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="site-header-inner" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
      <div style="display:flex; align-items:center;">
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
  document.body.prepend(header);

  // Show logout button if logged in
  if (localStorage.getItem('auth_token')) {
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.style.display = 'block';
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_level');
      window.location.href = '/static/index.html';
    });
  }
})();

// Intercept fetch API to automatically pass the Authorization token
const originalFetch = window.fetch;
window.fetch = async function(resource, init) {
  if (typeof resource === 'string' && resource.startsWith('/api/') && !resource.includes('/api/login')) {
    init = init || {};
    init.headers = init.headers || {};
    const token = localStorage.getItem('auth_token');
    
    if (token) {
      if (init.headers instanceof Headers) {
        init.headers.set('Authorization', 'Bearer ' + token);
      } else {
        init.headers['Authorization'] = 'Bearer ' + token;
      }
    }
  }
  
  const response = await originalFetch(resource, init);
  
  // If Unauthorized, force logout
  if (response.status === 401 && !resource.includes('/api/login')) {
    localStorage.removeItem('auth_token');
    window.location.href = '/static/index.html';
  }
  return response;
};
