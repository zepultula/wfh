from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import StreamingResponse
from database import get_db
from pydantic import BaseModel
from typing import Optional, List
import re
import calendar
from datetime import date

router = APIRouter()


def _require_super_admin(authorization: str):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    email = authorization.replace("Bearer ", "")
    db = get_db()
    doc = db.collection("users").document(email).get()
    if not doc.exists:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = doc.to_dict()
    level = user.get("level", 0)
    role = user.get("role", "").lower()
    if not (level == 9 or 'admin' in role):
        raise HTTPException(status_code=403, detail="Forbidden: super admin only")
    return db


class UserCreate(BaseModel):
    personal_id: str
    firstname: str
    lastname: str
    email: str
    position: str = ""
    department: str = ""
    agency: str = ""
    level: int = 0
    role: str = "employee"
    password: str
    ignore: int = 0


class UserUpdate(BaseModel):
    personal_id: Optional[str] = None
    firstname: Optional[str] = None
    lastname: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    agency: Optional[str] = None
    level: Optional[int] = None
    role: Optional[str] = None
    password: Optional[str] = None
    ignore: Optional[int] = None


@router.get("/users")
def list_all_users(authorization: str = Header(None)):
    db = _require_super_admin(authorization)
    result = []
    for doc in db.collection("users").stream():
        u = doc.to_dict()
        u.setdefault('ignore', 0)
        result.append(u)
    result.sort(key=lambda x: (x.get('department', ''), x.get('firstname', '')))
    return result


@router.post("/users", status_code=201)
def create_user(user: UserCreate, authorization: str = Header(None)):
    db = _require_super_admin(authorization)
    email = user.email
    if db.collection("users").document(email).get().exists:
        raise HTTPException(status_code=409, detail="Email นี้มีอยู่ในระบบแล้ว")
    user_dict = user.model_dump()
    db.collection("users").document(email).set(user_dict)
    return {"success": True, "email": email}


@router.put("/users/{email:path}")
def update_user(email: str, update: UserUpdate, authorization: str = Header(None)):
    db = _require_super_admin(authorization)
    doc_ref = db.collection("users").document(email)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="User not found")
    update_data = update.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    doc_ref.update(update_data)
    return {"success": True}


@router.delete("/users/{email:path}")
def delete_user(email: str, authorization: str = Header(None)):
    db = _require_super_admin(authorization)
    doc_ref = db.collection("users").document(email)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="User not found")
    doc_ref.delete()
    return {"success": True}


class EvaluationUpdate(BaseModel):
    evaluator_ids: List[str]


@router.get("/evaluations")
def list_evaluations(authorization: str = Header(None)):
    """Get all users with their evaluators (join from evaluations collection)"""
    db = _require_super_admin(authorization)

    users_by_pid = {}
    for doc in db.collection("users").stream():
        u = doc.to_dict()
        pid = u.get("personal_id")
        if pid:
            users_by_pid[pid] = {
                "personal_id": pid,
                "name": f"{u.get('firstname','')} {u.get('lastname','')}".strip(),
                "position": u.get("position", ""),
                "department": u.get("department", ""),
                "level": u.get("level", 0),
                "ignore": u.get("ignore", 0),
            }

    eval_map = {}
    for doc in db.collection("evaluations").stream():
        d = doc.to_dict()
        target_id = d.get("target_id", doc.id)
        evaluator_list = []
        for ev in sorted(d.get("evaluators", []), key=lambda x: x.get("order", 0)):
            ev_id = ev.get("evaluator_id")
            ev_info = users_by_pid.get(ev_id, {"name": ev_id, "position": "", "department": ""})
            evaluator_list.append({
                "evaluator_id": ev_id,
                "name": ev_info["name"],
                "position": ev_info["position"],
                "department": ev_info["department"],
            })
        eval_map[target_id] = evaluator_list

    all_users_list = list(users_by_pid.values())
    all_users_list.sort(key=lambda x: (x.get("department", ""), x.get("name", "")))

    evaluations = []
    for pid, u in users_by_pid.items():
        evaluations.append({
            "target_id": pid,
            "target_name": u["name"],
            "target_department": u["department"],
            "target_position": u["position"],
            "target_level": u["level"],
            "target_ignore": u["ignore"],
            "evaluators": eval_map.get(pid, []),
        })
    evaluations.sort(key=lambda x: (x.get("target_department", ""), x.get("target_name", "")))

    return {"users": all_users_list, "evaluations": evaluations}


@router.put("/evaluations/{target_id}")
def update_evaluation(target_id: str, update: EvaluationUpdate, authorization: str = Header(None)):
    """Create/update evaluators for a target (replaces the full list)"""
    db = _require_super_admin(authorization)
    doc_ref = db.collection("evaluations").document(target_id)
    evaluators = [{"evaluator_id": pid, "order": i + 1} for i, pid in enumerate(update.evaluator_ids)]
    doc_ref.set({
        "target_id": target_id,
        "evaluators": evaluators,
        "evaluator_ids": update.evaluator_ids,
    })
    return {"success": True}


