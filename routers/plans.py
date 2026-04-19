from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
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
                "id":          task_dict.get("id", len(clean_tasks) + 1),
                "title":       task_dict.get("title", ""),
                "description": task_dict.get("description", ""),
                "goal":        task_dict.get("goal", ""),        #? เป้าหมายของงาน
                "output":      task_dict.get("output", ""),      #? ผลผลิต/สิ่งที่ส่งมอบ
                "kpi_name":    task_dict.get("kpi_name", ""),    #? ชื่อตัวชี้วัด KPI
                "kpi_target":  task_dict.get("kpi_target", ""),  #? ค่าเป้าหมาย KPI
                # ห้ามให้ client เขียนทับ approval — ใช้ค่าเดิมจาก Firestore เสมอ
                # เฉพาะ PATCH /approve เท่านั้นที่เปลี่ยน approved/approved_by/approved_at ได้
                "approved":    existing_approved,
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
    #? กรองงาน: แสดงเฉพาะงานที่ "อนุมัติแล้ว" (approved=True) เท่านั้น
    #! งาน Pending (ยังไม่รีวิว) และงานที่ถูกปฏิเสธ จะไม่ถูก inject เข้ารายงาน
    return [t for t in tasks if t.get("approved", False) is True]


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

    #? รวบรวม report_id ทั้งหมดที่ต้องตรวจสอบ แล้วดึงพร้อมกันด้วย get_all() (batch read)
    #? แทนการวน loop แบบ sequential เพื่อลด network round-trip จาก N×M ครั้ง → 1 ครั้ง
    all_report_refs: list = []
    ref_to_key: dict[str, tuple[str, str]] = {}  # doc_path → (uid, date_str)

    for plan_dict in result:
        uid = plan_dict.get("user_id", "")
        for date_str, tasks in plan_dict.get("days", {}).items():
            if tasks:
                report_id = f"{uid}_{date_str}"
                ref = db.collection("reports").document(report_id)
                all_report_refs.append(ref)
                ref_to_key[ref.path] = (uid, date_str)

    #? batch get — Firestore ส่ง request เดียวสำหรับทุก doc พร้อมกัน
    exists_set: set[str] = set()
    if all_report_refs:
        for snap in db.get_all(all_report_refs):
            if snap.exists:
                exists_set.add(snap.reference.path)

    #? ใส่ in_report flag ให้แต่ละ task โดยอ้างอิงจาก exists_set
    for plan_dict in result:
        uid = plan_dict.get("user_id", "")
        for date_str, tasks in plan_dict.get("days", {}).items():
            report_path = db.collection("reports").document(f"{uid}_{date_str}").path
            has_report = report_path in exists_set
            for task in tasks:
                task["in_report"] = has_report

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

    #! ป้องกันการยกเลิกการอนุมัติ หากงานนี้มีรายงานประจำวันแล้ว (อยู่ระหว่างดำเนินการ)
    if not data.approved:
        report_id = f"{plan_data.get('user_id', '')}_{data.date}"
        if db.collection("reports").document(report_id).get().exists:
            raise HTTPException(
                status_code=409,
                detail="ไม่สามารถยกเลิกการอนุมัติได้ เนื่องจากงานนี้อยู่ระหว่างดำเนินการในรายงานแล้ว"
            )

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


# ─────────────────────────────────────────────────────────────────
# Helpers สำหรับ Excel Export แผนงาน
# ─────────────────────────────────────────────────────────────────
_TH_DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]
_TH_MON_SHORT = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                 "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
_TH_MON_LONG  = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
                 "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]


def _format_date_th(date_str: str) -> str:
    """แปลง YYYY-MM-DD → "วัน DD เดือน" ภาษาไทย"""
    d = date_mod.fromisoformat(date_str)
    return f"{_TH_DAYS[d.weekday()]} {d.day} {_TH_MON_SHORT[d.month]}"


def _get_months_mondays(month: str) -> list[str]:
    """คืน list ของวันจันทร์ (week_start) ทุกสัปดาห์ที่มีวันอยู่ในเดือน YYYY-MM"""
    import calendar as _cal
    year, mon = int(month[:4]), int(month[5:7])
    first_day = date_mod(year, mon, 1)
    last_day  = date_mod(year, mon, _cal.monthrange(year, mon)[1])
    start_monday = first_day - timedelta(days=first_day.weekday())
    mondays, d = [], start_monday
    while d <= last_day:
        mondays.append(d.isoformat())
        d += timedelta(weeks=1)
    return mondays


