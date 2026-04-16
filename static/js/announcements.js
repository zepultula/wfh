/* ══════════════════════════════════════════════════════
   Announcement Modal — Shared logic (employee + admin)
   แสดง Modal ประกาศครั้งเดียวต่อ Login session
   ══════════════════════════════════════════════════════ */

async function checkAndShowAnnouncement() {
  // ตรวจสอบว่าได้แสดงไปแล้วในเซสชันนี้หรือยัง
  if (sessionStorage.getItem('ann_shown')) return;
  // ตั้งค่าทันทีเพื่อป้องกัน race condition กรณีนำทางหน้าซ้อน
  sessionStorage.setItem('ann_shown', '1');
  try {
    const res = await fetch('/api/announcements');
    if (!res.ok) return;
    const anns = await res.json();
    if (!anns.length) return;
    renderAnnModal(anns);
    const modal = document.getElementById('ann-modal');
    if (modal) modal.classList.add('on');
  } catch(e) {
    // silent fail — ไม่แสดง error ถ้าโหลดประกาศไม่ได้
  }
}

function renderAnnModal(announcements) {
  const body = document.getElementById('ann-modal-body');
  if (!body) return;
  body.innerHTML = announcements.map((a, i) => {
    const isLast = i === announcements.length - 1;
    return `<div style="${isLast ? '' : 'margin-bottom:.875rem;padding-bottom:.875rem;border-bottom:0.5px solid var(--color-border-tertiary)'}">
      <div style="font-size:13px;font-weight:600;margin-bottom:6px">${a.title}</div>
      <div style="font-size:13px;color:var(--color-text-secondary);line-height:1.6;white-space:pre-wrap">${a.body}</div>
    </div>`;
  }).join('');
}

window.closeAnnModal = function() {
  const el = document.getElementById('ann-modal');
  if (el) el.classList.remove('on');
};
