from fastapi import APIRouter, Header, HTTPException, Depends
from database import get_db
from auth import get_current_user
from models import AnnouncementCreate, AnnouncementUpdate
from zoneinfo import ZoneInfo
from datetime import datetime

router = APIRouter()
bkk_tz = ZoneInfo('Asia/Bangkok')


def _require_super_admin(current_user: dict):
    """ตรวจสอบว่าผู้ใช้เป็น Super Admin (Level 9 หรือ Role 'admin') เท่านั้น"""
    level = current_user.get("level", 0)
    role = current_user.get("role", "").lower()
    if not (level == 9 or 'admin' in role):
        raise HTTPException(status_code=403, detail="Super admin only")


def _now_bkk() -> str:
    return datetime.now(bkk_tz).strftime("%Y-%m-%d %H:%M:%S")


#? GET /api/announcements — คืนรายการประกาศที่ active สำหรับผู้ใช้ทั่วไป
#? ถ้า ?admin=1 และ level==9 คืนทั้งหมด (ไม่ filter is_active)
@router.get("/")
def list_announcements(
    admin: int = 0,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    level = current_user.get("level", 0)

    #? Super admin ขอดูทั้งหมด (รวม inactive) สำหรับหน้าจัดการ
    if admin == 1 and level == 9:
        docs = db.collection("announcements").order_by("created_at").stream()
        return [{"id": d.id, **d.to_dict()} for d in docs]

    #? ผู้ใช้ทั่วไป: คืนเฉพาะ active และ target ที่ตรงกับ level
    allowed_targets = {"all", "employee"} if level == 0 else {"all", "admin"}
    result = []
    for doc in db.collection("announcements").where("is_active", "==", True).stream():
        d = doc.to_dict()
        if d.get("target") in allowed_targets:
            result.append({"id": doc.id, **d})
    return result


#? POST /api/announcements — Super admin สร้างประกาศใหม่
@router.post("/", status_code=201)
def create_announcement(
    data: AnnouncementCreate,
    current_user: dict = Depends(get_current_user)
):
    _require_super_admin(current_user)
    db = get_db()
    doc_ref = db.collection("announcements").document()
    payload = {
        "title": data.title,
        "body": data.body,
        "is_active": data.is_active,
        "target": data.target,
        "created_at": _now_bkk(),
        "created_by": current_user.get("sub", ""),
    }
    doc_ref.set(payload)
    return {"id": doc_ref.id, **payload}


#? PATCH /api/announcements/{ann_id} — Super admin อัปเดตประกาศ
@router.patch("/{ann_id}")
def update_announcement(
    ann_id: str,
    data: AnnouncementUpdate,
    current_user: dict = Depends(get_current_user)
):
    _require_super_admin(current_user)
    db = get_db()
    doc_ref = db.collection("announcements").document(ann_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Announcement not found")

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    doc_ref.update(updates)
    return {"id": ann_id, **doc.to_dict(), **updates}


#? DELETE /api/announcements/{ann_id} — Super admin ลบประกาศ
@router.delete("/{ann_id}")
def delete_announcement(
    ann_id: str,
    current_user: dict = Depends(get_current_user)
):
    _require_super_admin(current_user)
    db = get_db()
    doc_ref = db.collection("announcements").document(ann_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Announcement not found")
    doc_ref.delete()
    return {"status": "deleted", "id": ann_id}
