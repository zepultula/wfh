# WFH Daily Report — API Documentation

**Base URL:** `http://127.0.0.1:8100`  
**Interactive Docs (Swagger UI):** `http://127.0.0.1:8100/docs`  
**Version:** 3.6.2

---

## Authentication

ทุก endpoint (ยกเว้น `POST /api/login`) ต้องแนบ JWT Token ผ่าน HTTP Header:

```
Authorization: Bearer <jwt_token>
```

Token ได้มาจาก `POST /api/login` และมีอายุ **8 ชั่วโมง**  
`header.js` ของ Frontend จะแนบ Token นี้ให้อัตโนมัติทุก Request ที่ขึ้นต้นด้วย `/api/`

**Security Notes:**
- **(v3.6.2+) AD Authentication:** ระบบยืนยันตัวตนผ่าน Active Directory (`ldap3`) เป็นหลัก — รหัสผ่านเดียวกับ Windows/Email องค์กร
- **Fallback:** หาก AD Server ไม่ตอบสนอง (timeout/network error) จะ fallback ตรวจสอบ bcrypt จาก Firestore โดยอัตโนมัติ
- รหัสผ่านในระบบถูกเข้ารหัสด้วย **BCrypt (rounds=12)** (v3.4.1+) — ใช้ในเส้นทาง fallback เท่านั้น
- ระบบรองรับ Lazy Migration สำหรับรหัสผ่านเดิมที่ยังเป็นข้อความปกติ โดยจะถูกเข้ารหัสอัตโนมัติเมื่อ fallback path ทำงานสำเร็จ

**JWT Payload:**
```json
{
  "sub": "user@rmutl.ac.th",
  "user_id": "EMP001",
  "name": "สมวิทย์ หัวหน้างาน",
  "role": "supervisor",
  "position": "นักวิชาการคอมพิวเตอร์",
  "level": 1,
  "department": "วิทยบริการ",
  "agency": "มทร.ล้านนา ตาก",
  "exp": 1713200000
}
```

---

## Role-Based Access Control (RBAC)

| Level | บทบาท | สิทธิ์ |
|-------|-------|-------|
| `0` | พนักงาน (Employee) | เห็นและแก้ไขรายงานของตนเองเท่านั้น |
| `1–3` | หัวหน้างาน (Supervisor) | เห็นรายงานของตนเอง + ลูกน้องในสายบังคับบัญชา + ดูสถิติ/Export |
| `9` หรือ role มี `admin` | ผู้ดูแลระบบ (Super Admin) | เห็นทุกคน + จัดการผู้ใช้ + จัดการสายบังคับบัญชา + จัดการประกาศ |

---

## Endpoints

---

### Auth & Profile

---

#### 1. POST `/api/login`

ตรวจสอบ credentials และออก JWT Token

**Auth Flow (v3.6.2+):**
1. Normalize username — ตัด `@domain` ออกถ้ามี → สร้าง `full_email = username@rmutl.ac.th`
2. ยืนยันตัวตนผ่าน **Active Directory** (`RMUTL\username`) — timeout 3 วินาที
3. ถ้า AD พร้อมแต่รหัสผิด → `401` ทันที
4. ดึง user document จาก **Firestore** — ถ้าไม่มี → `401`
5. ถ้า AD ล่ม → **fallback** ตรวจ bcrypt จาก Firestore
6. ออก JWT Token

**รองรับ 2 รูปแบบ input:**
- Email เต็ม: `zootopia@rmutl.ac.th`
- Username ย่อ: `zootopia` (ระบบ normalize ให้เองอัตโนมัติ)

**Request Body**
```json
{
  "email": "zootopia",
  "password": "plaintext_password"
}
```

**Response 200**
```json
{
  "status": "success",
  "token": "<jwt_token_string>",
  "user": {
    "personal_id": "EMP001",
    "firstname": "สมวิทย์",
    "lastname": "หัวหน้างาน",
    "email": "user@rmutl.ac.th",
    "position": "นักวิชาการคอมพิวเตอร์",
    "role": "supervisor",
    "department": "วิทยบริการ",
    "agency": "มทร.ล้านนา ตาก",
    "level": 1,
    "ignore": 0
  }
}
```

**Errors**
| Code | Detail |
|------|--------|
| 401 | ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (AD ปฏิเสธ หรือ fallback bcrypt ล้มเหลว) |
| 401 | ไม่พบบัญชีผู้ใช้ในระบบ (AD ผ่าน แต่ไม่มี user ใน Firestore) |

---

#### 2. GET `/api/me`

คืนข้อมูลผู้ใช้ปัจจุบันจาก JWT Token (ไม่ query Firestore)

**Response 200**
```json
{
  "user_id": "EMP001",
  "email": "user@rmutl.ac.th",
  "name": "สมวิทย์ หัวหน้างาน",
  "role": "supervisor",
  "position": "นักวิชาการคอมพิวเตอร์",
  "department": "วิทยบริการ",
  "agency": "มทร.ล้านนา ตาก",
  "level": 1
}
```

**Errors**
| Code | Detail |
|------|--------|
| 401 | Not authenticated / Token expired |

---

#### 3. POST `/api/me/password`

เปลี่ยนรหัสผ่านของตนเอง (ไม่ต้องการสิทธิ์พิเศษ — ทุกคนทำได้)  
หลังเปลี่ยนสำเร็จ Frontend จะบังคับ Logout อัตโนมัติเพื่อความปลอดภัย

**Request Body**
```json
{
  "new_password": "newpass123",
  "confirm_password": "newpass123"
}
```

**Response 200**
```json
{
  "status": "success",
  "message": "Password updated successfully"
}
```

**Errors**
| Code | Detail |
|------|--------|
| 400 | Passwords do not match |
| 400 | Password must be at least 4 characters long |
| 401 | Not authenticated |
| 404 | User not found |

