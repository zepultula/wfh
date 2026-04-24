# BUG_FIX.md — บันทึกการแก้ไขบัก

---

## [v3.6.2-fix1] Task Description ที่มี Newline ทำให้หน้า Admin Crash

**วันที่:** 2026-04-23
**ไฟล์ที่แก้:** `static/js/sup.js` บรรทัด 480

### อาการ
เมื่อพนักงานกรอก task description แบบหลายบรรทัด (เช่น numbered list ขึ้นบรรทัดใหม่) แล้วแอดมินคลิก "📝 ดูรายละเอียด" ใน admin dashboard จะเกิด error ใน console และ modal ไม่เปิด:
```
Uncaught SyntaxError: Invalid or unexpected token (at admin/:1:10)
```

### สาเหตุ
`sup.js` ใช้วิธี inject description เข้า `onclick` attribute แบบ inline JS string:
```javascript
// โค้ดเดิม (มีปัญหา)
const escapedDesc = (t.description || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
`<button onclick="viewDesc('${escapedDesc}')">📝 ดูรายละเอียด</button>`
```
- Escape เฉพาะ `'` และ `"` — แต่ **ไม่ได้ escape `\n` (newline)**
- เมื่อ description มี newline browser จะ parse พบ literal newline กลาง JS string → SyntaxError

