/**
 * Site Footer — ข้อมูลลิขสิทธิ์ระบบ
 * แก้ไขเนื้อหา footer ที่ไฟล์นี้เพียงแห่งเดียว
 */
//? IIFE (Immediately Invoked Function Expression) เพื่อสร้าง Footer ทันทีที่โหลดสคริปต์
(function () {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  
  //? กำหนดเนื้อหาภายใน Footer เช่น ข้อมูลลิขสิทธิ์ และชื่อผู้พัฒนา
  footer.innerHTML =
    '&copy; ลิขสิทธิ์ 2026 &nbsp;|&nbsp; พัฒนาระบบรายงานผลการปฏิบัติงานประจำวัน&nbsp; โดย&nbsp;' +
    '<strong>ส.อ.พงศ์พันธ์ศํกดิ์ พึ่งชาติ</strong>&nbsp; นักวิชาการคอมพิวเตอร์ ชำนาญการ<br>' +
    '<strong>งานวิทยบริการและเทคโนโลยีสารสนเทศ ส่วนงานเทคโนโลยีสารสนเทศ</strong>';
    
  //? นำ Footer ไปต่อท้ายสุดของเนื้อหาใน <body>
  document.body.appendChild(footer);
})();
