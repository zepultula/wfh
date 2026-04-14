# WFH Daily Report App — Context Summary

**อัปเดตล่าสุด:** 2026-04-14 (เวอร์ชั่น 1.5.0)

---

## 🚀 ภาพรวมโปรเจกต์
ระบบรายงานการทำงานประจำวัน (Work from Home) ที่รองรับการบันทึกงานโดยละเอียด การให้คะแนนความคืบหน้า และการสื่อสารโต้ตอบระหว่างพนักงานและหัวหน้างานแบบสองทาง (Two-way communication)

---

## 📁 โครงสร้างไฟล์ปัจจุบัน
```
wfh/
├── main.py                  # FastAPI server (reload=False), static mount, /api/me endpoint
├── models.py                # Pydantic models (ReportCreate, ReportOut, TaskModel, CommentCreate, CommentModel)
├── database.py              # Firebase Admin SDK Configuration (Singleton)
├── routers/
│   └── reports.py           # CRUD: รายงาน, tasks PATCH, คอมเมนต์
├── static/
│   ├── index.html           # Landing page — เลือกบทบาท (พนักงาน / แอดมิน)
│   ├── employee.html        # หน้าพนักงาน (standalone)
│   ├── admin.html           # หน้าแอดมิน/หัวหน้างาน (standalone)
│   ├── css/
│   │   └── style.css        # Shared design system (รวม .site-header และ .site-footer)
│   └── js/
│       ├── emp.js           # JS เฉพาะพนักงาน
│       ├── sup.js           # JS เฉพาะแอดมิน
│       ├── header.js        # Site header — inject อัตโนมัติทุกหน้า (แก้ที่นี่ที่เดียว)
│       └── footer.js        # Site footer — inject อัตโนมัติทุกหน้า (แก้ที่นี่ที่เดียว)
└── CONTEXT.md
```

---

## 🛠 ฟีเจอร์ที่พัฒนาสำเร็จแล้ว (สถานะปัจจุบัน)

### 1. ระบบแยกหน้า (Page Separation) — v1.3.0
- **Landing page** (`index.html`): เลือกบทบาทก่อนเข้าระบบ ลิงก์ไป `employee.html` / `admin.html`
- **หน้าพนักงาน** (`employee.html` + `emp.js`): standalone ไม่มี switcher
- **หน้าแอดมิน** (`admin.html` + `sup.js`): standalone ไม่มี switcher
- **Cross-page navigation**: Navbar มีลิงก์ข้ามหน้า ("แอดมิน →" และ "← พนักงาน")
- หลังพนักงานกด "ส่งรายงาน" จะ redirect ไป `admin.html` อัตโนมัติ

### 2. Site Header & Footer (Shared Injection) — v1.4.0
- **`header.js`**: inject `<header class="site-header">` ที่ต้นของ `<body>` ทุกหน้า
  - แสดงชื่อระบบ: "ระบบรายงานผลการปฏิบัติงานประจำวัน"
  - ชื่อมหาวิทยาลัย: "มหาวิทยาลัยเทคโนโลยีราชมงคลล้านนา ตาก"
  - `position: fixed; top: 0` — ติดขอบบนสุดตลอด; มี gradient bar น้ำเงิน→เขียว 3px
- **`footer.js`**: inject `<footer class="site-footer">` ที่ท้าย `<body>` ทุกหน้า
  - แสดงข้อความ: "© ลิขสิทธิ์ 2026 | พัฒนาระบบรายงานผลการปฏิบัติงานประจำวัน โดย ส.อ.พงศ์พันธ์ศํกดิ์ พึ่งชาติ นักวิชาการคอมพิวเตอร์ ชำนาญการ"
  - `position: fixed; bottom: 0` — ติดขอบล่างสุดตลอด
- **body**: มี `padding-top: 64px` และ `padding-bottom: 44px` รองรับทั้ง header และ footer
- **แก้ไขข้อมูล**: แก้ที่ `header.js` หรือ `footer.js` เพียงไฟล์เดียว — ทุกหน้าอัปเดตทันที

### 3. ระบบจัดการรายการงาน (Task Management)
- **CRUD:** เพิ่ม / ลบ / แก้ไขชื่องาน, auto re-indexing เลขงาน
- **Status:** done / prog / pend เลือกได้ต่องาน
- **Auto-save description:** เมื่อกด "ตกลง" ในหน้า Modal จะ PATCH `/api/reports/{id}/tasks` บันทึกลง Firebase ทันที

