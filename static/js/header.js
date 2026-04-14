/**
 * Site Header — ส่วนหัวระบบ
 * แก้ไขชื่อระบบ / ชื่อมหาวิทยาลัยที่ไฟล์นี้เพียงแห่งเดียว
 */
(function () {
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="site-header-inner">
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
  `;
  document.body.prepend(header);
})();
