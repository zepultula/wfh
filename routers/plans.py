from fastapi import APIRouter, HTTPException, Depends
from database import get_db
from auth import get_current_user
from models import WeeklyPlanCreate, TaskApprovalUpdate
from zoneinfo import ZoneInfo
from datetime import datetime, date as date_mod, timedelta

router = APIRouter()
bkk_tz = ZoneInfo('Asia/Bangkok')


def _now_bkk() -> str:
    return datetime.now(bkk_tz).strftime("%Y-%m-%d %H:%M:%S")


def _get_monday(date_str: str) -> str:
    """คืน YYYY-MM-DD ของวันจันทร์ในสัปดาห์ของ date_str"""
    d = date_mod.fromisoformat(date_str)
    # weekday(): Monday=0 ... Sunday=6
    monday = d - timedelta(days=d.weekday())
    return monday.isoformat()


def _get_week_dates(monday_str: str) -> list[str]:
    """คืน list 6 วัน (จ–ส) จาก monday_str"""
    monday = date_mod.fromisoformat(monday_str)
    return [(monday + timedelta(days=i)).isoformat() for i in range(6)]


def _get_subordinate_user_ids(db, current_user: dict) -> set | None:
    """
    คืน set ของ user_id ที่ admin/supervisor คนนี้ดูได้
    None หมายถึง super admin (ดูได้ทุกคน)
    """
    level = current_user.get("level", 0)
    role = current_user.get("role", "").lower()
    personal_id = current_user.get("user_id")
    is_super_admin = level == 9 or 'admin' in role
    if is_super_admin:
        return None
    allowed = {personal_id} if personal_id else set()
    if 1 <= level <= 3 and personal_id:
        for e in db.collection("evaluations") \
                    .where("evaluator_ids", "array_contains", personal_id) \
                    .stream():
            tid = e.to_dict().get("target_id")
            if tid:
                allowed.add(tid)
    return allowed


# ─────────────────────────────────────────────────────────────────
# GET /api/plans  — ดูแผนงานของตัวเอง สำหรับสัปดาห์ที่ระบุ
# ─────────────────────────────────────────────────────────────────
@router.get("/")
def get_my_plan(
    week: str | None = None,
    current_user: dict = Depends(get_current_user)
):
    """
    คืนแผนงานของผู้ใช้ปัจจุบันสำหรับสัปดาห์ที่ระบุ
    ?week=YYYY-MM-DD (ถ้าไม่ระบุจะใช้สัปดาห์ปัจจุบัน)
    """
    today = date_mod.today().isoformat()
    week_start = _get_monday(week if week else today)
    user_id = current_user.get("user_id", "")
    plan_id = f"{user_id}_{week_start}"
    db = get_db()
    doc = db.collection("weekly_plans").document(plan_id).get()
    if not doc.exists:
        return {"id": plan_id, "week_start": week_start, "days": {}}
    return {"id": doc.id, **doc.to_dict()}


# ─────────────────────────────────────────────────────────────────
# POST /api/plans  — สร้าง/แทนที่แผนงาน
# ─────────────────────────────────────────────────────────────────
@router.post("/", status_code=201)
def save_plan(
    data: WeeklyPlanCreate,
    current_user: dict = Depends(get_current_user)
):
    """สร้างหรือแทนที่แผนงานสำหรับสัปดาห์ที่ระบุ"""
    week_start = _get_monday(data.week_start)
    user_id = current_user.get("user_id", "")
    plan_id = f"{user_id}_{week_start}"
    db = get_db()
    doc_ref = db.collection("weekly_plans").document(plan_id)

    now = _now_bkk()
    existing = doc_ref.get()
    created_at = existing.to_dict().get("created_at", now) if existing.exists else now

    # แปลง days dict: ตรวจสอบให้แต่ละ task มีฟิลด์ครบ
    clean_days = {}
    valid_dates = set(_get_week_dates(week_start))
    for date_key, tasks in data.days.items():
        if date_key not in valid_dates:
            continue  # ข้ามวันที่ไม่อยู่ในสัปดาห์นี้
        clean_tasks = []
        for t in tasks:
            if isinstance(t, dict):
                task_dict = t
            else:
                task_dict = t.model_dump() if hasattr(t, 'model_dump') else dict(t)
            # เก็บสถานะ approved ไว้จากเดิม (ถ้ามี)
            existing_approved = False
            existing_approved_by = ""
            existing_approved_at = ""
            if existing.exists:
                old_tasks = existing.to_dict().get("days", {}).get(date_key, [])
                for old_t in old_tasks:
                    if old_t.get("id") == task_dict.get("id"):
                        existing_approved = old_t.get("approved", False)
                        existing_approved_by = old_t.get("approved_by", "")
                        existing_approved_at = old_t.get("approved_at", "")
                        break
            clean_tasks.append({
                "id": task_dict.get("id", len(clean_tasks) + 1),
                "title": task_dict.get("title", ""),
                "description": task_dict.get("description", ""),
                # ห้ามให้ client เขียนทับ approval — ใช้ค่าเดิมจาก Firestore เสมอ
                # เฉพาะ PATCH /approve เท่านั้นที่เปลี่ยน approved/approved_by/approved_at ได้
                "approved": existing_approved,
                "approved_by": existing_approved_by,
                "approved_at": existing_approved_at,
            })
        clean_days[date_key] = clean_tasks

    payload = {
        "user_id": user_id,
        "user_name": current_user.get("name", ""),
        "department": current_user.get("department", ""),
        "week_start": week_start,
        "created_at": created_at,
        "updated_at": now,
        "days": clean_days,
    }
    doc_ref.set(payload)
    return {"id": plan_id, **payload}


