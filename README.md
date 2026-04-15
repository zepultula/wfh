# WFH Daily Report App

ระบบรายงานผลการปฏิบัติงานประจำวัน (Work from Home) ที่ออกแบบมาเพื่อช่วยให้พนักงานสามารถบันทึกและส่งรายงานการทำงานดิจิทัลได้อย่างรวดเร็ว พร้อมทั้งรองรับการสื่อสารสองทางระหว่างพนักงานและหัวหน้างาน และระบบจัดการผู้ใช้งานสำหรับผู้ดูแลระบบ

---

## 🚀 คุณสมบัติเด่น (Features) - v2.8.0

### 1. การจัดการรายงานรายวัน (Core Features)
- **Task Management:** เพิ่ม แก้ไข และลบรายการงานประจำวัน พร้อมระบบ Auto-save
- **Task Status:** ระบุสถานะงานแต่ละรายการ (เสร็จสิ้น / กำลังดำเนินการ / รอดำเนินการ)
- **Progress Scoring:** ระบุความคืบหน้าของงานเป็นร้อยละ (0-100%)
- **Two-way Communication:** พนักงานและหัวหน้างานโต้ตอบกันผ่านคอมเมนต์ พร้อม Tag สถานะ (รับทราบ / ต้องแก้ไข / ดีมาก / ติดตามด่วน)
- **History Browsing:** เรียกดูรายงานย้อนหลังแบบ Read-only เพื่อความถูกต้องของข้อมูล
- **User Manual:** [คู่มือการใช้งานฉบับเต็ม](USER_MANUAL.md) สำหรับพนักงานและผู้ดูแลระบบ

### 2. ระบบยืนยันตัวตนและกำหนดสิทธิ์ (Auth & Authorization)
- **Secure Login:** ระบบ Login ด้วย Email และ Password พร้อม JWT Authentication (HS256, หมดอายุ 8 ชั่วโมง)
- **Role-based Access Control (RBAC):**
  - **Level 0 (Employee):** ดูและบันทึกรายงานของตนเอง
  - **Level 1-3 (Supervisor):** ดูรายงานของตนเองและลูกน้องในทีมตามสายบังคับบัญชา + ดูสถิติรายเดือนและส่งออก Excel (เฉพาะลูกน้อง)
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

### 5. สถิติรายเดือน (Monthly Stats) — สำหรับ Admin ทุกระดับ
- **KPI Dashboard:** แสดงจำนวนผู้ใช้, คน-วันที่ส่ง, Compliance% และ Avg Progress%
- **Per-user Stats:** ตารางแบ่งกลุ่มตามแผนก พร้อมรูปแบบทำงาน (WFH/On-site/Hybrid) และจำนวนงานที่เสร็จ
- **Role-aware:** Super Admin เห็นทุกคน, Supervisor เห็นเฉพาะลูกน้องในสายบังคับบัญชา
- **Export Excel:** ส่งออกไฟล์ `.xlsx` พร้อมสีสันและการจัดกลุ่มตามแผนก

### 6. ส่งออกรายงานประจำวัน (Daily Report Export)
- **Excel ละเอียด:** ส่งออกรายงานประจำวันเป็น `.xlsx` พร้อมรายการงาน สถานะ ปัญหา คอมเมนต์ และรายชื่อผู้ยังไม่ส่ง
- **Loading Animation:** ปุ่มดาวน์โหลดแสดง Spinner และ Disabled ระหว่างรอข้อมูล

### 7. UI/UX Visual Polish (v2.7.0)
- **Login Loading UX:** ปุ่มเข้าสู่ระบบแสดง Spinner ระหว่าง API call + Full-page overlay ก่อน redirect
- **Submit Loading:** ปุ่มส่งรายงานแสดง Spinner ระหว่าง API call
- **Work Mode Colors:** ปุ่มรูปแบบทำงาน WFH (น้ำเงิน) / On-site (เขียว) / Hybrid (ม่วง) — สีตรงกันทุกหน้า
- **Trash Icon:** ปุ่มลบงานเปลี่ยนเป็น SVG trash-bin สีแดงที่ชัดเจนกว่า "×"
- **Admin Navbar:** ปุ่ม Navigation ออกแบบใหม่ — pill-shaped พร้อม SVG icon และสีเฉพาะแต่ละฟังก์ชัน
- **Back Button:** ปุ่ม "กลับ Dashboard" สีอำพันชัดเจน พร้อม SVG arrow icon
- **Excel Buttons:** SVG table grid icon + gradient สีเขียว
- **Smooth Animations:** Page transition fade+slide (.22s) และ Collapsible table max-height transition (.28s) ที่ smooth ด้วย `requestAnimationFrame`