---

#### 4. GET `/api/users`

ดึงรายชื่อพนักงานที่ผู้เรียกมีสิทธิ์มองเห็น (กรองตาม RBAC)

**Response 200**
```json
[
  {
    "user_id": "EMP001",
    "name": "สมชาย วงค์แหวน",
    "role": "supervisor",
    "position": "นักวิชาการคอมพิวเตอร์",
    "department": "วิทยบริการ",
    "ignore": 0
  }
]
```

> หมายเหตุ: ผู้ใช้ที่มี `ignore=1` จะ**ไม่ถูก**กรองออกที่ endpoint นี้ — Frontend กรองเองใน client side

**Errors**
| Code | Detail |
|------|--------|
| 401 | Not authenticated |

---

### Reports

---

#### 5. GET `/api/reports`

ดึงรายการรายงานที่ผู้เรียกมีสิทธิ์มองเห็น (กรองตาม RBAC)

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | `YYYY-MM-DD` | ไม่บังคับ | กรองตามวันที่ |

**ตัวอย่าง**
```
GET /api/reports?date=2026-04-15
```

**Response 200** — `ReportOut[]` (ดู Data Models)

**Errors**
| Code | Detail |
|------|--------|
| 401 | Not authenticated |

---

#### 6. POST `/api/reports`

สร้างหรืออัปเดตรายงานของวันนี้ (1 รายงาน/คน/วัน)

- Document ID: `{user_id}_{YYYY-MM-DD}`
- ถ้ามีรายงานอยู่แล้ว → **อัปเดต** (comments เดิมถูกเก็บไว้ครบ)
- ถ้ายังไม่มี → **สร้างใหม่** พร้อม `comments: []`
- Timestamp ใช้ Timezone `Asia/Bangkok` (ICT)

**Request Body** — `ReportCreate`
```json
{
  "user_id": "EMP001",
  "name": "สมชาย วงค์แหวน",
  "role": "supervisor",
  "department": "วิทยบริการ",
  "work_mode": "wfh",
  "progress": 94,
  "problems": "-",
  "plan_tomorrow": "ประชุมทีม",
  "tasks": [
    {
      "id": 1,
      "title": "ออกแบบระบบรายงาน",
      "description": "รายละเอียดเพิ่มเติม",
      "status": "done"
    }
  ]
}
```

**ค่าที่ยอมรับ:**
- `work_mode`: `"wfh"` · `"onsite"` · `"hybrid"`
- `status` (task): `"done"` · `"prog"` · `"pend"`

**Response 200** — `ReportOut` object

---

#### 7. GET `/api/reports/{report_id}`

ดึงรายงานเดี่ยวตาม ID

**Path Parameter:** `report_id` — รูปแบบ `{user_id}_{YYYY-MM-DD}` เช่น `EMP001_2026-04-15`

**Response 200** — `ReportOut` object

**Errors**
| Code | Detail |
|------|--------|
| 404 | Report not found |

---

#### 8. PATCH `/api/reports/{report_id}/tasks`

อัปเดตรายการงาน (tasks) ของรายงาน — **แทนที่ tasks ทั้งหมด**  
ใช้โดย Auto-save ของ Frontend

**Request Body** — `TaskModel[]`
```json
[
  { "id": 1, "title": "งานแรก", "description": "", "status": "done" },
  { "id": 2, "title": "งานที่สอง", "description": "รายละเอียด", "status": "prog" }
]
```

**Response 200**
```json
{ "success": true }
```

**Errors**
| Code | Detail |
|------|--------|
| 404 | Report not found |

---

#### 9. POST `/api/reports/{report_id}/comments`

เพิ่มคอมเมนต์ในรายงาน (สื่อสารระหว่างหัวหน้างาน ↔ พนักงาน)

**Request Body** — `CommentCreate`
```json
{
  "author_id": "EMP001",
  "author_name": "สมวิทย์ หัวหน้างาน",
  "author_role": "หัวหน้างาน",
  "avatar_color": "av-blue",
  "author_initials": "สว",
  "message": "ดีมากเลย ขยันมาก",
  "tag": "ดีมาก"
}
```

**ค่า `tag` ที่ใช้ได้:** `"รับทราบ"` · `"ต้องแก้ไข"` · `"ดีมาก"` · `"ติดตามด่วน"` · `""` (ไม่มีแท็ก)  
**ค่า `avatar_color` ที่ใช้ได้:** `"av-blue"` · `"av-teal"` · `"av-purple"` · `"av-coral"` · `"av-amber"` · `"av-gray"`