### 4. ระบบคำอธิบายงานเชิงลึก (Task Description)
- **พนักงาน:** Modal แก้ไขได้ — บันทึกผ่าน `autoSaveTasks()`
- **แอดมิน:** Modal อ่านอย่างเดียว — ปุ่ม "📝 ดูรายละเอียด" แสดงเฉพาะงานที่มี description

### 5. ระบบสื่อสารโต้ตอบ (Two-way Communication)
- หัวหน้างานและพนักงานคอมเมนต์โต้ตอบกันได้
- รองรับ tag (รับทราบ / ต้องแก้ไข / ดีมาก / ติดตามด่วน) สำหรับแอดมิน
- ข้อความแสดง avatar, ชื่อ, เวลา, บทบาทชัดเจน

### 6. Dashboard แอดมิน
- **Date filter:** กรองรายงานตามวันที่ได้ (default = วันนี้)
- **Stats grid:** จำนวนพนักงาน / ส่งแล้ว / ยังไม่ส่ง / มีปัญหา (อัปเดตอัตโนมัติ)
- **Problems summary:** รวบรวมปัญหาที่รายงานไว้ด้านล่าง Dashboard
- **Filter bar:** กรองรายการตาม ทั้งหมด / ส่งแล้ว / ยังไม่ส่ง / WFH / มีปัญหา

### 7. ความเสถียร (System Stability)
- `reload=False` ใน uvicorn — ป้องกัน zombie process
- Resource versioning `?v=1.2.1` บน emp.js/sup.js/style.css, `?v=1.3.0` บน header.js/footer.js

### 8. การเรียกดูรายงานย้อนหลัง (Historical Report Browsing) — v1.5.0

#### หน้าพนักงาน (`employee.html` + `emp.js`)
- **Date navigation bar:** ← ก่อนหน้า | แสดงวันที่ (ไทย/พ.ศ.) | date input | ถัดไป → | ปุ่ม "วันนี้" (ซ่อนเมื่ออยู่วันปัจจุบัน)
- **History banner:** แถบเหลือง "กำลังดูรายงานย้อนหลัง — ไม่สามารถแก้ไขได้" ปรากฏเมื่อไม่อยู่วันปัจจุบัน
- **Read-only mode (3 ชั้น):**
  - CSS: class `.history-mode` บน `#screen-emp` — ปิด pointer-events ทุก input/range/mode-btn
  - HTML attrs: `readonly` บน textarea, `disabled` บน range input, task inputs
  - JS guards: `if (isHistoryMode) return;` ในทุก event handler ที่เขียนข้อมูล
- **ซ่อน UI เขียน:** ปุ่มเพิ่มงาน, ปุ่มส่งรายงาน, compose box คอมเมนต์
- **Empty state:** แสดง "📭 ไม่พบรายงานในวันที่เลือก" เมื่อวันนั้นไม่มีรายงาน
- **Modal คำอธิบายงาน:** สลับเป็น read-only อัตโนมัติเมื่ออยู่ใน history mode (ซ่อนปุ่ม "ตกลง")
- **State variables:** `viewDate` (null = วันนี้), `isHistoryMode` (boolean)
- **ID pattern:** `{user_id}_{YYYY-MM-DD}` — ใช้ reconstruct report ID ข้ามวันโดยไม่ต้องเพิ่ม endpoint ใหม่

#### หน้าแอดมิน (`admin.html` + `sup.js`)
- **Date navigation บน dashboard:** ปุ่ม ← → ขนาบ date filter — เปลี่ยนวันและเรียก `loadDashboard()` ใหม่
- **Date navigation บน detail view (รายบุคคล):** `buildDetailDateNav(reportId)` — แสดงวันที่ + badge "วันนี้"/"ย้อนหลัง" + ปุ่ม ← → นำทางดูรายงานพนักงานข้ามวัน
- **Empty state per employee:** `renderEmptyReportDetail(reportId)` — แสดง "📭 ไม่พบรายงาน" พร้อม date nav เมื่อ fetch 404
- **ไม่เพิ่ม API endpoint:** ใช้ `GET /api/reports/{id}` เดิม — สร้าง ID ใหม่จาก `{userId}_{newDate}` โดย helper functions:
  - `getReportDate(reportId)` — extract วันที่จาก ID ด้วย regex
  - `getReportUserId(reportId)` — extract userId
  - `navigateEmployeeReport(delta)` — เลื่อนวันในฝั่ง detail view

