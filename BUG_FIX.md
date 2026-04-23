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