**Response 200** — `CommentModel` object
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "author_id": "EMP001",
  "author_name": "สมวิทย์ หัวหน้างาน",
  "author_role": "หัวหน้างาน",
  "avatar_color": "av-blue",
  "author_initials": "สว",
  "message": "ดีมากเลย ขยันมาก",
  "tag": "ดีมาก",
  "timestamp": "19:55"
}
```

**Errors**
| Code | Detail |
|------|--------|
| 404 | Report not found |

---

### Uploads

---

#### 10. POST `/api/upload`

อัปโหลดไฟล์สื่อเพื่อนำไปใช้ควบคู่กับงานรายวัน

**Request Body** — `multipart/form-data`
| Field | Type | Description |
|-------|------|-------------|
| `file` | File | ไฟล์ที่ต้องการอัปโหลด (อนุญาตเฉพาะ .pdf ขนาดไม่เกิน 10MB) |

**Response 200**
```json
{
  "name": "a1b2c3d4_document.pdf",
  "url": "/uploads/a1b2c3d4_document.pdf"
}
```

**Errors**
| Code | Detail |
|------|--------|
| 400 | เฉพาะไฟล์ PDF เท่านั้น |
| 401 | Not authenticated |

---

### Admin — User Management (Super Admin only)

> Endpoints ในหมวดนี้ต้องการ `level=9` หรือ `role` มีคำว่า `admin`  
> ส่ง `403 Forbidden` หากไม่มีสิทธิ์

---

#### 10. GET `/api/admin/users`

ดึงรายชื่อพนักงานทั้งหมดในระบบ รวมทั้งที่มี `ignore=1` เรียงตาม department → firstname

**Response 200** — `User[]`
```json
[
  {
    "personal_id": "EMP001",
    "firstname": "สมวิทย์",
    "lastname": "หัวหน้างาน",
    "email": "user@rmutl.ac.th",
    "position": "นักวิชาการคอมพิวเตอร์",
    "department": "วิทยบริการ",
    "agency": "มทร.ล้านนา ตาก",
    "level": 1,
    "role": "supervisor",
    "password": "...",
    "ignore": 0
  }
]
```

---

#### 11. POST `/api/admin/users`

สร้างบัญชีผู้ใช้งานใหม่ (Document ID = email)

**Request Body**
```json
{
  "personal_id": "EMP099",
  "firstname": "มานะ",
  "lastname": "ใจดี",
  "email": "mana@rmutl.ac.th",
  "position": "นักวิชาการ",
  "department": "วิทยบริการ",
  "agency": "มทร.ล้านนา ตาก",
  "level": 0,
  "role": "employee",
  "password": "initialpass",
  "ignore": 0
}
```

**Response 201**
```json
{ "success": true, "email": "mana@rmutl.ac.th" }
```

**Errors**
| Code | Detail |
|------|--------|
| 409 | Email นี้มีอยู่ในระบบแล้ว |

---

#### 12. PUT `/api/admin/users/{email}`

แก้ไขข้อมูลผู้ใช้ (Partial update — ส่งเฉพาะฟิลด์ที่ต้องการแก้ไข)  
`{email}` ใน path ต้อง `encodeURIComponent` (รองรับ `@` และ `.`)

**Request Body** — ฟิลด์ทั้งหมด Optional
```json
{
  "level": 3,
  "position": "หัวหน้าหน่วย",
  "password": "newpass"
}
```

**Response 200**
```json
{ "success": true }
```

**Errors**
| Code | Detail |
|------|--------|
| 400 | No fields to update |
| 404 | User not found |

---

#### 13. DELETE `/api/admin/users/{email}`

ลบบัญชีผู้ใช้งาน (ลบถาวร)  
แนะนำให้ใช้ `ignore=1` แทนหากต้องการซ่อนชั่วคราว

**Response 200**
```json
{ "success": true }
```

**Errors**
| Code | Detail |
|------|--------|
| 404 | User not found |

---

### Admin — Evaluation Management (Super Admin only)

---

#### 14. GET `/api/admin/evaluations`

ดึงรายชื่อผู้ใช้ทั้งหมดพร้อม join ข้อมูลผู้ประเมิน (หัวหน้างาน) จาก `evaluations` collection

**Response 200**
```json
{
  "users": [
    {
      "personal_id": "EMP001",
      "name": "สมวิทย์ หัวหน้างาน",
      "position": "นักวิชาการคอมพิวเตอร์",
      "department": "วิทยบริการ",
      "level": 1,
      "ignore": 0
    }
  ],
  "evaluations": [
    {
      "target_id": "EMP002",
      "target_name": "มานะ ใจดี",
      "target_department": "วิทยบริการ",
      "target_position": "นักวิชาการ",
      "target_level": 0,
      "target_ignore": 0,
      "evaluators": [
        {
          "evaluator_id": "EMP001",
          "name": "สมวิทย์ หัวหน้างาน",
          "position": "นักวิชาการคอมพิวเตอร์",
          "department": "วิทยบริการ"
        }
      ]
    }
  ]
}
```

---

#### 15. PUT `/api/admin/evaluations/{target_id}`

อัปเดตรายชื่อผู้ประเมินของพนักงาน (แทนที่ทั้งหมด)  
ลำดับใน array = ลำดับความสำคัญ (`order: 1` = ผู้ประเมินหลัก)

**Request Body**
```json
{
  "evaluator_ids": ["EMP001", "EMP003"]
}
```

**Response 200**
```json
{ "success": true }
```

---

### Admin — Statistics & Export (Admin level 1+)

> Endpoints ในหมวดนี้ต้องการ `level >= 1` หรือ role มี `admin`  
> Super admin เห็นข้อมูลทุกคน, Supervisor เห็นเฉพาะตนเอง + ลูกน้องในสายบังคับบัญชา

---

#### 16. GET `/api/admin/stats`

สถิติรายเดือนต่อคน พร้อม KPI สรุป

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `month` | `YYYY-MM` | บังคับ | เดือนที่ต้องการดูสถิติ |

**ตัวอย่าง**
```
GET /api/admin/stats?month=2026-04
```

**Response 200**
```json
{
  "month": "2026-04",
  "calendar_days": 30,
  "weekdays": 22,
  "users": [
    {
      "personal_id": "EMP001",
      "name": "สมวิทย์ หัวหน้างาน",
      "position": "นักวิชาการคอมพิวเตอร์",
      "department": "วิทยบริการ",
      "days_submitted": 20,
      "compliance": 90.9,
      "avg_progress": 85.5,
      "wfh_days": 15,
      "onsite_days": 3,
      "hybrid_days": 2,
      "total_tasks": 62,
      "done_tasks": 54,
      "problem_days": 2
    }
  ]
}
```

**Errors**
| Code | Detail |
|------|--------|
| 400 | Invalid month format. Use YYYY-MM |
| 403 | Forbidden: admin access required |

---

#### 17. GET `/api/admin/stats/export`

ดาวน์โหลดไฟล์ Excel สถิติรายเดือน (`.xlsx`)

**Query Parameters** — เหมือน `/api/admin/stats`

**Response** — `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`  
ชื่อไฟล์: `stats_{YYYY-MM}.xlsx`

**เนื้อหาใน Excel:**
- Title + สรุปข้อมูลวันทำงาน/จำนวนผู้ใช้
- Header row (สีน้ำเงิน `#1059A3`)
- แถวข้อมูลต่อคน จัดกลุ่มตาม department (สี `#E8EFF8`)
- Color-coded: Compliance% และ Avg Progress% (เขียว ≥80 / เหลือง ≥50 / แดง <50)
- 14 คอลัมน์: ลำดับ, ชื่อ-สกุล, ตำแหน่ง, หน่วยงาน, ส่งรายงาน(วัน), วันทำงาน, Compliance%, Avg Progress%, WFH, On-site, Hybrid, งานทั้งหมด, งานเสร็จ, มีปัญหา(วัน)

