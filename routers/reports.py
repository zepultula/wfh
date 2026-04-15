from fastapi import APIRouter, HTTPException, Body, Depends
from database import get_db
from models import ReportCreate, ReportOut, CommentCreate, CommentModel, TaskModel
from auth import get_current_user
from typing import List
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

#? กำหนด Router สำหรับจัดการรายงานประจำวัน (Reports)
router = APIRouter()
#? ตั้งค่า Timezone เป็นประเทศไทยเพื่อให้เวลาในรายงานถูกต้อง
bz_tz = ZoneInfo('Asia/Bangkok')

#? API สำหรับส่งรายงานประจำวัน (หากส่งซ้ำในวันเดียวกันจะถือเป็นการแก้ไขรายงานเดิม)
@router.post("/", response_model=ReportOut)
def create_report(report: ReportCreate):
    db = get_db()

    now = datetime.now(bz_tz)
    #? ดึงวันที่ปัจจุบันมาใช้ตั้งชื่อ ID (YYYY-MM-DD)
    date_str = now.strftime('%Y-%m-%d')
    #? บันทึกวันเวลาที่ส่งรายงานแบบเต็ม (ใช้แสดงผลในตาราง)
    timestamp = now.strftime('%Y-%m-%d %H:%M:%S')
    #? แยกเฉพาะเวลาที่ส่งเพื่อใช้แสดงผลในแดชบอร์ด
    submit_time = now.strftime('%H:%M')

    #? ใช้ user_id ต่อด้วยวันที่เป็น ID ของ Document เพื่อป้องกันการส่งรายงานซ้ำซ้อนในวันเดียวกัน
    report_id = f"{report.user_id}_{date_str}"

    report_dict = report.model_dump()
    report_dict['id'] = report_id
    report_dict['timestamp'] = timestamp
    report_dict['submit_time'] = submit_time

    #? ตรวจสอบว่าพนักงานคนนี้เคยส่งรายงานของวันนี้มาแล้วหรือยัง
    doc = db.collection('reports').document(report_id).get()
    if doc.exists:
        #? หากเคยส่งแล้ว ให้ดึงคอมเมนท์เดิมที่มีอยู่กลับมา (เพื่อไม่ให้คอมเมนท์หายไปเมื่อแก้ไขรายงาน)
        report_dict['comments'] = doc.to_dict().get('comments', [])
    else:
        #? หากเป็นการส่งครั้งแรกของวัน ให้กำหนดรายการคอมเมนท์เป็นอาเรย์ว่าง
        report_dict['comments'] = []

    db.collection('reports').document(report_id).set(report_dict)

    return report_dict

#? API ดึงรายการรายงานทั้งหมด (คัดกรองตามสิทธิ์การเข้าถึง)
@router.get("/", response_model=List[ReportOut])
def get_reports(date: str = None, current_user: dict = Depends(get_current_user)):
    level = current_user.get("level", 0)
    role = current_user.get("role", "").lower()
    personal_id = current_user.get("user_id")

    #? ตรวจสอบประเภทผู้ใช้งาน: Super Admin (Level 9 หรือมี Role 'admin') 
    #? จะมีสิทธิ์สูงสุดในการเข้าถึงข้อมูลพนักงานทุกคนได้โดยไม่ต้องกรอง
    is_super_admin = level == 9 or 'admin' in role

    db = get_db()

    #? ตัวแปรสำหรับเก็บรายชื่อพนักงานที่ Supervisor ท่านนี้มีสิทธิ์ประเมิน/มองเห็น
    allowed_target_ids = set()
    if not is_super_admin and 1 <= level <= 3:
        #? ค้นหาสายการบังคับบัญชาจาก 'evaluations' โดยเปรียบเทียบจาก personal_id ของหัวหน้า
        #? เพื่อดึงรายชื่อเฉพาะพนักงาน (Target) ที่อยู่ในความดูแลเท่านั้นมาแสดงผล
        for e in db.collection("evaluations") \
                    .where("evaluator_ids", "array_contains", personal_id) \
                    .stream():
            allowed_target_ids.add(e.to_dict().get("target_id"))

    reports_ref = db.collection('reports')
    #todo ควรเปลี่ยนไปใช้ .where() ในการ Query ตั้งแต่แรกแทนการดึงมาทั้งหมดเพื่อประหยัด Resource
    #! การใช้ .stream() ดึงข้อมูลทั้งหมดมาวนลูปกรองใน Python จะทำงานช้าลงหากข้อมูลมีจำนวนมหาศาล
    docs = reports_ref.stream()

    reports = []
    for doc in docs:
        data = doc.to_dict()
        if date and not data.get('timestamp', '').startswith(date):
            continue

        r_user_id = data.get('user_id')

        #? กรองข้อมูลแยกตามลำดับขั้นความปลอดภัย
        if is_super_admin:
            pass  #? สิทธิ์สูงสุด: ไม่ต้องกรองข้าม (มองเห็นได้ทุกคน)
        elif level == 0:
            if r_user_id != personal_id:
                #? พนักงานระดับทั่วไป: มองเห็นได้เฉพาะรายงานของตัวเองเท่านั้น
                continue
        elif 1 <= level <= 3:
            if r_user_id not in allowed_target_ids and r_user_id != personal_id:
                #? หัวหน้างาน: มองเห็นรายงานของตัวเองและลูกน้องในสายงานที่ได้รับอนุญาตเท่านั้น
                continue
        else:
            if r_user_id != personal_id:
                #? กรณีอื่นๆ ที่ไม่ได้ระบุไว้: ให้ปลอดภัยไว้ก่อนโดยให้เห็นได้เฉพาะตัวเอง
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
    #? ทำการอัปเดตเฉพาะฟิลด์ 'tasks' ในเอกสารรายงานเดิม
    report_ref.update({'tasks': tasks_data})
    return {"success": True}

#? เพิ่มคอมเมนท์ลงในรายงาน
@router.post("/{report_id}/comments", response_model=CommentModel)
def add_comment(report_id: str, comment: CommentCreate):
    db = get_db()
    report_ref = db.collection('reports').document(report_id)
    doc = report_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Report not found")

    #? สร้างรหัสสุ่ม ID (UUID) สำหรับอ้างอิงและจัดการคอมเมนท์แต่ละรายการในภายหลัง
    comment_id = str(uuid.uuid4())
    now = datetime.now(bz_tz)
    #? บันทึกเฉพาะเวลาที่ส่งคอมเมนท์ (เช่น 15:45) เพื่อความกระชับในการแสดงผลในแชท
    timestamp_str = now.strftime('%H:%M')

    #? เตรียมข้อมูลคอมเมนท์ในรูปแบบ Dictionary เพื่อบันทึกลง Firestore
    comment_dict = comment.model_dump()
    comment_dict['id'] = comment_id
    comment_dict['timestamp'] = timestamp_str

    report_data = doc.to_dict()
    comments = report_data.get('comments', [])
    comments.append(comment_dict)

    report_ref.update({'comments': comments})

    return comment_dict
