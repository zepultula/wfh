/**
 * Site Footer — ข้อมูลลิขสิทธิ์ระบบ
 * แก้ไขเนื้อหา footer ที่ไฟล์นี้เพียงแห่งเดียว
 */
(function () {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML =
    '&copy; ลิขสิทธิ์ 2026 &nbsp;|&nbsp; พัฒนาระบบรายงานผลการปฏิบัติงานประจำวัน&nbsp; โดย&nbsp;' +
    '<strong>ส.อ.พงศ์พันธ์ศํกดิ์ พึ่งชาติ</strong>&nbsp; นักวิชาการคอมพิวเตอร์ ชำนาญการ';
  document.body.appendChild(footer);
})();