### 8. Clean URL, Custom Pages & UX Polish (v2.8.0)
- **Clean URLs:** ซ่อน path จริงของไฟล์ HTML — เข้าผ่าน `/`, `/employee`, `/admin`, `/logout` แทน `/static/*.html`
- **Custom 404 Page:** หน้า Error ที่ออกแบบให้เข้ากับ Login — glass card + blobs animation, แสดง URL ที่ไม่พบ, ปุ่มกลับหน้าหลัก
- **Logout Page:** หน้าออกจากระบบที่สมบูรณ์ — เคลียร์ Token ทันที, แสดงชื่อผู้ใช้ที่ logout, progress bar นับถอยหลัง 3 วินาที
- **Employee Navbar Buttons:** ปุ่ม "แอดมิน" และ "ออกจากระบบ" ใช้ pill style เดียวกัน พร้อม SVG icon สอดคล้องกับ design system

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```text
wfh/
├── main.py                  # FastAPI server & entry point (ENV: APP_HOST, APP_PORT)
├── auth.py                  # JWT utilities (create/decode token, Depends)
├── models.py                # Pydantic data models (Reports, Users, Auth)
├── database.py              # Firebase Admin SDK configuration (Singleton)
├── routers/
│   ├── reports.py           # CRUD logic for reports & comments (with RBAC)
│   └── admin.py             # User Management, Evaluations, Stats & Export
├── static/
│   ├── index.html           # Landing & Login page  → เข้าถึงผ่าน /
│   ├── employee.html        # Employee dashboard    → เข้าถึงผ่าน /employee
│   ├── admin.html           # Supervisor dashboard  → เข้าถึงผ่าน /admin
│   ├── logout.html          # Logout page           → เข้าถึงผ่าน /logout
│   ├── 404.html             # Custom 404 page
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
- **Auth:** JWT HS256 (`python-jose`) + `python-dotenv` สำหรับโหลด secret key จาก `.env`

---

## 📦 วิธีการติดตั้งและใช้งาน (Installation)

1. **ติดตั้ง Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **ตั้งค่า Firebase:**
   นำไฟล์ Service Account JSON มาวางใน root directory และตรวจสอบชื่อไฟล์ใน `database.py`

3. **ตั้งค่า Secret Key (Production):**
   สร้างไฟล์ `.env` ใน root directory:
   ```
   JWT_SECRET_KEY=<random_string_32+_chars>
   ```
   สร้าง key ด้วย: `python -c "import secrets; print(secrets.token_hex(32))"`

4. **รันเซิร์ฟเวอร์:**
   ```bash
   python main.py
   ```
   หรือกำหนด Host/Port ผ่าน Environment Variables:
   ```bash
   set APP_HOST=0.0.0.0
   set APP_PORT=8080
   python main.py
   ```
   > Default: `0.0.0.0:8000` (รับทุก IP ที่เข้ามา)

5. **เข้าใช้งาน:**
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
| GET | `/api/admin/stats?month=YYYY-MM` | สถิติรายเดือน (Admin Level 1+, กรองตามสิทธิ์) |
| GET | `/api/admin/stats/export?month=YYYY-MM` | ส่งออก Excel สถิติรายเดือน (Admin Level 1+) |
| GET | `/api/admin/reports/export?date=YYYY-MM-DD` | ส่งออก Excel รายงานประจำวันละเอียด (Admin Level 1+) |

> ดูรายละเอียด API ทั้งหมดได้ที่ [API_DOCS.md](API_DOCS.md)

---

## 📝 ข้อมูลโครงการ
- **เวอร์ชัน:** 2.8.0
- **ทีมผู้พัฒนา:** ส.อ.พงศ์พันธ์ศักดิ์ พึ่งชาติ
- **หน่วยงาน:** มหาวิทยาลัยเทคโนโลยีราชมงคลล้านนา ตาก