---

#### 18. GET `/api/admin/reports/export`

ดาวน์โหลดไฟล์ Excel รายงานประจำวันอย่างละเอียด (`.xlsx`)

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | `YYYY-MM-DD` | บังคับ | วันที่ต้องการ Export |

**ตัวอย่าง**
```
GET /api/admin/reports/export?date=2026-04-15
```

**Response** — `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`  
ชื่อไฟล์: `reports_{YYYY-MM-DD}.xlsx`

**เนื้อหาใน Excel:**
- แถวที่ส่งรายงานแล้ว จัดกลุ่มตาม department
- 12 คอลัมน์: ลำดับ, ชื่อ-สกุล, ตำแหน่ง, หน่วยงาน, รูปแบบทำงาน, ความคืบหน้า%, รายการงาน, สถานะงาน, ปัญหา/อุปสรรค, แผนพรุ่งนี้, คอมเมนต์ (ชื่อ+tag+ข้อความ), เวลาส่ง
- ส่วน "ยังไม่ส่ง" สีแดง จัดกลุ่มตาม department

---

### Announcements

---

#### 21. GET `/api/announcements`

ดึงรายการประกาศ

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `admin` | `0` หรือ `1` | ไม่บังคับ | ถ้า `1` และ level==9 หรือ role มี `admin` → คืนทั้งหมด (รวม inactive) สำหรับหน้าจัดการ |

**Behavior ตาม level:**
- `level=0` (Employee): คืนประกาศที่ `is_active=True` และ `target` เป็น `"all"` หรือ `"employee"`
- `level>=1` (Admin): คืนประกาศที่ `is_active=True` และ `target` เป็น `"all"` หรือ `"admin"`
- Super Admin + `?admin=1`: คืนทั้งหมดโดยไม่ filter `is_active` เรียงตาม `created_at`

**Response 200**
```json
[
  {
    "id": "abc123",
    "title": "ปิดระบบวันศุกร์",
    "body": "ระบบจะปิดให้บริการวันศุกร์ที่ 18 เม.ย. เวลา 18:00 น.",
    "is_active": true,
    "target": "all",
    "created_at": "2026-04-16 10:30:00",
    "created_by": "admin@rmutl.ac.th"
  }
]
```

**Errors**
| Code | Detail |
|------|--------|
| 401 | Not authenticated |

---

#### 22. POST `/api/announcements`

สร้างประกาศใหม่ (Super Admin only)

**Request Body**
```json
{
  "title": "ประกาศสำคัญ",
  "body": "เนื้อหาประกาศ...",
  "is_active": true,
  "target": "all"
}
```

**ค่า `target` ที่ใช้ได้:** `"all"` · `"employee"` · `"admin"`

**Response 201**
```json
{
  "id": "abc123",
  "title": "ประกาศสำคัญ",
  "body": "เนื้อหาประกาศ...",
  "is_active": true,
  "target": "all",
  "created_at": "2026-04-16 10:30:00",
  "created_by": "admin@rmutl.ac.th"
}
```

**Errors**
| Code | Detail |
|------|--------|
| 401 | Not authenticated |
| 403 | Super admin only |

---

#### 23. PATCH `/api/announcements/{ann_id}`

แก้ไขประกาศ (Partial update — ส่งเฉพาะฟิลด์ที่ต้องการแก้ไข) (Super Admin only)

**Request Body** — ฟิลด์ทั้งหมด Optional
```json
{
  "is_active": false
}
```

**Response 200**
```json
{
  "id": "abc123",
  "title": "ประกาศสำคัญ",
  "body": "เนื้อหาประกาศ...",
  "is_active": false,
  "target": "all",
  "created_at": "2026-04-16 10:30:00",
  "created_by": "admin@rmutl.ac.th"
}
```

**Errors**
| Code | Detail |
|------|--------|
| 400 | No fields to update |
| 403 | Super admin only |
| 404 | Announcement not found |

---

#### 24. DELETE `/api/announcements/{ann_id}`

ลบประกาศถาวร (Super Admin only)

**Response 200**
```json
{ "status": "deleted", "id": "abc123" }
```

**Errors**
| Code | Detail |
|------|--------|
| 403 | Super admin only |
| 404 | Announcement not found |

---

### Plans (Weekly Work Plan)

---

#### 25. GET `/api/plans`

ดูแผนงานของตัวเองสำหรับสัปดาห์ที่ระบุ

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `week` | `YYYY-MM-DD` | ไม่บังคับ | วันใดก็ได้ในสัปดาห์นั้น (default = สัปดาห์ปัจจุบัน) |

