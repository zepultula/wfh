from pydantic import BaseModel
from typing import List, Literal, Optional
from datetime import datetime

#? Model สำหรับเก็บข้อมูลพื้นฐานของพนักงานที่ผ่านการตรวจสอบสิทธิ์แล้ว (ใช้ใน Auth Token)
class UserInfo(BaseModel):
    user_id: str
    email: str
    name: str
    role: str
    position: str = ""  #? ตำแหน่งงานจริงของพนักงาน (เช่น อาจารย์, ผู้ช่วยศาสตราจารย์) ใช้สำหรับแสดงผลแทน role
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
    #? True = งานนี้มาจากแผนงานรายสัปดาห์ (ชื่องานจะถูกล็อกแก้ไขไม่ได้ในหน้าพนักงาน)
    from_plan: Optional[bool] = False

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

#? โครงสร้างข้อมูลสำหรับขอเปลี่ยนรหัสผ่าน
class PasswordUpdateRequest(BaseModel):
    new_password: str
    confirm_password: str

#? โครงสร้างข้อมูลสำหรับสร้างประกาศใหม่
class AnnouncementCreate(BaseModel):
    title: str
    body: str
    is_active: bool = True
    target: Literal["all", "employee", "admin"] = "all"

#? โครงสร้างข้อมูลสำหรับอัปเดตประกาศ (ทุกฟิลด์เป็น Optional)
class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    is_active: Optional[bool] = None
    target: Optional[Literal["all", "employee", "admin"]] = None

#? โครงสร้างงานแต่ละรายการในแผนงานรายสัปดาห์
class PlanTask(BaseModel):
    id: int
    title: str
    description: Optional[str] = ""
    goal: Optional[str] = ""        #? เป้าหมายของงานนี้คืออะไร
    output: Optional[str] = ""      #? ผลผลิต/สิ่งที่ส่งมอบ (deliverable)
    kpi_name: Optional[str] = ""    #? ชื่อตัวชี้วัด (KPI metric name)
    kpi_target: Optional[str] = ""  #? ค่าเป้าหมายของตัวชี้วัด
    approved: bool = False
    approved_by: Optional[str] = ""
    approved_at: Optional[str] = ""

#? สร้าง/อัปเดตแผนงานสำหรับสัปดาห์หนึ่ง (จันทร์–เสาร์)
class WeeklyPlanCreate(BaseModel):
    week_start: str   #? "YYYY-MM-DD" ต้องเป็นวันจันทร์เสมอ
    days: dict        #? { "YYYY-MM-DD": List[PlanTask dict] }

#? อนุมัติหรือยกเลิกการอนุมัติงานเดี่ยวในแผน
class TaskApprovalUpdate(BaseModel):
    date: str         #? "YYYY-MM-DD"
    task_id: int
    approved: bool

#todo เพิ่มระบบ Data Validation (เช่น progress ต้องอยู่ระหว่าง 0-100 หรือตรวจสอบอีเมลที่ถูกต้อง) ในอนาคต
#! ในปัจจุบันระบบยังไม่ได้จำกัดความยาวของ String ในฟิลด์ต่างๆ อาจทำให้เกิดปัญหาถ้าส่งข้อมูลยาวเกินไปลงใน Firestore
