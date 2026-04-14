# WFH Daily Report App

ระบบรายงานผลการปฏิบัติงานประจำวัน (Work from Home) ที่ออกแบบมาเพื่อช่วยให้พนักงานสามารถบันทึกและส่งรายงานการทำงานดิจิทัลได้อย่างรวดเร็ว พร้อมทั้งรองรับการสื่อสารสองทางระหว่างพนักงานและหัวหน้างาน

---

## 🚀 คุณสมบัติเด่น (Features)

### 1. การจัดการรายงานรายวัน
- **Task Management:** เพิ่ม แก้ไข และลบรายการงานประจำวันได้อิสระ
- **Task Status:** ระบุสถานะงานแต่ละรายการ (เสร็จสิ้น / กำลังดำเนินการ / รอดำเนินการ)
- **Task Description:** สามารถระบุรายละเอียดของงานในเชิงลึกผ่าน Pop-up Modal
- **Progress Scoring:** ระบุความคืบหน้าของงานเป็นร้อยละ (0-100%)

### 2. ระบบสองบทบาท (Dual Roles)
- **หน้าพนักงาน (`employee.html`):** สำหรับบันทึกงานใหม่ แก้ไขงาน และส่งรายงาน
- **หน้าผู้ดูแล/หัวหน้างาน (`admin.html`):** สำหรับตรวจสอบรายงานของทีมงาน ให้คะแนน และคอมเมนต์

### 3. การสื่อสารสองทาง (Two-way Communication)
- พนักงานและหัวหน้างานสามารถโต้ตอบกันผ่านช่องคอมเมนต์ในแต่ละรายงาน
- ระบบ Tag สำหรับหัวหน้างาน (รับทราบ / ต้องแก้ไข / ดีมาก / ติดตามด่วน)

### 4. การเรียกดูข้อมูลย้อนหลัง (History Browsing)
- สามารถเลือกวันที่เพื่อดูรายงานย้อนหลังได้
- ระบบ Read-only อัตโนมัติเมื่อดูข้อมูลย้อนหลัง เพื่อป้องกันการแก้ไขข้อมูลที่ส่งไปแล้ว

### 5. แดชบอร์ดสรุปผล (Admin Dashboard)
- แสดงสถิติภาพรวม (จำนวนคนส่ง, ยังไม่ส่ง, มีปัญหา)
- กรองข้อมูลตามสถานะ และวันที่
- สรุปปัญหาและอุปสรรคที่พบในแต่ละวัน

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```text
wfh/
├── main.py                  # FastAPI server & routes entry point
├── models.py                # Pydantic data models
├── database.py              # Firebase Admin SDK configuration (Singleton)
├── routers/
│   └── reports.py           # CRUD logic for reports and comments
├── static/
│   ├── index.html           # Landing page
│   ├── employee.html        # Employee interface
│   ├── admin.html           # Supervisor/Admin interface
│   ├── css/
│   │   └── style.css        # Shared design system
│   └── js/
│       ├── emp.js           # JS for employee page
│       ├── sup.js           # JS for admin page
│       ├── header.js        # Shared header component
│       └── footer.js        # Shared footer component
└── requirements.txt         # Project dependencies
```

---

## 🛠 เทคโนโลยีที่ใช้ (Tech Stack)

- **Backend:** [FastAPI](https://fastapi.tiangolo.com/) (Python)
- **Database:** [Firebase Firestore](https://firebase.google.com/) (NoSQL)
- **Frontend:** HTML5, Vanilla JavaScript, Vanilla CSS
- **Authentication:** (Hardcoded `/api/me` สำหรับเวอร์ชันปัจจุบัน)

---

## 📦 วิธีการติดตั้งและใช้งาน (Installation)

1. **ติดตั้ง Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **ตั้งค่า Firebase:**
   ตรวจสอบให้แน่ใจว่าได้มีไฟล์ `json` ของ Firebase Service Account ในโฟลเดอร์โปรเจกต์ และได้ตั้งค่าพาธใน `database.py` เรียบร้อยแล้ว

3. **รันเซิร์ฟเวอร์:**
   ```bash
   python main.py
   ```
   หรือใช้ uvicorn โดยตรง:
   ```bash
   uvicorn main:app --reload
   ```

4. **เข้าใช้งาน:**
   เปิดเบราว์เซอร์ไปที่ [http://127.0.0.1:8000](http://127.0.0.1:8000)

---

## 🔌 API Endpoints (สรุป)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/me` | ดึงข้อมูลผู้ใช้ปัจจุบัน |
| GET | `/api/reports/` | ดึงรายงานทั้งหมด (กรองตามวันที่ได้) |
| POST | `/api/reports/` | ส่งหรืออัปเดตรายงาน |
| PATCH | `/api/reports/{id}/tasks` | อัปเดตรายการงานและรายละเอียด |
| POST | `/api/reports/{id}/comments` | เพิ่มความคิดเห็นใหม่ |

---

## 📝 ข้อมูลโครงการ
- **เวอร์ชัน:** 1.5.0
- **ทีมผู้พัฒนา:** ส.อ.พงศ์พันธ์ศํกดิ์ พึ่งชาติ
- **หน่วยงาน:** มหาวิทยาลัยเทคโนโลยีราชมงคลล้านนา ตาก