**Response 200**
```json
{
  "id": "EMP001_2026-04-14",
  "user_id": "EMP001",
  "user_name": "สมชาย วงค์แหวน",
  "department": "วิทยบริการ",
  "week_start": "2026-04-14",
  "created_at": "2026-04-14 09:00:00",
  "updated_at": "2026-04-15 10:30:00",
  "tasks": [
    {
      "id": 1,
      "title": "ประชุมทีม",
      "active_days": ["2026-04-14", "2026-04-16"],
      "description": "",
      "goal": "สรุปแผนงานไตรมาส 2",
      "output": "เอกสารสรุปแผน 1 ฉบับ",
      "kpi_name": "จำนวนแผนงานที่ได้รับอนุมัติ",
      "kpi_target": "1 แผน",
      "approved": false,
      "approved_by": "",
      "approved_at": ""
    }
  ]
}
```

> ถ้าไม่มีแผนในสัปดาห์นั้น จะคืน `{ "id": "...", "week_start": "...", "days": {} }`

---

#### 26. POST `/api/plans`

สร้างหรือแทนที่แผนงานสำหรับสัปดาห์ที่ระบุ  
**Approval fields (`approved`, `approved_by`, `approved_at`) จะ**ไม่ถูก**เขียนทับจาก client** — backend อ่านค่าเดิมจาก Firestore เสมอ

**Request Body**
```json
{
  "week_start": "2026-04-14",
  "tasks": [
    {
      "id": 1618451234567,
      "title": "ประชุมทีม",
      "active_days": ["2026-04-14"],
      "description": "",
      "goal": "สรุปแผนงานไตรมาส 2",
      "output": "เอกสารสรุปแผน 1 ฉบับ",
      "kpi_name": "จำนวนแผนงานที่ได้รับอนุมัติ",
      "kpi_target": "1 แผน"
    }
  ]
}
```

**Response 201** — เหมือน GET `/api/plans` (รวม approval fields จาก Firestore)

---

#### 27. GET `/api/plans/tasks`

ดึงงานในแผนสำหรับวันที่ระบุ — ใช้โดย `emp.js` สำหรับ auto-inject งานเข้ารายงานประจำวัน

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | `YYYY-MM-DD` | บังคับ | วันที่ที่ต้องการดึงงาน |

**Response 200** — `PlanTask[]`  
> คืนเฉพาะงานที่ **`approved=true`** เท่านั้น (v3.5.1+) — งานที่รออนุมัติหรือถูกปฏิเสธจะไม่ถูกส่งกลับมาเพื่อความถูกต้องของข้อมูลในรายงาน

---

#### 28. GET `/api/plans/subordinates`

Admin/Supervisor ดูแผนของลูกน้องทุกคนสำหรับสัปดาห์ที่ระบุ

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `week` | `YYYY-MM-DD` | ไม่บังคับ | default = สัปดาห์ปัจจุบัน |

**สิทธิ์:**
- **Super Admin** → เห็นแผนของทุกคน
- **Level 1-3** → เห็นเฉพาะลูกน้องในสายบังคับบัญชา

**Response 200** — `WeeklyPlan[]` (รายการแผนของลูกน้องแต่ละคน)

**Errors**
| Code | Detail |
|------|--------|
| 403 | สิทธิ์การเข้าถึงสำหรับผู้ดูแลระบบเท่านั้น |

---

#### 29. PATCH `/api/plans/{plan_id}/approve`

อนุมัติหรือไม่อนุมัติงานรายการเดียวในแผน (Admin/Supervisor only)

- `approved: true` → งานได้รับการอนุมัติ; บันทึก `approved_by` (ชื่อผู้อนุมัติ) และ `approved_at` (เวลา ICT)
- `approved: false` → งานถูกปฏิเสธ; บันทึก `approved_by` แต่ `approved_at` = `""`
- เฉพาะ endpoint นี้เท่านั้นที่แก้ `approved`, `approved_by`, `approved_at` ได้ — `POST /api/plans` ไม่อนุญาต

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `plan_id` | string | `{user_id}_{week_start}` เช่น `EMP001_2026-04-14` |

**Request Body**
```json
{
  "task_id": 1,
  "approved": true
}
```

**Response 200**
```json
{
  "status": "ok",
  "plan_id": "EMP001_2026-04-14",
  "date": "2026-04-14",
  "task_id": 1,
  "approved": true
}
```

**Errors**
| Code | Detail |
|------|--------|
| 403 | สิทธิ์การเข้าถึงสำหรับผู้ดูแลระบบเท่านั้น |
| 404 | ไม่พบแผนงานที่ระบุ / ไม่พบงานที่ระบุในแผนงาน |
| 409 | Conflict: ไม่สามารถยกเลิกการอนุมัติงานที่ถูกนำไปลงรายงาน (In-progress) แล้วได้ |

---

#### 30. GET `/api/plans/export/weekly`

ดาวน์โหลดไฟล์ Excel แผนงานรายสัปดาห์ของลูกน้องทุกคนในสายบังคับบัญชา (`.xlsx`)

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `week` | `YYYY-MM-DD` | บังคับ | วันจันทร์ต้นสัปดาห์ที่ต้องการ Export |

**Response** — `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### 31. GET `/api/plans/export/monthly`

ดาวน์โหลดไฟล์ Excel แผนงานรายเดือนของลูกน้องทุกคนในสายบังคับบัญชา (`.xlsx`)

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `month` | `YYYY-MM` | บังคับ | เดือนที่ต้องการ Export (จะรวมทุกสัปดาห์ที่มีวันคาบเกี่ยวในเดือนนั้น) |

**Response** — `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

### Fuel Savings

> Prefix: `/api/fuel`  
> ทุก endpoint ใน group นี้ใช้ `Depends(get_current_user)` ยกเว้น `/savings/all` ที่ตรวจสอบ Token เองผ่าน Header

---

#### 30. GET `/api/fuel/settings`

ดึงการตั้งค่าน้ำมันของผู้ใช้ปัจจุบัน รวม price_history

