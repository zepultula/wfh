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

@router.get("/", response_model=List[ReportOut])
def get_reports(date: str = None):
    db = get_db()
    reports_ref = db.collection('reports')
    
    # Simple query implementation, could be optimized
    docs = reports_ref.stream()
    
    reports = []
    for doc in docs:
        data = doc.to_dict()
        # If date is provided, filter by date string 'YYYY-MM-DD'
        if date and not data.get('timestamp', '').startswith(date):
            continue
        reports.append(data)
        
    # Sort by timestamp descending
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
