from pydantic import BaseModel
from typing import List, Literal, Optional, Dict
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

#? โครงสร้างสำหรับเก็บไฟล์แนบในแต่ละงาน
class TaskFile(BaseModel):
    name: str  # ชื่อไฟล์เดิม (เช่น report.pdf)
    url: str   # พาธที่เก็บไฟล์ (เช่น /uploads/uuid-report.pdf)

#? โครงสร้างสำหรับเก็บลิงก์อ้างอิงในแต่ละงาน
class TaskLink(BaseModel):
    title: str # ชื่อลิงก์ที่ผู้ใช้ระบุ
    url: str   # URL จริง

#? รายละเอียดงานแต่ละรายการที่ระบุในรายงานประจำวัน
class TaskModel(BaseModel):
    id: int
    title: str
    description: Optional[str] = ""
    #? สถานะของงาน: 'done' (เสร็จสิ้น), 'prog' (กำลังทำ), 'pend' (รอดำเนินการ)
    status: str
    #? True = งานนี้มาจากแผนงานรายสัปดาห์ (ชื่องานจะถูกล็อกแก้ไขไม่ได้ในหน้าพนักงาน)
    from_plan: Optional[bool] = False
    files: Optional[List[TaskFile]] = []
    links: Optional[List[TaskLink]] = []
    started_at: Optional[str] = None       #? ISO timestamp เมื่อเริ่มจับเวลางาน (None = ยังไม่เริ่ม)
    elapsed_seconds: Optional[int] = None  #? วินาทีสะสมเมื่อหยุดจับเวลา (None = กำลังวิ่งอยู่)

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

#? บันทึกราคาน้ำมัน ณ วันที่หนึ่ง (สำหรับ price history)
class PriceEntry(BaseModel):
    fuel_price: float         #? ราคาน้ำมันต่อลิตร (บาท)
    effective_from: str       #? วันที่ราคานี้มีผล รูปแบบ YYYY-MM-DD

#? โครงสร้างการตั้งค่าการคำนวณค่าใช้จ่ายน้ำมัน (เก็บใน Firestore collection: fuel_settings, doc ID = user_id)
class FuelSettings(BaseModel):
    distance_km: float        #? ระยะทางไปกลับต่อวัน (กม.)
    fuel_efficiency: float    #? อัตราสิ้นเปลืองน้ำมัน (กม./ลิตร)
    fuel_price: float         #? ราคาน้ำมันต่อลิตร (บาท) — ราคาล่าสุด
    toll_parking: float = 0.0 #? ค่าทางด่วน/ที่จอดรถต่อวัน (บาท)

#? Body สำหรับ PUT /api/fuel/settings — รับราคาพร้อมวันที่มีผล
class FuelSettingsUpdate(BaseModel):
    distance_km: float
    fuel_efficiency: float
    fuel_price: float
    toll_parking: float = 0.0
    effective_from: Optional[str] = None  #? default = วันนี้ ถ้าไม่ระบุ

#? Response สำหรับ GET /api/fuel/settings — รวม price_history
class FuelSettingsWithHistory(BaseModel):
    distance_km: float
    fuel_efficiency: float
    fuel_price: float
    toll_parking: float = 0.0
    price_history: List[PriceEntry] = []

#? โครงสร้างผลลัพธ์การคำนวณประหยัดค่าน้ำมัน WFH รายเดือน
class FuelSavingsResponse(BaseModel):
    settings: FuelSettings
    wfh_days: int             #? จำนวนวันที่ WFH จริงในเดือน (นับจาก reports collection)
    daily_fuel_cost: float    #? ค่าน้ำมันต่อวัน (บาท)
    daily_total_cost: float   #? ค่าใช้จ่ายรวมต่อวัน รวมทางด่วน/จอดรถ (บาท)
    monthly_savings: float    #? เงินที่ประหยัดได้รวมทั้งเดือน (บาท)
    month: str                #? เดือนที่คำนวณ รูปแบบ YYYY-MM

#? โครงสร้างผลลัพธ์การคำนวณประหยัดค่าน้ำมัน WFH รายอาทิตย์
class FuelSavingsWeeklyResponse(BaseModel):
    settings: FuelSettings
    wfh_days: int             #? จำนวนวันที่ WFH จริงในอาทิตย์ (นับจาก reports collection)
    daily_fuel_cost: float    #? ค่าน้ำมันต่อวัน (บาท)
    daily_total_cost: float   #? ค่าใช้จ่ายรวมต่อวัน รวมทางด่วน/จอดรถ (บาท)
    weekly_savings: float     #? เงินที่ประหยัดได้รวมทั้งอาทิตย์ (บาท)
    week_start: str           #? วันจันทร์ของอาทิตย์ที่คำนวณ รูปแบบ YYYY-MM-DD
    week_end: str             #? วันอาทิตย์ของอาทิตย์ที่คำนวณ รูปแบบ YYYY-MM-DD