**Response 200** — `FuelSettingsWithHistory`
```json
{
  "distance_km": 40.0,
  "fuel_efficiency": 15.0,
  "fuel_price": 39.50,
  "toll_parking": 0.0,
  "price_history": [
    { "fuel_price": 40.50, "effective_from": "2026-04-01" },
    { "fuel_price": 39.50, "effective_from": "2026-04-14" }
  ]
}
```

> ถ้าไม่มี doc ใน `fuel_settings` คืน object ที่ทุกค่าเป็น `0` / `[]` (ไม่ throw 404)

---

#### 31. PUT `/api/fuel/settings`

บันทึก/อัปเดตการตั้งค่าน้ำมัน พร้อม append ราคาใหม่ลง price_history

**Request Body** — `FuelSettingsUpdate`
```json
{
  "distance_km": 40.0,
  "fuel_efficiency": 15.0,
  "fuel_price": 39.50,
  "toll_parking": 20.0,
  "effective_from": "2026-04-14"
}
```

> `effective_from` เป็น Optional — ถ้าไม่ระบุใช้วันนี้ (`date.today().isoformat()`)  
> ถ้ามี entry ที่ `effective_from` ตรงกันอยู่แล้ว → **อัปเดตราคา** (ไม่สร้าง entry ซ้ำ)

**Response 200**
```json
{ "status": "success" }
```

**Errors**
| Code | Detail |
|------|--------|
| 400 | user_id หายไปจาก token |
| 422 | อัตราสิ้นเปลืองน้ำมันต้องมากกว่า 0 |

---

#### 32. GET `/api/fuel/savings`

คำนวณเงินที่ประหยัดได้จาก WFH รายเดือน (per-day price accuracy)

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `month` | `YYYY-MM` | บังคับ | เดือนที่ต้องการคำนวณ |

**ตัวอย่าง**
```
GET /api/fuel/savings?month=2026-04
```

**Response 200** — `FuelSavingsResponse`
```json
{
  "settings": {
    "distance_km": 40.0,
    "fuel_efficiency": 15.0,
    "fuel_price": 39.50,
    "toll_parking": 20.0
  },
  "wfh_days": 12,
  "daily_fuel_cost": 105.33,
  "daily_total_cost": 125.33,
  "monthly_savings": 1503.96,
  "month": "2026-04"
}
```

> `daily_fuel_cost` / `daily_total_cost` ใช้ราคาที่มีผล ณ **วันนี้** (สำหรับแสดงข้อมูล)  
> `monthly_savings` = สะสมต่อวัน โดยแต่ละวัน WFH ใช้ราคาที่มีผล ณ วันนั้น (แม่นยำที่สุด)

**Errors**
| Code | Detail |
|------|--------|
| 400 | รูปแบบเดือนไม่ถูกต้อง |
| 404 | กรุณาบันทึกการตั้งค่าก่อน |

---

#### 33. GET `/api/fuel/savings/weekly`

คำนวณเงินที่ประหยัดได้จาก WFH รายอาทิตย์

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `week` | `YYYY-MM-DD` | บังคับ | วันใดก็ได้ในอาทิตย์นั้น (ระบบคำนวณ Mon–Sun เอง) |

**ตัวอย่าง**
```
GET /api/fuel/savings/weekly?week=2026-04-15
```

**Response 200** — `FuelSavingsWeeklyResponse`
```json
{
  "settings": {
    "distance_km": 40.0,
    "fuel_efficiency": 15.0,
    "fuel_price": 39.50,
    "toll_parking": 20.0
  },
  "wfh_days": 3,
  "daily_fuel_cost": 105.33,
  "daily_total_cost": 125.33,
  "weekly_savings": 375.99,
  "week_start": "2026-04-14",
  "week_end": "2026-04-20"
}
```

> `fuel_price` ที่ใช้คือราคาที่มีผล ณ **วันจันทร์ต้นอาทิตย์** (ราคาเดียวตลอดทั้งอาทิตย์)

**Errors**
| Code | Detail |
|------|--------|
| 400 | รูปแบบวันที่ไม่ถูกต้อง |
| 404 | กรุณาบันทึกการตั้งค่าก่อน |

---

#### 34. GET `/api/fuel/savings/all`

สรุปค่าน้ำมันที่ประหยัดได้ของพนักงานทุกคน (Admin level 1+)

**Auth:** ตรวจสอบผ่าน `Authorization: Bearer <token>` Header โดยตรง  
**สิทธิ์:** `level >= 1` หรือ role มี `admin`

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `month` | `YYYY-MM` | บังคับ | เดือนที่ต้องการสรุป |

**Response 200**
```json
{
  "month": "2026-04",
  "users": [
    {
      "user_id": "EMP001",
      "name": "สมวิทย์ หัวหน้างาน",
      "department": "วิทยบริการ",
      "position": "นักวิชาการคอมพิวเตอร์",
      "distance_km": 40.0,
      "fuel_efficiency": 15.0,
      "fuel_price": 39.50,
      "toll_parking": 20.0,
      "wfh_days": 12,
      "daily_fuel_cost": 105.33,
      "daily_total_cost": 125.33,
      "monthly_savings": 1503.96
    }
  ]
}
```

> แสดงเฉพาะพนักงานที่ `ignore=0` และมี doc ใน `fuel_settings`  
> `fuel_price` = ราคาล่าสุดที่แต่ละคนบันทึกไว้ (ไม่ใช่ per-day — เพื่อประสิทธิภาพ)  
> เรียงตาม department → name

**Errors**
| Code | Detail |
|------|--------|
| 400 | รูปแบบเดือนไม่ถูกต้อง |
| 401 | ไม่ได้รับอนุญาต / Token ไม่ถูกต้อง |
| 403 | ต้องการสิทธิ์ระดับ Admin |

---

### Admin — Data Migration (Super Admin only)

