# WFH Daily Report — API Documentation

**Base URL:** `http://127.0.0.1:8000`  
**Interactive Docs (Swagger UI):** `http://127.0.0.1:8000/docs`  
**Version:** 1.7.0

---

## Authentication

ทุก endpoint (ยกเว้น `/api/login`) ต้องแนบ token ผ่าน HTTP Header:

```
Authorization: Bearer <email>
```

> ปัจจุบันใช้ email เป็น token ชั่วคราว

---

## Endpoints

### 1. POST `/api/login`

ตรวจสอบ email/password และคืน token

**Request Body**
```json
{
  "email": "user@example.com",
  "password": "plaintext_password"
}
```

**Response 200**
```json
{
  "status": "success",
  "token": "user@example.com",
  "user": {
    "personal_id": "EMP001",
    "firstname": "สมวิทย์",
    "lastname": "หัวหน้างาน",
    "role": "supervisor",
    "department": "วิทยบริการ",
    "level": 1,
    "password": "..."
  }
}
```

**Errors**
| Code | Detail |
|------|--------|
| 401 | Invalid email or password |

---

### 2. GET `/api/me`

คืนข้อมูลผู้ใช้ปัจจุบันจาก token

**Headers:** `Authorization: Bearer <email>`

**Response 200**
```json
{
  "user_id": "EMP001",
  "email": "user@example.com",
  "name": "สมวิทย์ หัวหน้างาน",
  "role": "supervisor",
  "department": "วิทยบริการ",
  "agency": "มทร.ล้านนา ตาก",
  "level": 1
}
```

**Errors**
| Code | Detail |
|------|--------|
| 401 | Not authenticated / Invalid token |

---

### 3. GET `/api/users`

ดึงรายชื่อพนักงานที่ผู้เรียกมีสิทธิ์มองเห็น (ตามระดับสิทธิ์)

**Headers:** `Authorization: Bearer <email>`

**สิทธิ์การมองเห็น**
| Level / Role | เห็นใคร |
|---|---|
| `level 0` | ตัวเองเท่านั้น |
| `level 1–3` | ตัวเอง + ลูกน้องที่กำหนดใน `evaluations` |
| `level 9` หรือ role มีคำว่า `admin` | ทุกคน |

**Response 200**
```json
[
  {
    "user_id": "EMP001",
    "name": "พิสิษฐ์ สุขใส",
    "role": "supervisor",
    "department": "วิทยบริการ"
  }
]
```

**Errors**
| Code | Detail |
|------|--------|
| 401 | Not authenticated / Invalid token |

---

### 4. GET `/api/reports`

ดึงรายการรายงานที่ผู้เรียกมีสิทธิ์มองเห็น

**Headers:** `Authorization: Bearer <email>`

**Query Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `date` | `string` (YYYY-MM-DD) | กรองตามวันที่ (optional) |

**ตัวอย่าง**
```
GET /api/reports?date=2026-04-14
```

**สิทธิ์การมองเห็น** — เหมือน `/api/users`

**Response 200**
```json
[
  {
    "id": "EMP001_2026-04-14",
    "user_id": "EMP001",
    "name": "พิสิษฐ์ สุขใส",
    "role": "supervisor",
    "department": "วิทยบริการ",
    "work_mode": "wfh",
    "progress": 94,
    "problems": "-",
    "plan_tomorrow": "ประชุมทีม",
    "tasks": [ ... ],
    "timestamp": "2026-04-14 19:47:00",
    "submit_time": "19:47",
    "comments": [ ... ]
  }
]
```

**Errors**
| Code | Detail |
|------|--------|
| 401 | Not authenticated / Invalid token |

---

### 5. POST `/api/reports`

สร้างหรืออัปเดตรายงานของวันนี้ (1 รายงาน/คน/วัน — Document ID คือ `{user_id}_{YYYY-MM-DD}`)

ถ้ามีรายงานอยู่แล้วในวันนั้น → **อัปเดต** (comments เดิมถูกเก็บไว้)  
ถ้ายังไม่มี → **สร้างใหม่**

**Headers:** `Authorization: Bearer <email>`

**Request Body**
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

**ค่าที่ยอมรับสำหรับ `work_mode`:** `"wfh"` · `"onsite"` · `"hybrid"`  
**ค่าที่ยอมรับสำหรับ `status` (task):** `"done"` · `"prog"` · `"pend"`

**Response 200** — Report object เหมือน GET `/api/reports`

---

### 6. GET `/api/reports/{report_id}`

ดึงรายงานเดี่ยวตาม ID

**Path Parameter:** `report_id` — รูปแบบ `{user_id}_{YYYY-MM-DD}` เช่น `EMP001_2026-04-14`

**Response 200** — Report object  
**Errors**
| Code | Detail |
|------|--------|
| 404 | Report not found |

---

### 7. PATCH `/api/reports/{report_id}/tasks`

อัปเดตรายการงาน (tasks) ของรายงาน — **แทนที่ทั้งหมด**

**Request Body**
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

### 8. POST `/api/reports/{report_id}/comments`

เพิ่มคอมเมนต์ในรายงาน (สื่อสารระหว่างหัวหน้างาน ↔ พนักงาน)

**Request Body**
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

**Response 200**
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

## Data Models

### Report Object
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `{user_id}_{YYYY-MM-DD}` |
| `user_id` | string | personal_id ของพนักงาน |
| `name` | string | ชื่อ-นามสกุล |
| `role` | string | ตำแหน่งงาน |
| `department` | string | หน่วยงาน |
| `work_mode` | string | `wfh` / `onsite` / `hybrid` |
| `progress` | int | 0–100 |
| `problems` | string | ปัญหา (ใช้ `"-"` หากไม่มี) |
| `plan_tomorrow` | string | แผนงานวันพรุ่งนี้ |
| `tasks` | Task[] | รายการงาน |
| `timestamp` | string | `YYYY-MM-DD HH:MM:SS` (ICT) |
| `submit_time` | string | `HH:MM` |
| `comments` | Comment[] | คอมเมนต์ทั้งหมด |

### Task Object
| Field | Type | Description |
|-------|------|-------------|
| `id` | int | ลำดับงาน |
| `title` | string | ชื่องาน |
| `description` | string | รายละเอียด (optional) |
| `status` | string | `done` / `prog` / `pend` |

### Comment Object
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UUID |
| `author_id` | string | personal_id ของผู้คอมเมนต์ |
| `author_name` | string | ชื่อผู้คอมเมนต์ |
| `author_role` | string | ตำแหน่งผู้คอมเมนต์ |
| `avatar_color` | string | class สี avatar |
| `author_initials` | string | อักษรย่อ (2 ตัว) |
| `message` | string | ข้อความ |
| `tag` | string | แท็กสถานะ (optional) |
| `timestamp` | string | `HH:MM` |

---

## Firebase Collections

| Collection | Document ID | คำอธิบาย |
|-----------|-------------|----------|
| `users` | `email` | ข้อมูลผู้ใช้และรหัสผ่าน |
| `evaluations` | `target_id` | Mapping หัวหน้า → ลูกน้อง |
| `reports` | `{user_id}_{YYYY-MM-DD}` | รายงานรายวัน |
