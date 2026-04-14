from fastapi import APIRouter, HTTPException, Body
from database import get_db
from models import ReportCreate, ReportOut, CommentCreate, CommentModel, TaskModel
from typing import List
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

router = APIRouter()
bz_tz = ZoneInfo('Asia/Bangkok')

@router.post("/", response_model=ReportOut)
def create_report(report: ReportCreate):
    db = get_db()

    now = datetime.now(bz_tz)
    date_str = now.strftime('%Y-%m-%d')
    timestamp = now.strftime('%Y-%m-%d %H:%M:%S')
    submit_time = now.strftime('%H:%M')

    # Use user_id + date as document ID to avoid duplicates
    report_id = f"{report.user_id}_{date_str}"

    report_dict = report.model_dump()
    report_dict['id'] = report_id
    report_dict['timestamp'] = timestamp
    report_dict['submit_time'] = submit_time

    # Check if report exists for this user today
    doc = db.collection('reports').document(report_id).get()
    if doc.exists:
        # Update existing report, preserve comments
        report_dict['comments'] = doc.to_dict().get('comments', [])
    else:
        # New report
        report_dict['comments'] = []

    db.collection('reports').document(report_id).set(report_dict)

    return report_dict

from fastapi import Header

@router.get("/", response_model=List[ReportOut])
def get_reports(date: str = None, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    email = authorization.replace("Bearer ", "")
    
    db = get_db()
    
    user_doc = db.collection("users").document(email).get()
    if not user_doc.exists:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_data = user_doc.to_dict()
    level = user_data.get("level", 0)
    role = user_data.get("role", "").lower()
    personal_id = user_data.get("personal_id")

    # super admin: level 9 หรือ role มีคำว่า 'admin'
    is_super_admin = level == 9 or 'admin' in role

    # หา target_ids ที่คนนี้มีสิทธิ์มองเห็น (ถ้าเป็น level 1-3 และไม่ใช่ super admin)
    allowed_target_ids = set()
    if not is_super_admin and 1 <= level <= 3:
        for e in db.collection("evaluations") \
                    .where("evaluator_ids", "array-contains", personal_id) \
                    .stream():
            allowed_target_ids.add(e.to_dict().get("target_id"))

    reports_ref = db.collection('reports')
    docs = reports_ref.stream()

    reports = []
    for doc in docs:
        data = doc.to_dict()
        if date and not data.get('timestamp', '').startswith(date):
            continue

        r_user_id = data.get('user_id')

        # กรองข้อมูลตามสิทธิ์
        if is_super_admin:
            pass  # เห็นได้ทุกคน
        elif level == 0:
            if r_user_id != personal_id:
                continue
        elif 1 <= level <= 3:
            if r_user_id not in allowed_target_ids and r_user_id != personal_id:
                continue
        else:
            # level อื่นที่ไม่ได้กำหนด — เห็นเฉพาะตัวเอง
            if r_user_id != personal_id:
                continue
            
        reports.append(data)
        
    reports.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    return reports
@router.get("/{report_id}", response_model=ReportOut)
def get_report(report_id: str):
    db = get_db()
    doc = db.collection('reports').document(report_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Report not found")
    return doc.to_dict()

@router.patch("/{report_id}/tasks")
def update_tasks(report_id: str, tasks: List[TaskModel] = Body(...)):
    db = get_db()
    report_ref = db.collection('reports').document(report_id)
    doc = report_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Report not found")
    tasks_data = [t.model_dump() for t in tasks]
    report_ref.update({'tasks': tasks_data})
    return {"success": True}

@router.post("/{report_id}/comments", response_model=CommentModel)
def add_comment(report_id: str, comment: CommentCreate):
    db = get_db()
    report_ref = db.collection('reports').document(report_id)
    doc = report_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Report not found")
        
    comment_id = str(uuid.uuid4())
    now = datetime.now(bz_tz)
    timestamp_str = now.strftime('%H:%M')
    
    comment_dict = comment.model_dump()
    comment_dict['id'] = comment_id
    comment_dict['timestamp'] = timestamp_str
    
    report_data = doc.to_dict()
    comments = report_data.get('comments', [])
    comments.append(comment_dict)
    
    report_ref.update({'comments': comments})
    
    return comment_dict
