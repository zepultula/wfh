# WFH Daily Report App

ระบบรายงานผลการปฏิบัติงานประจำวัน (Work from Home) ที่ออกแบบมาเพื่อช่วยให้พนักงานสามารถบันทึกและส่งรายงานการทำงานดิจิทัลได้อย่างรวดเร็ว พร้อมทั้งรองรับการสื่อสารสองทางระหว่างพนักงานและหัวหน้างาน และระบบจัดการผู้ใช้งานสำหรับผู้ดูแลระบบ

---

## 🚀 คุณสมบัติเด่น (Features) - v3.6.1

### 1. การจัดการรายงานรายวัน (Core Reports & Time Tracking)
- **Task Management:** เพิ่ม แก้ไข และลบรายการงานประจำวัน
- **Real-time Time Tracking (v3.6.1):** 
  - ระบบนาฬิกาจับเวลาในแต่ละงาน (Timer) แม่นยำระดับวินาที
  - แสดงสถานะการทำงานชัดเจน: `⏱ กำลังดำเนินการ`, `✓ เสร็จแล้ว`, `◯ ยังไม่เริ่ม/หยุดชั่วคราว`
  - หัวหน้างานสามารถเห็นเวลาที่ใช้แบบ Real-time ขณะเปิดดูรายละเอียดงานของพนักงาน
- **File & Link Attachments:** แนบไฟล์ PDF และลิงก์อ้างอิงเพื่อสนับสนุนข้อมูลในแต่ละงาน
- **Two-way Communication:** พนักงานและหัวหน้างานโต้ตอบกันผ่านคอมเมนต์ พร้อม Tag สถานะ (รับทราบ / ต้องแก้ไข / ดีมาก / ติดตามด่วน)
- **History Browsing:** เรียกดูรายงานย้อนหลังแบบ Read-only เพื่อความถูกต้องของข้อมูล

### 2. แผนงานเชิงพัฒนา (Weekly Work Plan) — v3.6.1
- **วางแผนงานล่วงหน้า:** พนักงานวางแผนสำหรับสัปดาห์ถัดไป โดยกำหนดเป้าหมาย, ผลผลิต, KPI และคำอธิบาย
- **Active Day Selector:** เลือกวันที่จะปฏิบัติงาน (จันทร์–เสาร์) ผ่านระบบ `active_days[]` ในแต่ละงาน
- **Task Categorization:** กำหนดประเภทงานได้ 3 รูปแบบ: **งานประจำ**, **งานที่รับมอบหมาย** และ **แผนงานเชิงพัฒนา**
- **Smart Auto-inject:** งานที่ได้รับการ **"อนุมัติ"** จากหัวหน้าจะปรากฏในรายงานประจำวันโดยอัตโนมัติเมื่อถึงวันที่กำหนด
- **Locking Logic:** 
  - งานที่อนุมัติแล้วจะถูกล็อกห้ามแก้ไขและลบ
  - งานที่ "อยู่ระหว่างดำเนินการ" (มีการบันทึกเวลาหรือผลงานแล้ว) จะล็อกการยกเลิกอนุมัติโดยระบบอัตโนมัติ

### 3. ระบบยืนยันตัวตนและจัดการ Profile (Auth & Profile)
- **Secure Login:** ระบบ Login ด้วย Email/Password หรือ **Username ย่อ** พร้อม JWT Authentication (HS256)
- **Password Hashing:** เข้ารหัสด้วย BCrypt (rounds=12) พร้อมระบบ Lazy Migration
- **Self-Service Reset:** พนักงานสามารถเปลี่ยนรหัสผ่านเองได้ผ่านหน้าโปรไฟล์ พร้อมระบบตรวจสอบความถูกต้องแบบ Real-time

