from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

#? Model สำหรับเก็บข้อมูลพื้นฐานของพนักงานที่ผ่านการตรวจสอบสิทธิ์แล้ว (ใช้ใน Auth Token)
class UserInfo(BaseModel):
    user_id: str
    email: str
    name: str
    role: str
    department: str
    agency: str
    level: int

#? โครงสร้างข้อมูลที่รับมาจากหน้าจอ Login
class LoginRequest(BaseModel):
    email: str
    password: str

#? รายละเอียดงานแต่ละรายการที่ระบุในรายงานประจำวัน
class TaskModel(BaseModel):
    id: int
    title: str
    description: Optional[str] = ""
    #? สถานะของงาน: 'done' (เสร็จสิ้น), 'prog' (กำลังทำ), 'pend' (รอดำเนินการ)
    status: str 

#? โครงสร้างพื้นฐานของรายงาน (Base Schema)
class ReportBase(BaseModel):
    user_id: str
    name: str
    role: str
    department: str
    #? รูปแบบการทำงาน: 'wfh' (ที่บ้าน), 'onsite' (ที่ทำงาน), 'hybrid' (ผสม)
    work_mode: str 
    #? ความคืบหน้ารวมเป็นเปอร์เซ็นต์ (0-100)
    progress: int
    problems: str
    plan_tomorrow: str
    tasks: List[TaskModel]
    
#? ใช้สำหรับการสร้างรายงานใหม่ (ไม่มีฟิลด์ ID หรือ Time ที่ระบบจะสร้างให้เอง)
class ReportCreate(ReportBase):
    pass

#? ข้อมูลสำหรับสร้างคอมเมนท์ใหม่ (Feedback จากหัวหน้างานหรือการตอบกลับ)
class CommentCreate(BaseModel):
    author_id: str
    author_name: str
    author_role: str
    #? สีของวงกลมอวตาร (เช่น 'primary', 'success', 'danger')
    avatar_color: str
    #? อักษรย่อชื่อพนักงานสำหรับแสดงในอวตาร
    author_initials: str
    message: str
    #? ป้ายกำกับพิเศษ (เช่น 'Urgent', 'Correct')
    tag: Optional[str] = ""

#? โครงสร้างคอมเมนท์ที่รวมข้อมูลจากระบบ (ID และเวลาที่ส่ง)
class CommentModel(CommentCreate):
    id: str
    timestamp: str

#? โครงสร้างข้อมูลรายงานที่ส่งออกจาก API (รวมข้อมูลระบบและรายการคอมเมนท์)
class ReportOut(ReportBase):
    id: str
    timestamp: str
    #? เวลาที่ส่งรายงานแบบสั้น (เช่น 14:30)
    submit_time: str
    comments: List[CommentModel] = []

#todo เพิ่มระบบ Data Validation (เช่น progress ต้องอยู่ระหว่าง 0-100 หรือตรวจสอบอีเมลที่ถูกต้อง) ในอนาคต
#! ในปัจจุบันระบบยังไม่ได้จำกัดความยาวของ String ในฟิลด์ต่างๆ อาจทำให้เกิดปัญหาถ้าส่งข้อมูลยาวเกินไปลงใน Firestore