> Endpoints เหล่านี้ **Idempotent** — รันซ้ำกี่ครั้งก็ได้ผลเหมือนเดิม  
> ใช้ครั้งเดียวเมื่อ deploy ฟีเจอร์ใหม่ที่ต้องการ schema field เพิ่ม

---

#### 19. POST `/api/admin/migrate/ignore`

เพิ่ม field `ignore=0` ให้ผู้ใช้ที่ยังไม่มี field นี้ (เพิ่มใน v1.9.0)

**Response 200**
```json
{ "updated": 15 }
```

---

#### 20. POST `/api/admin/migrate/evaluator-ids`

เพิ่ม field `evaluator_ids` (flat array) ให้ evaluation documents ที่ยังไม่มี field นี้ (เพิ่มใน v2.0.0)  
ใช้สำหรับ Firestore `array_contains` query ที่มีประสิทธิภาพสูงกว่าการวนลูป

**Response 200**
```json
{ "updated": 82 }
```

---

## Data Models

### UserInfo
| Field | Type | Description |
|-------|------|-------------|
| `user_id` | string | `personal_id` ของพนักงาน |
| `email` | string | อีเมล (Document ID ใน Firestore) |
| `name` | string | ชื่อ-นามสกุล |
| `role` | string | auth role (`employee`, `supervisor`, `admin`) |
| `position` | string | ตำแหน่งงานจริง เช่น "นักวิชาการคอมพิวเตอร์" |
| `department` | string | หน่วยงาน/แผนก |
| `agency` | string | สังกัด |
| `level` | int | ระดับสิทธิ์ (0–3, 9) |

> `position` ใช้แสดงผลใน UI แทน `role` (ซึ่งเป็น auth role ภายใน)

---

### ReportOut
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `{user_id}_{YYYY-MM-DD}` |
| `user_id` | string | `personal_id` ของพนักงาน |
| `name` | string | ชื่อ-นามสกุล |
| `role` | string | auth role |
| `department` | string | หน่วยงาน |
| `work_mode` | string | `wfh` / `onsite` / `hybrid` |
| `progress` | int | ความคืบหน้า 0–100 |
| `problems` | string | ปัญหา (ใช้ `"-"` หากไม่มี) |
| `plan_tomorrow` | string | แผนงานวันพรุ่งนี้ |
| `tasks` | `TaskModel[]` | รายการงาน |
| `timestamp` | string | `YYYY-MM-DD HH:MM:SS` (ICT) |
| `submit_time` | string | `HH:MM` |
| `comments` | `CommentModel[]` | คอมเมนต์ทั้งหมด |

---

### TaskModel
| Field | Type | Description |
|-------|------|-------------|
| `id` | int | ลำดับงาน / Timestamp ID |
| `title` | string | ชื่องาน |
| `description` | string | รายละเอียด (optional) |
| `status` | string | `done` / `prog` / `pend` |
| `task_type` | string | `"งานประจำ"`, `"งานที่รับมอบหมาย"`, `"แผนงานเชิงพัฒนา"` |
| `started_at` | string | ISO Timestamp (เมื่อกดเริ่ม Timer) |
| `elapsed_seconds` | int | จำนวนวินาทีที่ใช้ไปสะสม |

---

### CommentModel
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UUID v4 |
| `author_id` | string | `personal_id` ของผู้คอมเมนต์ |
| `author_name` | string | ชื่อผู้คอมเมนต์ |
| `author_role` | string | role ของผู้คอมเมนต์ (ใช้ตรวจสอบว่าเป็นหัวหน้าหรือไม่) |
| `avatar_color` | string | CSS class สีอวตาร |
| `author_initials` | string | อักษรย่อ 2 ตัว |
| `message` | string | ข้อความคอมเมนต์ |
| `tag` | string | แท็กสถานะ (optional) |
| `timestamp` | string | `HH:MM` (ICT) |

---

### PlanTask
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | int | บังคับ | ID งาน (stable — ใช้ Date.now()) |
| `title` | string | บังคับ | ชื่องาน |
| `active_days` | `string[]` | บังคับ | รายการวันที่เลือกปฏิบัติงาน `[YYYY-MM-DD]` |
| `description` | string | ไม่บังคับ (default `""`) | คำอธิบายเพิ่มเติม |
| `goal` | string | บังคับ (UI) / optional (API) | เป้าหมายของงาน |
| `output` | string | บังคับ (UI) / optional (API) | ผลผลิต/สิ่งที่ส่งมอบ |
| `kpi_name` | string | บังคับ (UI) / optional (API) | ชื่อตัวชี้วัด |
| `kpi_target` | string | บังคับ (UI) / optional (API) | ค่าเป้าหมายของตัวชี้วัด |
| `approved` | bool | ระบบกำหนด | สถานะการอนุมัติ (แก้ไขได้เฉพาะ PATCH `/approve`) |
| `approved_by` | string | ระบบกำหนด | ชื่อผู้อนุมัติ/ปฏิเสธ |
| `approved_at` | string | ระบบกำหนด | เวลาอนุมัติ (ICT); `""` ถ้าปฏิเสธ |

> **สถานะงาน (3 ค่า):**
> - `approved=false, approved_by=""` → **Pending** (รอรีวิว)
> - `approved=true` → **Approved** (อนุมัติแล้ว — lock ทุกช่อง, ห้ามลบ)
> - `approved=false, approved_by≠""` → **Rejected** (ไม่อนุมัติ — ซ่อนใน auto-inject)

---

### FuelSettings
| Field | Type | Description |
|-------|------|-------------|
| `distance_km` | float | ระยะทางไป-กลับต่อวัน (กม.) |
| `fuel_efficiency` | float | อัตราสิ้นเปลือง (กม./ลิตร) |
| `fuel_price` | float | ราคาน้ำมันต่อลิตร (บาท) |
| `toll_parking` | float | ค่าทางด่วน/จอดรถต่อวัน (บาท) — default `0.0` |