---

## 📊 โครงสร้างข้อมูล (Firebase Schema)
**Document ID:** `{user_id}_{YYYY-MM-DD}` (เช่น `U001_2026-04-14`)

```json
{
  "id": "U001_2026-04-14",
  "user_id": "U001",
  "name": "นายนักวิชาการ วิทยาคม",
  "role": "นักวิชาการคอมพิวเตอร์ชำนาญการ",
  "department": "งานระบบสารสนเทศ",
  "work_mode": "wfh",
  "progress": 65,
  "problems": "-",
  "plan_tomorrow": "ประชุมทีมงาน",
  "timestamp": "2026-04-14 14:36:10",
  "submit_time": "14:36",
  "tasks": [
    { "id": 1, "title": "เขียนโค้ด", "description": "รายละเอียด...", "status": "done" }
  ],
  "comments": [
    {
      "id": "uuid",
      "author_id": "U001",
      "author_name": "สมวิทย์ หัวหน้างาน",
      "author_role": "หัวหน้างาน / ผู้ดูแลระบบ",
      "avatar_color": "av-blue",
      "author_initials": "สว",
      "message": "งานดีมากครับ",
      "tag": "ดีมาก",
      "timestamp": "14:20"
    }
  ]
}
```

---

## 🔌 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/me` | Current user (hardcoded U001 ชั่วคราว) |
| POST | `/api/reports/` | สร้าง/อัปเดตรายงานวันนี้ (idempotent ตาม user+date) |
| GET | `/api/reports/` | ดึงรายงานทั้งหมด (`?date=YYYY-MM-DD` กรองได้) |
| GET | `/api/reports/{id}` | ดึงรายงานเดี่ยว |
| PATCH | `/api/reports/{id}/tasks` | อัปเดต tasks ทั้งหมด (พร้อม description) |
| POST | `/api/reports/{id}/comments` | เพิ่มคอมเมนต์ |

---

## 🖥 URL Structure

| URL | หน้า |
|-----|------|
| `/` | Redirect → `/static/index.html` |
| `/static/index.html` | Landing page (เลือกบทบาท) |
| `/static/employee.html` | หน้าพนักงาน |
| `/static/admin.html` | หน้าแอดมิน/หัวหน้างาน |

---

## 📝 บันทึกปัญหาที่แก้ไขล่าสุด
- [x] **v1.2.1** Task description ไม่บันทึกลง Firebase — แก้โดยเพิ่ม `PATCH /tasks` + `autoSaveTasks()`
- [x] **v1.2.1** 404 จาก PATCH — import `TaskModel` หายใน `routers/reports.py`
- [x] **v1.2.1** Server zombie process — เปลี่ยน `reload=True` → `reload=False`
- [x] **v1.3.0** แยกหน้าพนักงานและแอดมินออกจากกัน (SPA → Multi-page)
- [x] **v1.4.0** เพิ่ม site header และ footer แบบ shared injection ผ่าน JS
- [x] **v1.5.0** เพิ่มการเรียกดูรายงานย้อนหลัง (read-only) ทั้งหน้าพนักงานและแอดมิน

---

## 🎯 สิ่งที่ยังต้องทำต่อ (Next Steps)
- [ ] พัฒนาระบบ Authentication จริง (แทน hardcoded `/api/me`)
- [ ] รองรับผู้ใช้หลายคน — ปัจจุบัน `/api/me` คืนค่า U001 เสมอ
- [ ] เพิ่มระบบแจ้งเตือน (Notification) เมื่อมีคอมเมนต์ใหม่
- [ ] ปรับปรุง Query รายงานย้อนหลังให้มีประสิทธิภาพสำหรับทีมขนาดใหญ่
- [ ] เพิ่มปุ่มนำทางวันที่ใน landing page (index.html) หากต้องการ
- [ ] Admin: แสดงรายการวันที่มีข้อมูลเพื่อนำทาง (calendar view) แทนการกดทีละวัน