# ─────────────────────────────────────────────────────────────────
# GET /api/plans/tasks  — ดึงงานในแผนสำหรับวันที่ระบุ (auto-inject)
# ─────────────────────────────────────────────────────────────────
@router.get("/tasks")
def get_plan_tasks_for_date(
    date: str,
    current_user: dict = Depends(get_current_user)
):
    """
    คืน list ของงานที่วางแผนไว้สำหรับวันที่ระบุ
    ใช้โดย emp.js สำหรับ auto-inject งานเข้าฟอร์มรายงานประจำวัน
    """
    week_start = _get_monday(date)
    #? ดึง user_id (personal_id) มาใช้งาน พร้อมจัดการขจัดช่องว่างที่อาจติดมา
    user_id = str(current_user.get("user_id", "")).strip()
    db = get_db()
    
    #? Fallback: หาก user_id ใน JWT ว่าง (บางกรณีสิทธิ์ Admin อาจไม่มีเลขพนักงานใน Token)
    #? ให้ดึงจาก Firestore โดยตรงผ่าน email (sub) เพื่อความแม่นยำสูงสุด
    if not user_id:
        email = current_user.get("sub")
        if email:
            u_doc = db.collection("users").document(email).get()
            if u_doc.exists:
                user_id = str(u_doc.to_dict().get("personal_id", "")).strip()
    
    #? หากยังไม่พบ user_id หรือเป็นค่าว่าง จะไม่สามารถระบุแผนงานได้
    if not user_id:
        return []

    plan_id = f"{user_id}_{week_start}"
    doc = db.collection("weekly_plans").document(plan_id).get()
    if not doc.exists:
        return []
    days = doc.to_dict().get("days", {})
    tasks = days.get(date, [])
    #? กรองงาน: แสดงเฉพาะงานที่ "อนุมัติแล้ว" หรือ "ยังไม่รีวิว" (Pending) เท่านั้น ตามบันทึกใน CONTEXT.md
    #? ซ่อนเฉพาะงานที่หัวหน้าระบุว่า "ไม่อนุมัติ" (approved=False และ approved_by ไม่ใช่ค่าว่าง)
    return [t for t in tasks if t.get("approved", False) or t.get("approved_by") == ""]


# ─────────────────────────────────────────────────────────────────
# GET /api/plans/subordinates  — หัวหน้าดูแผนของลูกน้อง
# ─────────────────────────────────────────────────────────────────
@router.get("/subordinates")
def get_subordinates_plans(
    week: str | None = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Admin/Supervisor ดูแผนงานของลูกน้องทุกคนสำหรับสัปดาห์ที่ระบุ
    Super Admin เห็นทุกคน, Supervisor (level 1-3) เห็นเฉพาะลูกน้องตามสาย
    """
    level = current_user.get("level", 0)
    role = current_user.get("role", "").lower()
    if level == 0 and 'admin' not in role:
        #? พนักงานทั่วไปเข้าถึงหน้านี้ไม่ได้
        raise HTTPException(status_code=403, detail="สิทธิ์การเข้าถึงสำหรับผู้ดูแลระบบเท่านั้น")

    today = date_mod.today().isoformat()
    week_start = _get_monday(week if week else today)
    db = get_db()
    allowed_ids = _get_subordinate_user_ids(db, current_user)

    # query แผนทั้งหมดในสัปดาห์นั้น
    plans_ref = db.collection("weekly_plans").where("week_start", "==", week_start)
    result = []
    for doc in plans_ref.stream():
        d = doc.to_dict()
        uid = d.get("user_id", "")
        if allowed_ids is not None and uid not in allowed_ids:
            continue
        result.append({"id": doc.id, **d})
    return result


# ─────────────────────────────────────────────────────────────────
# PATCH /api/plans/{plan_id}/approve  — อนุมัติ/ยกเลิกงานเดี่ยว
# ─────────────────────────────────────────────────────────────────
@router.patch("/{plan_id}/approve")
def approve_task(
    plan_id: str,
    data: TaskApprovalUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Supervisor อนุมัติหรือยกเลิกการอนุมัติงานแต่ละรายการในแผน
    """
    level = current_user.get("level", 0)
    role = current_user.get("role", "").lower()
    if level == 0 and 'admin' not in role:
        #? พนักงานทั่วไปเข้าหน้าอนุมัติไม่ได้
        raise HTTPException(status_code=403, detail="สิทธิ์การเข้าถึงสำหรับผู้ดูแลระบบเท่านั้น")

    db = get_db()
    doc_ref = db.collection("weekly_plans").document(plan_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="ไม่พบแผนงานที่ระบุ")

    plan_data = doc.to_dict()
    days = plan_data.get("days", {})
    tasks_for_date = days.get(data.date, [])

    updated = False
    for task in tasks_for_date:
        if task.get("id") == data.task_id:
            task["approved"] = data.approved
            task["approved_by"] = current_user.get("name", current_user.get("sub", ""))
            task["approved_at"] = _now_bkk() if data.approved else ""
            updated = True
            break

    if not updated:
        #? แจ้งเตือนหากไม่พบงานที่ระบุในแผนของวันนั้นๆ
        raise HTTPException(status_code=404, detail="ไม่พบงานที่ระบุในแผนงาน")

    days[data.date] = tasks_for_date
    doc_ref.update({"days": days, "updated_at": _now_bkk()})
    return {"status": "ok", "plan_id": plan_id, "date": data.date, "task_id": data.task_id, "approved": data.approved}
