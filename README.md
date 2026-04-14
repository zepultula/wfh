# WFH Daily Report App

ระบบรายงานผลการปฏิบัติงานประจำวัน (Work from Home) ที่ออกแบบมาเพื่อช่วยให้พนักงานสามารถบันทึกและส่งรายงานการทำงานดิจิทัลได้อย่างรวดเร็ว พร้อมทั้งรองรับการสื่อสารสองทางระหว่างพนักงานและหัวหน้างาน และระบบจัดการผู้ใช้งานสำหรับผู้ดูแลระบบ

---

## 🚀 คุณสมบัติเด่น (Features) - v2.0.0

### 1. การจัดการรายงานรายวัน (Core Features)
- **Task Management:** เพิ่ม แก้ไข และลบรายการงานประจำวัน พร้อมระบบ Auto-save
- **Task Status:** ระบุสถานะงานแต่ละรายการ (เสร็จสิ้น / กำลังดำเนินการ / รอดำเนินการ)
- **Progress Scoring:** ระบุความคืบหน้าของงานเป็นร้อยละ (0-100%)
- **Two-way Communication:** พนักงานและหัวหน้างานโต้ตอบกันผ่านคอมเมนต์ พร้อม Tag สถานะ (รับทราบ / ต้องแก้ไข / ดีมาก / ติดตามด่วน)
- **History Browsing:** เรียกดูรายงานย้อนหลังแบบ Read-only เพื่อความถูกต้องของข้อมูล

### 2. ระบบยืนยันตัวตนและกำหนดสิทธิ์ (Auth & Authorization)
- **Secure Login:** ระบบ Login ด้วย Email และ Password พร้อม Token-based Authentication
- **Role-based Access Control (RBAC):**
  - **Level 0 (Employee):** ดูและบันทึกรายงานของตนเอง
  - **Level 1-3 (Supervisor):** ดูรายงานของตนเองและลูกน้องในทีมตามสายบังคับบัญชา
  - **Level 9 (Super Admin):** จัดการผู้ใช้และดูรายงานของพนักงานทุกคนในระบบ

### 3. แดชบอร์ดสรุปผล (Admin Dashboard)
- **Department Grouping:** จัดกลุ่มพนักงานตามหน่วยงาน/แผนก เพื่อความสะดวกในการตรวจสอบ
- **Real-time Statistics:** แสดงสถิติจำนวนคนส่ง, ยังไม่ส่ง และพนักงานที่มีอุปสรรค
- **Smart Filtering:** กรองข้อมูลตามสถานะ ("ส่งแล้ว", "มีปัญหา", "ยังไม่ส่ง") และค้นหาตามชื่อ/แผนก
- **Ignore Status:** ระบบยกเว้นการแสดงผลพนักงานบางราย (เช่น พนักงานที่ลาออกหรือพักงาน) โดยไม่ต้องลบข้อมูล

### 4. ระบบจัดการผู้ใช้ (User Management)
- **Full CRUD:** เพิ่ม, แก้ไข และลบข้อมูลพนักงาน (สำหรับ Super Admin)
- **Ignore Toggle:** สลับสถานะการแสดงผลพนักงานได้ทันทีจากหน้าตาราง
- **Data Migration:** ระบบ Migrate ข้อมูลอัตโนมัติเพื่อรองรับฟีเจอร์ใหม่ๆ เช่น `ignore` field และ `evaluator_ids`

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```text
wfh/
├── main.py                  # FastAPI server & entry point
├── models.py                # Pydantic data models (Reports, Users, Auth)
├── database.py              # Firebase Admin SDK configuration (Singleton)
├── routers/
│   ├── reports.py           # CRUD logic for reports & comments (with RBAC)
│   └── admin.py             # User Management & Migration endpoints
├── static/
│   ├── index.html           # Landing & Login page
│   ├── employee.html        # Employee dashboard
│   ├── admin.html           # Supervisor dashboard & User management
│   ├── css/
│   │   └── style.css        # Shared design system (Vanilla CSS)
│   └── js/
│       ├── emp.js           # Frontend logic for employees
│       ├── sup.js           # Frontend logic for supervisors
│       ├── header.js        # Global header & Interceptor (Auth logic)
│       └── footer.js        # Global footer
└── API_DOCS.md              # Detailed API documentation
```

---

## 📊 โครงสร้างข้อมูล (Firebase Schema)

### 1. Collection: `users`
เก็บข้อมูลส่วนตัวและสิทธิ์การใช้งาน (Document ID: `email`)
- Fields: `personal_id`, `firstname`, `lastname`, `email`, `position`, `department`, `agency`, `level`, `role`, `password`, `ignore`

### 2. Collection: `evaluations`
เก็บแผนผังสายบังคับบัญชา (Document ID: `target_id`)
- Fields: `target_id`, `evaluators` (array), `evaluator_ids` (flat array for performance)

### 3. Collection: `reports`
เก็บรายงานรายวันและคอมเมนต์ (Document ID: `{user_id}_{YYYY-MM-DD}`)
- Fields: `user_id`, `name`, `work_mode`, `progress`, `problems`, `tasks[]`, `comments[]`, `timestamp`

---

## 🛠 เทคโนโลยีที่ใช้ (Tech Stack)

- **Backend:** FastAPI (Python 3.10+)
- **Database:** Firebase Firestore (NoSQL)
- **Frontend:** HTML5, Vanilla JavaScript, Vanilla CSS, SweetAlert2
- **Auth:** Bearer Token (Custom Implementation)

---

## 📦 วิธีการติดตั้งและใช้งาน (Installation)

1. **ติดตั้ง Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **ตั้งค่า Firebase:**
   นำไฟล์ Service Account JSON มาวางใน root directory และตรวจสอบชื่อไฟล์ใน `database.py`

3. **รันเซิร์ฟเวอร์:**
   ```bash
   python main.py
   ```

4. **เข้าใช้งาน:**
   เปิดเบราว์เซอร์ไปที่ [http://127.0.0.1:8000](http://127.0.0.1:8000)

---

## 🔌 API Endpoints (บางส่วน)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/login` | ยืนยันตัวตนและรับข้อมูลผู้ใช้ |
| GET | `/api/reports/` | ดึงรายงาน (กรองตามสิทธิ์และวันที่) |
| POST | `/api/reports/` | สร้าง/อัปเดตรายงาน |
| GET | `/api/admin/users` | ดึงรายชื่อพนักงานทั้งหมด (Admin Only) |
| POST | `/api/admin/migrate/ignore` | อัปเกรดฐานข้อมูลโครงสร้างใหม่ |

> ดูรายละเอียด API ทั้งหมดได้ที่ [API_DOCS.md](API_DOCS.md)

---

## 📝 ข้อมูลโครงการ
- **เวอร์ชัน:** 2.0.0
- **ทีมผู้พัฒนา:** ส.อ.พงศ์พันธ์ศักดิ์ พึ่งชาติ
- **หน่วยงาน:** มหาวิทยาลัยเทคโนโลยีราชมงคลล้านนา ตาก