@router.post("/migrate/ignore")
def migrate_ignore(authorization: str = Header(None)):
    """เพิ่ม ignore=0 ให้ผู้ใช้ที่ยังไม่มี field นี้"""
    db = _require_super_admin(authorization)
    count = 0
    for doc in db.collection("users").stream():
        if 'ignore' not in doc.to_dict():
            doc.reference.update({'ignore': 0})
            count += 1
    return {"updated": count}


@router.post("/migrate/evaluator-ids")
def migrate_evaluator_ids(authorization: str = Header(None)):
    """เพิ่ม evaluator_ids (flat array) ให้ evaluation documents ที่ยังไม่มี field นี้"""
    db = _require_super_admin(authorization)
    count = 0
    for doc in db.collection("evaluations").stream():
        d = doc.to_dict()
        if 'evaluator_ids' not in d:
            ids = [ev['evaluator_id'] for ev in d.get('evaluators', [])]
            doc.reference.update({'evaluator_ids': ids})
            count += 1
    return {"updated": count}


# ── Monthly Stats ────────────────────────────────────────────────────────────

def _compute_monthly_stats(db, month: str) -> dict:
    """Compute per-user monthly statistics. month = 'YYYY-MM'"""
    if not re.match(r'^\d{4}-\d{2}$', month):
        raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")

    year, mon = int(month[:4]), int(month[5:7])
    _, num_days = calendar.monthrange(year, mon)
    weekdays = sum(1 for d in range(1, num_days + 1) if date(year, mon, d).weekday() < 5)

    # Fetch all active users
    users_map = {}
    for doc in db.collection("users").stream():
        u = doc.to_dict()
        if u.get("ignore", 0) == 0:
            pid = u.get("personal_id")
            if pid:
                users_map[pid] = {
                    "personal_id": pid,
                    "name": f"{u.get('firstname', '')} {u.get('lastname', '')}".strip(),
                    "position": u.get("position", ""),
                    "department": u.get("department", ""),
                }

    # Accumulate per-user stats from reports
    accum = {
        pid: {"days_submitted": 0, "total_progress": 0,
              "wfh_days": 0, "onsite_days": 0, "hybrid_days": 0,
              "total_tasks": 0, "done_tasks": 0, "problem_days": 0}
        for pid in users_map
    }

    for doc in db.collection("reports").stream():
        r = doc.to_dict()
        if not r.get("timestamp", "").startswith(month):
            continue
        uid = r.get("user_id")
        if uid not in accum:
            continue
        s = accum[uid]
        s["days_submitted"] += 1
        s["total_progress"] += r.get("progress", 0)
        wm = r.get("work_mode", "").lower()
        if wm == "wfh":
            s["wfh_days"] += 1
        elif wm == "onsite":
            s["onsite_days"] += 1
        elif wm == "hybrid":
            s["hybrid_days"] += 1
        tasks = r.get("tasks", [])
        s["total_tasks"] += len(tasks)
        s["done_tasks"] += sum(1 for t in tasks if t.get("status") == "done")
        prob = r.get("problems", "-") or "-"
        if prob.strip() not in ("-", ""):
            s["problem_days"] += 1

    users_list = []
    for pid, uinfo in users_map.items():
        s = accum[pid]
        days = s["days_submitted"]
        avg_prog = round(s["total_progress"] / days, 1) if days > 0 else 0
        compliance = round(days / weekdays * 100, 1) if weekdays > 0 else 0
        users_list.append({
            **uinfo,
            "days_submitted": days,
            "compliance": compliance,
            "avg_progress": avg_prog,
            "wfh_days": s["wfh_days"],
            "onsite_days": s["onsite_days"],
            "hybrid_days": s["hybrid_days"],
            "total_tasks": s["total_tasks"],
            "done_tasks": s["done_tasks"],
            "problem_days": s["problem_days"],
        })

    users_list.sort(key=lambda x: (x["department"], x["name"]))
    return {"month": month, "calendar_days": num_days, "weekdays": weekdays, "users": users_list}


@router.get("/stats")
def get_stats(month: str, authorization: str = Header(None)):
    """สถิติรายเดือน — ส่งคืน per-user stats จัดกลุ่มตาม department"""
    db = _require_super_admin(authorization)
    return _compute_monthly_stats(db, month)


