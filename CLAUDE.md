# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **WFH Daily Report API** — a FastAPI backend for managing and tracking daily work-from-home reports. Users submit reports with task progress, problems, and plans, and team members can comment on reports. The frontend is a single-page application served as static assets.

## Architecture

### Backend Structure
- **FastAPI** web framework with CORS middleware enabled for development
- **Firebase Firestore** as the primary database (initialized via async lifespan context manager in main.py)
- **Router-based routing**: Reports are in `routers/reports.py`; extend by creating new routers and including them in main.py
- **Pydantic models** for request/response validation in `models.py`
- **Timezone-aware**: All timestamps use `Asia/Bangkok` timezone

### Frontend
- Single static HTML file served from `static/index.html`
- CSS and JavaScript extracted into `static/css/style.css` and `static/js/app.js` via `split.py`
- Utility script `fix.py` adds data attributes to task status elements for UI interaction

### Data Model
**Reports** contain:
- User info (id, name, role, department, work_mode)
- Report metadata (timestamp, submit_time, progress percentage)
- Task list (each with id, title, status: 'done'/'prog'/'pend')
- Work description (problems, plan_tomorrow)
- Comments (with author info, message, optional tags)

## Common Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Run development server (with auto-reload)
python main.py
# Server runs on http://127.0.0.1:8000

# Extract CSS/JS from HTML mockup
python split.py

# Fix/update HTML task status elements
python fix.py
```

## Key Implementation Details

### Firebase Setup
- Firebase credentials are loaded from `work-from-home-75108-firebase-adminsdk-fbsvc-73f34e61a2.json` in `database.py`
- Connection is lazy-initialized on first API request via `get_db()` (called in the lifespan context manager)
- All Firestore operations happen in routers; database.py only manages the singleton client

### Reports API
- **POST `/api/reports`**: Create a new report (generates UUID, auto-timestamps)
- **GET `/api/reports`**: List all reports; optional `date` query parameter filters by 'YYYY-MM-DD' prefix
- **GET `/api/reports/{id}`**: Fetch a single report
- **POST `/api/reports/{id}/comments`**: Add a comment to a report (generates UUID for comment, timestamps with Bangkok TZ)

Reports are sorted by timestamp descending on retrieval. Comments are stored as a nested array within the report document.

### Static File Serving
- CORS is permissive (`"*"`) to support development
- Static directories (`static/css`, `static/js`) are created on app startup if missing
- Root `/` redirects to `/static/index.html`

## Testing & Debugging

There's no formal test suite yet. To test the API:
- Start the dev server: `python main.py`
- Make requests to `http://127.0.0.1:8000/api/reports` (e.g., via curl, Postman, or the frontend)
- Check Firebase console for data persistence

---

## การสนับสนุนภาษาไทย (Thai Language Support)

### องค์ประกอบภาษาไทยในโปรเจกต์

ฟロントเอนด์ใช้ข้อความภาษาไทยสำหรับสถานะงาน:
- `✓ เสร็จแล้ว` (done) — งานเสร็จสิ้น
- `⋯ กำลังดำเนินการ` (prog) — งานกำลังดำเนินการ
- `◯ ยังไม่เริ่ม` (pend) — งานยังไม่เริ่ม

### หมายเหตุเกี่ยวกับการแก้ไขข้อความไทย

เมื่อแก้ไขข้อความไทยในไฟล์:
- `static/index.html` — เก็บเนื้อหา HTML หลักและข้อความ UI
- `static/css/style.css` — สไตล์ที่สกัดจาก `split.py`
- `static/js/app.js` — โลจิกส์ JavaScript ที่สกัดจาก `split.py`
- `fix.py` — ใช้สำหรับอัปเดตแอตทริบิวต์ `data-status` ในองค์ประกอบสถานะ

### API Response ที่มีข้อมูลไทย

API จะส่งกลับข้อมูลของผู้ใช้ที่อาจมีชื่อและคำอธิบายภาษาไทย:
- `name` — ชื่อผู้ใช้ (ภาษาไทย)
- `role` — ตำแหน่งงาน (ภาษาไทย)
- `department` — แผนก (ภาษาไทย)
- `problems` — ปัญหาที่พบ (ภาษาไทย)
- `plan_tomorrow` — แผนสำหรับวันพรุ่งนี้ (ภาษาไทย)

### เวลา (Timezone)

ทุกการประทับเวลาใช้โซนเวลา `Asia/Bangkok` (ICT) ตามที่กำหนดในไฟล์ `routers/reports.py`:
```python
bz_tz = ZoneInfo('Asia/Bangkok')
```
