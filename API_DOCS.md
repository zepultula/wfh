# WFH Daily Report — API Documentation

**Base URL:** `http://127.0.0.1:8000`  
**Interactive Docs (Swagger UI):** `http://127.0.0.1:8000/docs`  
**Version:** 3.0.1

---

## Authentication

ทุก endpoint (ยกเว้น `POST /api/login`) ต้องแนบ JWT Token ผ่าน HTTP Header:

```
Authorization: Bearer <jwt_token>
```

Token ได้มาจาก `POST /api/login` และมีอายุ **8 ชั่วโมง**  
`header.js` ของ Frontend จะแนบ Token นี้ให้อัตโนมัติทุก Request ที่ขึ้นต้นด้วย `/api/`

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
| `9` หรือ role มี `admin` | ผู้ดูแลระบบ (Super Admin) | เห็นทุกคน + จัดการผู้ใช้ + จัดการสายบังคับบัญชา |

---

## Endpoints

---

### Auth & Profile

---

#### 1. POST `/api/login`

ตรวจสอบ credentials และออก JWT Token

**รองรับ 2 รูปแบบ:**
- Email เต็ม: `zepultula@rmutl.ac.th`
- Username ย่อ: `zepultula` (ระบบค้นหา email จาก Firestore ด้วย range query อัตโนมัติ)

**Request Body**
```json
{
  "email": "zepultula",
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
| 401 | Invalid credentials |

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
    "name": "พิสิษฐ์ สุขใส",
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
  "name": "พิสิษฐ์ สุขใส",
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
| `id` | int | ลำดับงาน |
| `title` | string | ชื่องาน |
| `description` | string | รายละเอียด (optional, default `""`) |
| `status` | string | `done` / `prog` / `pend` |

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