### 4. แดชบอร์ดสรุปผลและสถิติ (Admin & Stats)
- **Real-time Dashboard:** แสดงจำนวนคนส่ง, ยังไม่ส่ง และพนักงานที่มีอุปสรรค แยกตามหน่วยงาน
- **Monthly Stats:** KPI Dashboard สรุปอัตราการส่งงาน (Compliance%) และความคืบหน้าเฉลี่ย (Avg Progress%)
- **Excel Export:** ส่งออกข้อมูลรายงานรายวัน แผนงานรายสัปดาห์/เดือน และสถิติรายเดือน เป็นไฟล์ `.xlsx` อย่างละเอียด

### 5. ระบบประหยัดน้ำมัน WFH (Fuel Savings) — v3.5.0
- **Travel Cost Calculation:** คำนวณเงินที่ประหยัดได้จากระยะทาง, อัตราสิ้นเปลือง และราคาน้ำมัน
- **Accurate Pricing:** ระบบเก็บประวัติราคาน้ำมันเพื่อให้คำนวณย้อนหลังได้อย่างแม่นยำตามวันที่มีผล

### 6. ระบบประกาศ (Announcement System) — v3.1.0
- **Targeted Announcements:** แสดงประกาศให้ตรงกลุ่มเป้าหมาย (ทุกคน / พนักงาน / แอดมิน)
- **One-time per Session:** แสดงประกาศเพียงครั้งเดียวต่อการเข้าใช้งาน 

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)
(ดูรายละเอียดที่ [CONTEXT.md](CONTEXT.md))

---

## 🛠 เทคโนโลยีที่ใช้ (Tech Stack)
- **Backend:** FastAPI (Python 3.10+) + Firebase Firestore (NoSQL)
- **Frontend:** Vanilla JS, Vanilla CSS, HTML5 (Clean Layout)
- **Auth:** JWT (HS256) + BCrypt (Password Hashing)

---

## 🔌 API Endpoints
ดูรายละเอียด API ทั้งหมดได้ที่ [API_DOCS.md](API_DOCS.md)

---

## 📚 เอกสารที่เกี่ยวข้อง
| เอกสาร | คำอธิบาย |
|--------|---------|
| [USER_MANUAL.md](USER_MANUAL.md) | คู่มือการใช้งานสำหรับพนักงาน หัวหน้างาน และผู้ดูแลระบบ |
| [API_DOCS.md](API_DOCS.md) | เอกสาร API ทุก Endpoint พร้อมตัวอย่าง Request/Response |
| [CONTEXT.md](CONTEXT.md) | บริบทโปรเจกต์ สถาปัตยกรรม และ Changelog สำหรับนักพัฒนา |

---

## 📝 ข้อมูลโครงการ
- **เวอร์ชัน:** 3.6.1
- **ทีมผู้พัฒนา:** ส.อ.พงศ์พันธ์ศักดิ์ พึ่งชาติ
- **หน่วยงาน:** มหาวิทยาลัยเทคโนโลยีราชมงคลล้านนา ตาก
 รเจกต์ (Project Structure)