### FuelSettingsUpdate (Request Body — PUT /api/fuel/settings)
เหมือน `FuelSettings` + เพิ่ม `effective_from: Optional[str]` (YYYY-MM-DD, default = วันนี้)

### FuelSettingsWithHistory (Response — GET /api/fuel/settings)
เหมือน `FuelSettings` + `price_history: PriceEntry[]`

### PriceEntry
| Field | Type | Description |
|-------|------|-------------|
| `fuel_price` | float | ราคาน้ำมันต่อลิตร (บาท) |
| `effective_from` | string | วันที่ราคานี้มีผล รูปแบบ YYYY-MM-DD |

### FuelSavingsResponse
| Field | Type | Description |
|-------|------|-------------|
| `settings` | `FuelSettings` | การตั้งค่าของผู้ใช้ (fuel_price = ราคาวันนี้) |
| `wfh_days` | int | จำนวนวัน WFH จริงในเดือน |
| `daily_fuel_cost` | float | ค่าน้ำมัน/วัน ณ ราคาวันนี้ (บาท) |
| `daily_total_cost` | float | ค่าใช้จ่าย/วัน รวมทางด่วน (บาท) |
| `monthly_savings` | float | เงินที่ประหยัดได้รวมทั้งเดือน — คำนวณ per-day price (บาท) |
| `month` | string | เดือนที่คำนวณ YYYY-MM |

### FuelSavingsWeeklyResponse
| Field | Type | Description |
|-------|------|-------------|
| `settings` | `FuelSettings` | การตั้งค่าของผู้ใช้ (fuel_price = ราคา ณ วันจันทร์) |
| `wfh_days` | int | จำนวนวัน WFH จริงในอาทิตย์ |
| `daily_fuel_cost` | float | ค่าน้ำมัน/วัน (บาท) |
| `daily_total_cost` | float | ค่าใช้จ่าย/วัน รวมทางด่วน (บาท) |
| `weekly_savings` | float | เงินที่ประหยัดได้รวมทั้งอาทิตย์ (บาท) |
| `week_start` | string | วันจันทร์ต้นอาทิตย์ YYYY-MM-DD |
| `week_end` | string | วันอาทิตย์ปลายอาทิตย์ YYYY-MM-DD |

---

### AnnouncementCreate (Request Body)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | บังคับ | หัวข้อประกาศ |
| `body` | string | บังคับ | เนื้อหาประกาศ (รองรับ newline) |
| `is_active` | bool | ไม่บังคับ (default `true`) | สถานะเปิด/ปิดประกาศ |
| `target` | string | ไม่บังคับ (default `"all"`) | กลุ่มเป้าหมาย: `"all"` / `"employee"` / `"admin"` |

### AnnouncementUpdate (Request Body)
ฟิลด์เดียวกับ `AnnouncementCreate` แต่ทุกฟิลด์เป็น Optional (ส่งเฉพาะที่ต้องการแก้ไข)

---

### MonthlyStatUser
| Field | Type | Description |
|-------|------|-------------|
| `personal_id` | string | รหัสพนักงาน |
| `name` | string | ชื่อ-นามสกุล |
| `position` | string | ตำแหน่งงาน |
| `department` | string | หน่วยงาน |
| `days_submitted` | int | จำนวนวันที่ส่งรายงาน |
| `compliance` | float | อัตราการส่ง % (days_submitted / weekdays × 100) |
| `avg_progress` | float | ความคืบหน้าเฉลี่ย % |
| `wfh_days` | int | จำนวนวัน WFH |
| `onsite_days` | int | จำนวนวัน On-site |
| `hybrid_days` | int | จำนวนวัน Hybrid |
| `total_tasks` | int | งานทั้งหมด |
| `done_tasks` | int | งานที่เสร็จ |
| `problem_days` | int | วันที่มีการระบุปัญหา |

---

## Error Reference

| Code | ความหมาย |
|------|---------|
| `400` | Bad Request — ข้อมูลที่ส่งมาไม่ถูกต้องหรือไม่ครบ |
| `401` | Unauthorized — ไม่มี Token หรือ Token หมดอายุ |
| `403` | Forbidden — ไม่มีสิทธิ์เข้าถึง endpoint นี้ |
| `404` | Not Found — ไม่พบ resource ที่ร้องขอ |
| `409` | Conflict — ข้อมูลซ้ำ (เช่น email ซ้ำ) |

---

## Important Notes

**Firestore Query — ใช้ `array_contains` (underscore เท่านั้น)**  
Python SDK ใช้ `array_contains` ไม่ใช่ `array-contains`
```python
# ถูกต้อง
.where("evaluator_ids", "array_contains", personal_id)
# ผิด — จะโยน ValueError เงียบๆ
.where("evaluator_ids", "array-contains", personal_id)
```

**Export Endpoints — ต้องใช้ `fetch()` ไม่ใช่ `window.location.href`**  
เพราะต้องแนบ `Authorization` header ผ่าน `header.js` interceptor

**Email ใน URL Path**  
ต้อง `encodeURIComponent(email)` ฝั่ง client เพราะ email มี `@` และ `.`  
FastAPI ใช้ `{email:path}` parameter type เพื่อรองรับ

**Announcements — Super Admin Check**  
`_require_super_admin` ใน `announcements.py` ตรวจสอบ `level == 9 OR 'admin' in role`  
(เหมือนกับ `admin.py`) — ไม่ใช้ level == 9 อย่างเดียว เพื่อรองรับ user ที่มี role 'admin' แต่ level ≠ 9

**Announcements — `is_active=False` ใน PATCH**  
Filter `{k: v for k, v in data.model_dump().items() if v is not None}` ทำงานถูกต้องกับ `is_active=False`  
เพราะ `False is not None` → True — ค่า `False` จะถูก include ใน update เสมอ