def _build_plans_wb(rows: list[dict], title: str, has_week_col: bool):
    """
    สร้าง openpyxl Workbook สำหรับ Excel แผนงาน
    rows แต่ละ dict: user_id, user_name, department, week_label?, date_str, task_num,
                    title, goal, output, kpi_name, kpi_target, approved, approved_by
    """
    import io
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    def side():
        return Side(style="thin", color="CCCCCC")
    def bdr():
        return Border(left=side(), right=side(), top=side(), bottom=side())

    hdr_fill   = PatternFill("solid", fgColor="1059A3")
    emp_fill   = PatternFill("solid", fgColor="E8EFF8")
    green_fill = PatternFill("solid", fgColor="D4EDDA")
    orng_fill  = PatternFill("solid", fgColor="FFF3CD")
    red_fill   = PatternFill("solid", fgColor="F8D7DA")
    alt_fill   = PatternFill("solid", fgColor="F9FAFB")

    hdr_font  = Font(bold=True, color="FFFFFF", size=10)
    emp_font  = Font(bold=True, color="1A3A6B", size=10)
    body_font = Font(size=10)
    center    = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left_va   = Alignment(horizontal="left",   vertical="center", wrap_text=True)

    if has_week_col:
        headers    = ["ลำดับ", "ชื่อ-สกุล", "แผนก", "สัปดาห์ที่", "วันที่", "งานที่",
                      "ชื่องาน", "เป้าหมาย", "ผลผลิต", "ชื่อ KPI", "เป้าหมาย KPI", "สถานะ"]
        col_widths = [6, 18, 14, 12, 14, 6, 24, 20, 20, 18, 14, 14]
        center_cols = {1, 6}
    else:
        headers    = ["ลำดับ", "ชื่อ-สกุล", "แผนก", "วันที่", "งานที่",
                      "ชื่องาน", "เป้าหมาย", "ผลผลิต", "ชื่อ KPI", "เป้าหมาย KPI", "สถานะ"]
        col_widths = [6, 18, 14, 14, 6, 24, 20, 20, 18, 14, 14]
        center_cols = {1, 5}

    COLS = len(headers)

    def col_letter(n: int) -> str:
        return chr(ord('A') + n - 1)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = title[:31]

    # Title (row 1)
    ws.merge_cells(f"A1:{col_letter(COLS)}1")
    c = ws["A1"]
    c.value     = title
    c.font      = Font(bold=True, size=12, color="1A3A6B")
    c.alignment = center
    ws.row_dimensions[1].height = 28

    # Header (row 2)
    for ci, (h, w) in enumerate(zip(headers, col_widths), 1):
        c            = ws.cell(row=2, column=ci, value=h)
        c.font       = hdr_font
        c.fill       = hdr_fill
        c.alignment  = center
        c.border     = bdr()
        ws.column_dimensions[col_letter(ci)].width = w
    ws.row_dimensions[2].height = 28
    ws.freeze_panes = "A3"

    row, seq, last_emp = 3, 1, None

    for entry in rows:
        uid = entry.get("user_id", "")

        # Employee separator
        if uid != last_emp:
            ws.merge_cells(f"A{row}:{col_letter(COLS)}{row}")
            c            = ws.cell(row=row, column=1)
            c.value      = f"  {entry['user_name']}  [{entry['department']}]"
            c.font       = emp_font
            c.fill       = emp_fill
            c.alignment  = left_va
            for ci in range(1, COLS + 1):
                ws.cell(row=row, column=ci).border = bdr()
            ws.row_dimensions[row].height = 22
            row      += 1
            last_emp  = uid

        # Status
        if entry.get("approved"):
            s_fill, status_txt = green_fill, "✓ อนุมัติแล้ว"
        elif entry.get("approved_by"):
            s_fill, status_txt = red_fill,   "✗ ไม่อนุมัติ"
        else:
            s_fill, status_txt = orng_fill,  "⋯ รอการอนุมัติ"

        row_fill = PatternFill("solid", fgColor="FFFFFF") if row % 2 == 0 else alt_fill

        if has_week_col:
            values = [seq, entry["user_name"], entry["department"], entry["week_label"],
                      _format_date_th(entry["date_str"]), entry["task_num"],
                      entry["title"], entry["goal"], entry["output"],
                      entry["kpi_name"], entry["kpi_target"], status_txt]
        else:
            values = [seq, entry["user_name"], entry["department"],
                      _format_date_th(entry["date_str"]), entry["task_num"],
                      entry["title"], entry["goal"], entry["output"],
                      entry["kpi_name"], entry["kpi_target"], status_txt]

        for ci, val in enumerate(values, 1):
            c            = ws.cell(row=row, column=ci, value=val)
            c.font       = body_font
            c.fill       = s_fill if ci == COLS else row_fill
            c.alignment  = center if ci in center_cols else left_va
            c.border     = bdr()
        ws.row_dimensions[row].height = 18
        seq += 1
        row += 1

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output