```text
wfh/
├── main.py                  # FastAPI server & entry point (ENV: APP_HOST, APP_PORT)
├── auth.py                  # JWT utilities (create/decode token, Depends)
├── models.py                # Pydantic data models (Reports, Users, Auth)
├── database.py              # Firebase Admin SDK configuration (Singleton)
├── routers/
│   ├── reports.py           # CRUD logic for reports & comments (with RBAC)
│   ├── admin.py             # User Management, Evaluations, Stats & Export
│   ├── announcements.py     # Announcement CRUD (Super Admin) + display endpoint
│   ├── plans.py             # Weekly Work Plan CRUD + approval endpoints
│   └── fuel.py              # Fuel savings: settings, price history, weekly/monthly, admin all
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
│       ├── announcements.js # Shared announcement modal logic
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

### 4. Collection: `announcements`
เก็บประกาศจากผู้ดูแลระบบ (Document ID: auto-generated)
- Fields: `title`, `body`, `is_active`, `target` (`all`/`employee`/`admin`), `created_at`, `created_by`

### 5. Collection: `weekly_plans`
เก็บแผนงานรายสัปดาห์ (Document ID: `{user_id}_{week_start}`)
- Fields: `user_id`, `user_name`, `department`, `week_start`, `days`
- `days`: dict mapping `YYYY-MM-DD` → list ของ tasks (id, title, goal, output, kpi_name, kpi_target, description, approved, approved_by, approved_at)

### 6. Collection: `fuel_settings`
เก็บการตั้งค่าการคำนวณค่าน้ำมัน (Document ID: `{user_id}` = personal_id จาก JWT)
- Fields: `distance_km`, `fuel_efficiency`, `fuel_price` (ราคาล่าสุด), `toll_parking`
- `price_history`: `[{fuel_price: float, effective_from: "YYYY-MM-DD"}]` — เรียงจากน้อยไปมาก

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
| GET | `/api/announcements` | ดึงประกาศ active ตาม target/level (หรือทั้งหมดสำหรับ `?admin=1` + Super Admin) |
| POST | `/api/announcements` | สร้างประกาศใหม่ (Super Admin only) |
| PATCH | `/api/announcements/{id}` | แก้ไขประกาศ (Super Admin only) |
| DELETE | `/api/announcements/{id}` | ลบประกาศ (Super Admin only) |
| POST | `/api/upload` | อัปโหลดไฟล์เพื่อใช้แนบกับภาระงานต่างๆ |
| GET | `/api/plans` | ดูแผนงานของตัวเอง (`?week=YYYY-MM-DD`) |
| GET/PUT | `/api/fuel/settings` | ดึง/บันทึกการตั้งค่าน้ำมัน (พร้อม price history) |
| GET | `/api/fuel/savings?month=YYYY-MM` | คำนวณประหยัดน้ำมัน WFH รายเดือน (per-day price) |
| GET | `/api/fuel/savings/weekly?week=YYYY-MM-DD` | คำนวณประหยัดน้ำมัน WFH รายอาทิตย์ |
| GET | `/api/fuel/savings/all?month=YYYY-MM` | สรุปค่าน้ำมันประหยัดทุกคน (Admin level 1+) |
| POST | `/api/plans` | สร้าง/แทนที่แผนงาน (รักษา approval fields ไว้เสมอ) |
| GET | `/api/plans/tasks` | ดึงงานในแผนสำหรับวันที่ระบุ (auto-inject) |
| GET | `/api/plans/subordinates` | หัวหน้าดูแผนของลูกน้อง (Admin Level 1+) |
| PATCH | `/api/plans/{plan_id}/approve` | อนุมัติ/ไม่อนุมัติงาน (Admin Level 1+) |
| GET | `/api/plans/export/weekly` | ส่งออก Excel แผนงานรายสัปดาห์ (Admin Level 1+) |
| GET | `/api/plans/export/monthly` | ส่งออก Excel แผนงานรายเดือน (Admin Level 1+) |

> ดูรายละเอียด API ทั้งหมดได้ที่ [API_DOCS.md](API_DOCS.md)

---

## 📚 เอกสารที่เกี่ยวข้อง

| เอกสาร | คำอธิบาย |
|--------|---------|
| [USER_MANUAL.md](USER_MANUAL.md) | คู่มือการใช้งานสำหรับพนักงาน หัวหน้างาน และผู้ดูแลระบบ |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | คู่มือแก้ไขปัญหาเบื้องต้น (Login วนลูป, ข้อมูลไม่แสดง, ดาวน์โหลด Excel ฯลฯ) |
| [API_DOCS.md](API_DOCS.md) | เอกสาร API ทุก Endpoint พร้อม Request/Response examples |
| [CONTEXT.md](CONTEXT.md) | บริบทโปรเจกต์ สถาปัตยกรรม และ Changelog ฉบับละเอียดสำหรับนักพัฒนา |

---

## 📝 ข้อมูลโครงการ
- **เวอร์ชัน:** 3.5.2
- **ทีมผู้พัฒนา:** ส.อ.พงศ์พันธ์ศักดิ์ พึ่งชาติ
- **หน่วยงาน:** มหาวิทยาลัยเทคโนโลยีราชมงคลล้านนา ตาก
