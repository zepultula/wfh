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