@router.get("/stats/export")
def export_stats(month: str, authorization: str = Header(None)):
    """Export สถิติรายเดือนเป็นไฟล์ Excel (.xlsx)"""
    import io
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    db = _require_super_admin(authorization)
    data = _compute_monthly_stats(db, month)

    # Thai month names
    th_months = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                 "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
    year_val, mon_val = int(month[:4]), int(month[5:7])
    month_label = f"{th_months[mon_val]} {year_val + 543}"

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"สถิติ {month}"

    # ── Styles ──
    def side():
        return Side(style="thin", color="CCCCCC")

    def cell_border():
        return Border(left=side(), right=side(), top=side(), bottom=side())

    hdr_fill = PatternFill("solid", fgColor="1059A3")
    dept_fill = PatternFill("solid", fgColor="E8EFF8")
    green_fill = PatternFill("solid", fgColor="D4EDDA")
    yellow_fill = PatternFill("solid", fgColor="FFF3CD")
    red_fill = PatternFill("solid", fgColor="F8D7DA")
    alt_fill = PatternFill("solid", fgColor="F9FAFB")

    hdr_font = Font(bold=True, color="FFFFFF", size=10)
    dept_font = Font(bold=True, color="1A3A6B", size=10)
    body_font = Font(size=10)
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left = Alignment(horizontal="left", vertical="center", wrap_text=True)

    # ── Title ──
    ws.merge_cells("A1:N1")
    title_cell = ws["A1"]
    title_cell.value = f"สถิติการส่งรายงานประจำเดือน {month_label}"
    title_cell.font = Font(bold=True, size=13, color="1059A3")
    title_cell.alignment = center
    ws.row_dimensions[1].height = 28

    ws.merge_cells("A2:N2")
    sub_cell = ws["A2"]
    sub_cell.value = (f"วันทำงาน (จันทร์–ศุกร์): {data['weekdays']} วัน  |  "
                      f"ผู้ใช้งานทั้งหมด: {len(data['users'])} คน  |  "
                      f"สร้างวันที่: {date.today().strftime('%d/%m/')+str(date.today().year+543)}")
    sub_cell.font = Font(size=9, color="64748B")
    sub_cell.alignment = left
    ws.row_dimensions[2].height = 18

    # ── Header row ──
    headers = [
        ("ลำดับ", 6), ("ชื่อ-สกุล", 24), ("ตำแหน่ง", 20), ("หน่วยงาน", 18),
        ("ส่งรายงาน\n(วัน)", 10), ("วันทำงาน\n(วัน)", 10), ("Compliance\n(%)", 11),
        ("Avg Progress\n(%)", 12), ("WFH\n(วัน)", 8), ("On-site\n(วัน)", 8),
        ("Hybrid\n(วัน)", 8), ("งาน\n(ทั้งหมด)", 9), ("งาน\n(เสร็จ)", 9),
        ("มีปัญหา\n(วัน)", 9),
    ]
    col_letters = [chr(65 + i) for i in range(len(headers))]
    for i, (title, width) in enumerate(headers):
        c = ws.cell(row=3, column=i + 1, value=title)
        c.font = hdr_font
        c.fill = hdr_fill
        c.alignment = center
        c.border = cell_border()
        ws.column_dimensions[col_letters[i]].width = width
    ws.row_dimensions[3].height = 32

    # ── Data rows ──
    row_num = 4
    seq = 0

    # Group by department
    depts = {}
    for u in data["users"]:
        dept = u["department"] or "ไม่ระบุหน่วยงาน"
        depts.setdefault(dept, []).append(u)

    for dept, members in depts.items():
        # Department header row
        ws.merge_cells(f"A{row_num}:N{row_num}")
        dc = ws.cell(row=row_num, column=1, value=f"  {dept}  ({len(members)} คน)")
        dc.font = dept_font
        dc.fill = dept_fill
        dc.alignment = left
        dc.border = cell_border()
        ws.row_dimensions[row_num].height = 18
        row_num += 1

        for idx, u in enumerate(members):
            seq += 1
            fill = alt_fill if idx % 2 == 0 else PatternFill("solid", fgColor="FFFFFF")
            comp = u["compliance"]
            prog = u["avg_progress"]
            comp_fill = green_fill if comp >= 80 else (yellow_fill if comp >= 50 else red_fill)
            prog_fill = green_fill if prog >= 80 else (yellow_fill if prog >= 40 else red_fill)

            row_data = [
                seq, u["name"], u["position"], u["department"],
                u["days_submitted"], data["weekdays"],
                comp, prog,
                u["wfh_days"], u["onsite_days"], u["hybrid_days"],
                u["total_tasks"], u["done_tasks"], u["problem_days"],
            ]
            for col_idx, val in enumerate(row_data):
                c = ws.cell(row=row_num, column=col_idx + 1, value=val)
                c.font = body_font
                c.border = cell_border()
                c.alignment = left if col_idx in (1, 2, 3) else center
                if col_idx == 6:  # compliance
                    c.fill = comp_fill
                elif col_idx == 7:  # avg progress
                    c.fill = prog_fill
                else:
                    c.fill = fill

            ws.row_dimensions[row_num].height = 16
            row_num += 1

    # Freeze header rows
    ws.freeze_panes = "A4"

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"stats_{month}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