# ─────────────────────────────────────────────────────────────────
# GET /api/plans/export/weekly  — ส่งออก Excel แผนงานรายสัปดาห์
# ─────────────────────────────────────────────────────────────────
@router.get("/export/weekly")
def export_plans_weekly(
    week: str | None = None,
    current_user: dict = Depends(get_current_user)
):
    """Export แผนงานของลูกน้องทั้งหมดในสัปดาห์ที่ระบุ เป็น Excel (.xlsx)"""
    level = current_user.get("level", 0)
    role  = current_user.get("role", "").lower()
    if level == 0 and 'admin' not in role:
        raise HTTPException(status_code=403, detail="สิทธิ์การเข้าถึงสำหรับผู้ดูแลระบบเท่านั้น")

    today      = date_mod.today().isoformat()
    week_start = _get_monday(week if week else today)
    db         = get_db()
    allowed_ids = _get_subordinate_user_ids(db, current_user)

    plans = []
    for doc in db.collection("weekly_plans").where("week_start", "==", week_start).stream():
        d = doc.to_dict()
        if allowed_ids is not None and d.get("user_id", "") not in allowed_ids:
            continue
        plans.append({"id": doc.id, **d})
    plans.sort(key=lambda p: (p.get("department", ""), p.get("user_name", "")))

    week_dates = _get_week_dates(week_start)
    rows = []
    for plan in plans:
        days = plan.get("days", {})
        for date_str in week_dates:
            for ti, task in enumerate(days.get(date_str, []), 1):
                rows.append({
                    "user_id":    plan.get("user_id", ""),
                    "user_name":  plan.get("user_name", ""),
                    "department": plan.get("department", ""),
                    "date_str":   date_str,
                    "task_num":   ti,
                    "title":      task.get("title", ""),
                    "goal":       task.get("goal", ""),
                    "output":     task.get("output", ""),
                    "kpi_name":   task.get("kpi_name", ""),
                    "kpi_target": task.get("kpi_target", ""),
                    "approved":   task.get("approved", False),
                    "approved_by": task.get("approved_by", ""),
                })

    s = date_mod.fromisoformat(week_dates[0])
    e = date_mod.fromisoformat(week_dates[5])
    title = (f"แผนงานรายสัปดาห์  {s.day} {_TH_MON_SHORT[s.month]}"
             f" — {e.day} {_TH_MON_SHORT[e.month]} {e.year + 543}")

    output = _build_plans_wb(rows, title, has_week_col=False)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="plans_weekly_{week_start}.xlsx"'},
    )


# ─────────────────────────────────────────────────────────────────
# GET /api/plans/export/monthly  — ส่งออก Excel แผนงานรายเดือน
# ─────────────────────────────────────────────────────────────────
@router.get("/export/monthly")
def export_plans_monthly(
    month: str,
    current_user: dict = Depends(get_current_user)
):
    """Export แผนงานของลูกน้องทั้งหมดในเดือนที่ระบุ (YYYY-MM) เป็น Excel (.xlsx)"""
    level = current_user.get("level", 0)
    role  = current_user.get("role", "").lower()
    if level == 0 and 'admin' not in role:
        raise HTTPException(status_code=403, detail="สิทธิ์การเข้าถึงสำหรับผู้ดูแลระบบเท่านั้น")

    if not month or len(month) < 7:
        raise HTTPException(status_code=422, detail="month ต้องอยู่ในรูปแบบ YYYY-MM")

    db          = get_db()
    allowed_ids = _get_subordinate_user_ids(db, current_user)
    mondays     = _get_months_mondays(month)

    plans_by_week: dict[str, list] = {}
    for week_start in mondays:
        week_plans = []
        for doc in db.collection("weekly_plans").where("week_start", "==", week_start).stream():
            d = doc.to_dict()
            if allowed_ids is not None and d.get("user_id", "") not in allowed_ids:
                continue
            week_plans.append({"id": doc.id, **d})
        plans_by_week[week_start] = week_plans

    # รวบรวม employees เรียงตาม department → user_name
    emp_map: dict[str, dict] = {}
    for week_plans in plans_by_week.values():
        for p in week_plans:
            uid = p.get("user_id", "")
            if uid and uid not in emp_map:
                emp_map[uid] = {"user_name": p.get("user_name", ""),
                                "department": p.get("department", "")}
    sorted_emps = sorted(emp_map.items(),
                         key=lambda x: (x[1].get("department", ""), x[1].get("user_name", "")))

    rows = []
    for uid, emp_info in sorted_emps:
        for wi, week_start in enumerate(mondays, 1):
            plan = next((p for p in plans_by_week.get(week_start, [])
                         if p.get("user_id") == uid), None)
            if not plan:
                continue
            days = plan.get("days", {})
            for date_str in _get_week_dates(week_start):
                for ti, task in enumerate(days.get(date_str, []), 1):
                    rows.append({
                        "user_id":    uid,
                        "user_name":  emp_info["user_name"],
                        "department": emp_info["department"],
                        "week_label": f"สัปดาห์ที่ {wi}",
                        "date_str":   date_str,
                        "task_num":   ti,
                        "title":      task.get("title", ""),
                        "goal":       task.get("goal", ""),
                        "output":     task.get("output", ""),
                        "kpi_name":   task.get("kpi_name", ""),
                        "kpi_target": task.get("kpi_target", ""),
                        "approved":   task.get("approved", False),
                        "approved_by": task.get("approved_by", ""),
                    })

    year_val, mon_val = int(month[:4]), int(month[5:7])
    title = f"แผนงานรายเดือน  {_TH_MON_LONG[mon_val]} {year_val + 543}"

    output = _build_plans_wb(rows, title, has_week_col=True)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="plans_monthly_{month}.xlsx"'},
    )