### การแก้ไข
ใช้ `JSON.stringify()` + `.replace(/"/g, '&quot;')` แทน manual escaping:
```javascript
// โค้ดใหม่ (ถูกต้อง)
const escapedDesc = JSON.stringify(t.description || '').replace(/"/g, '&quot;');
`<button onclick="viewDesc(${escapedDesc})">📝 ดูรายละเอียด</button>`
```
**Flow:**
1. `JSON.stringify(...)` — ครอบด้วย `"..."` และ escape `\n`, `\t`, `"`, `\` ครบ
2. `.replace(/"/g, '&quot;')` — แปลง `"` → `&quot;` กัน HTML attribute แตก
3. Browser parse HTML → decode `&quot;` กลับเป็น `"` ก่อนรัน JS
4. JS เห็น `viewDesc("line1\nline2")` — ถูกต้องทุก character พิเศษ

### หมายเหตุ
`emp.js` (ฝั่งพนักงาน) ใช้ pattern `data-desc` attribute + event listener ซึ่งปลอดภัยกว่า — หากมีโอกาส refactor ควรปรับ `sup.js` ให้ใช้ pattern เดียวกัน

---

## [v3.6.3-fix1] Progress Bar ไม่ sync กับหน้าแอดมินและ Excel Export

**วันที่:** 2026-04-23
**ไฟล์ที่แก้:** `static/js/emp.js`, `routers/reports.py`

### อาการ
หน้าแอดมินและ Excel export แสดง progress % ค้างที่ค่าเดิม (ตอนส่งรายงานครั้งล่าสุด) แม้พนักงานจะเปลี่ยนสถานะงานไปแล้ว เช่น งาน 5/6 เสร็จแต่แอดมินยังเห็น 100%

### สาเหตุ (3 จุด)

1. **Progress ไม่ auto-calculate** — slider เป็น `<input type="range">` ที่ผู้ใช้ต้องลากเอง ทำให้ลืมปรับ
2. **`PATCH /api/reports/{id}/tasks` ไม่ update field `progress`** — save เฉพาะ `tasks` array, `progress` ใน Firestore จึงค้างที่ค่าเดิมจนกว่าจะกดส่งรายงานใหม่
3. **`calcTaskProgress()` นับผิด** — นับ task row ทุกแถวรวมแถวที่ยังไม่มีชื่องาน แต่ `autoSaveTasks()` ส่งเฉพาะแถวที่มีชื่อ ทำให้ % ฝั่ง frontend ≠ backend (เช่น 83% vs 100%)

### การแก้ไข

**`routers/reports.py`** — คำนวณ `progress` จาก tasks แล้ว update พร้อมกันใน `PATCH /tasks`:
```python
done_count = sum(1 for t in tasks if t.status == 'done')
auto_progress = round((done_count * 100) / len(tasks)) if tasks else 0
report_ref.update({'tasks': tasks_data, 'progress': auto_progress})
```

**`static/js/emp.js`** — เพิ่มฟังก์ชัน `calcTaskProgress()` + `calcAndUpdateProgress()` และ hook เข้าทุกจุดที่ tasks เปลี่ยน (status change, add, delete, populate):
```javascript
// นับเฉพาะแถวที่มีชื่องาน — ตรงกับที่ autoSaveTasks ส่งไป backend
function calcTaskProgress() {
  const rows = [...document.querySelectorAll('#e-tasks .task-row')]
    .filter(row => row.querySelector('input[type="text"]')?.value.trim());
  if (!rows.length) return null;
  let done = 0;
  rows.forEach(row => { if (row.querySelector('.sp-done.on')) done++; });
  return Math.round((done * 100) / rows.length);
}
```

### หมายเหตุ
- Manual override ยังทำงานได้ (ลาก slider ได้) แต่จะถูก override คืนเมื่อ task status เปลี่ยนครั้งถัดไป
- โหมดย้อนหลัง (History Mode) ไม่ได้รับผลกระทบ เพราะ `calcAndUpdateProgress()` จะไม่ถูกเรียกในโหมดนั้น

---

## [v3.6.4] Firebase Read Optimization — ลด Firestore Reads จาก 29K/วัน

**วันที่บันทึก:** 2026-04-24
**ไฟล์ที่แก้:** `static/js/sup.js`, `routers/reports.py`, `routers/admin.py`
**สถานะ:** ✅ Fix 1, 2, 4 เสร็จแล้ว | ⏳ Fix 3 (activity_logs cap) รอดำเนินการ

> **หมายเหตุ Fix 2:** ยกเลิก Firestore range filter ทั่วไปเนื่องจาก timestamp format ไม่ match — คงไว้เฉพาะ Fast path สำหรับ employee level 0 (`not is_super_admin and level == 0 and date` → ดึง doc เดียวด้วย ID) และพบบัก `is_super_admin` — ดู [v3.6.4-fix1] ด้านล่าง

### ปัญหา
Firebase Firestore Reads อยู่ที่ ~29,000 reads/วัน จากผู้ใช้งาน 23 คน (58% ของ quota 50,000/วัน ของ Spark Plan) เสี่ยงเกิน quota เมื่อผู้ใช้งานเพิ่มขึ้น

### สาเหตุหลัก
| Collection | Reads/24h | ต้นเหตุ |
|---|---|---|
| `/users` | 16,377 | `sup.js` เรียก `/api/admin/users` ทุกครั้งที่โหลด section ไม่มี cache |
| `/reports` | 5,684 | `reports.py:82` ใช้ `.stream()` ดึงทั้งหมด แล้วกรองใน Python |
| `/activity_logs` | 1,685 | `admin.py:299` ใช้ `.stream()` ดึงทั้งหมด แล้วกรองใน Python |

### แผนการแก้ไข

**Fix 1 — Frontend Cache สำหรับ `/api/admin/users`** (`static/js/sup.js`)
เพิ่ม module-level cache `_fetchUsers()` — cache ผลลัพธ์ 5 นาที, invalidate อัตโนมัติหลัง create/update/delete user
คาดว่าลด reads จาก 16,377 → ~1,030/วัน

**Fix 2 — Date-Range Filter สำหรับ `GET /api/reports`** (`routers/reports.py:79–82`)
เปลี่ยน `.stream()` เป็น `.where("timestamp", ">=", date).where("timestamp", "<", date + "T99")`
สำหรับ employee level 0 + มี date → ดึง doc เดียวตรงด้วย ID (`{user_id}_{date}`) — 1 read/request
คาดว่าลด reads จาก 5,684 → ~500/วัน

**Fix 3 — Cap Reads + Date Filter สำหรับ `GET /api/admin/logs`** (`routers/admin.py:296–318`)
- Push เฉพาะ **date range** ไปที่ Firestore (`.where("timestamp", ">=", date_from)`) — ไม่ต้องสร้าง composite index เพิ่ม
- เพิ่ม `.limit(500)` เพื่อกัน reads ไม่เกิน 500 docs ต่อ request
- กรอง `user_id` / `category` ใน Python ตามเดิม (ไม่กระทบ correctness)
คาดว่าลด reads จาก 1,685 → ~100/วัน

**Fix 4 — Month-Range Filter สำหรับ `_compute_monthly_stats`** (`routers/admin.py:361`)
เปลี่ยน `.stream()` เป็น `.where("timestamp", ">=", f"{month}-01").where("timestamp", "<", f"{next_yr:04d}-{next_mon:02d}-01")`
ดึงเฉพาะ reports ของเดือนที่ต้องการแทนดึงทั้งหมดตลอดกาล

### ผลที่คาดหวังรวม
~29,000 → ~3,500–5,000 reads/วัน (ประหยัด 83–88%)

### หมายเหตุ
- Fix ทั้งหมดไม่กระทบ logic การแสดงผลหรือ RBAC
- Fix 3 ออกแบบให้ไม่ต้องสร้าง composite index เพิ่มใน Firebase Console

---

## [v3.6.4-fix1] Admin ที่มี role=super_admin แต่ level=0 ไม่เห็นรายงานของคนอื่น

**วันที่:** 2026-04-24
**ไฟล์ที่แก้:** `routers/reports.py` บรรทัด 81

### อาการ
หน้าแอดมินแสดงเฉพาะรายงานของตัวเองเท่านั้น ไม่เห็นรายงานของพนักงานคนอื่น ๆ ที่ส่งมาแล้ว

### สาเหตุ
Fast path ที่เพิ่มใน Fix 2 ใช้เงื่อนไขไม่ครบ:
```python
# โค้ดเดิม (มีปัญหา)
if level == 0 and date:
```
หาก Super Admin ถูกกำหนดสิทธิ์ผ่าน `role=super_admin` (แทน `level=9`) จะมี `level=0` → ทำให้ trigger fast path ซึ่งดึง doc เดียวด้วย `{personal_id}_{date}` และ return ทันที — ข้าม RBAC pass ที่ตามมา

### การแก้ไข
เพิ่ม `not is_super_admin` เข้าไปในเงื่อนไข:
```python
# โค้ดใหม่ (ถูกต้อง)
if not is_super_admin and level == 0 and date:
```
- Fast path ยังทำงานสำหรับ employee ระดับ 0 ทั่วไปเหมือนเดิม (ประหยัด reads)
- Super Admin ทุกรูปแบบ (level=9 หรือ role มี 'admin') จะผ่าน `.stream()` ปกติ

---

## [v3.6.2-fix2] Description Modal มีขนาดเล็กเกินไป — ปรับ UI

**วันที่:** 2026-04-23
**ไฟล์ที่แก้:** `static/employee.html` บรรทัด 359, `static/css/style.css` บรรทัด 150-152

### อาการ
Pop-up คำอธิบายงาน (Description Modal) ในหน้าพนักงาน มี textarea ที่แคบและเตี้ยเกินไป ทำให้กรอกข้อความหลายบรรทัดได้ไม่สะดวก

### การแก้ไข
1. **`static/employee.html`** — เพิ่ม `rows="8"` ใน `<textarea id="task-desc-input">` เพื่อกำหนดความสูงเริ่มต้นให้ไม่น้อยกว่า 8 บรรทัด
2. **`static/css/style.css`** — เพิ่ม rule:
   - `#task-desc-input { min-height: 160px; resize: vertical }` — ล็อก min-height ≥ 8 บรรทัด และเปิดให้ user ปรับความสูงเองได้
   - `#desc-modal .modal-bx { max-width: 900px }` — ขยาย modal กว้างเป็น 2 เท่า (จาก 450px → 900px) โดยไม่กระทบ modal อื่น
