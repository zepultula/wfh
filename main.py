from dotenv import load_dotenv
#? โหลดค่า Configuration จากไฟล์ .env (เช่น API Keys หรือ Database URL)
load_dotenv()

from fastapi import FastAPI, Header, HTTPException, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from routers import reports, admin
from models import LoginRequest, UserInfo
from auth import create_access_token, get_current_user
import os
from contextlib import asynccontextmanager
from database import get_db

#? กำหนดสิ่งที่จะให้ระบบทำทันทีที่เริ่มรันหรือปิดตัวลง (Lifespan Events)
@asynccontextmanager
async def lifespan(app: FastAPI):
    #? เริ่มต้นการเชื่อมต่อ Firebase ทันทีที่ API เริ่มทำงาน
    get_db()
    yield

app = FastAPI(title="WFH Daily Report API", lifespan=lifespan)

#? จัดการ Error 404 ทุกกรณี — ให้แสดงหน้า 404.html แทน JSON error default ของ FastAPI
@app.exception_handler(StarletteHTTPException)
async def not_found_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code == 404:
        return FileResponse("static/404.html", status_code=404)
    #! กรณี HTTP error อื่น ๆ ที่ไม่ใช่ 404 ให้ยังคง raise ต่อไปตามปกติ
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

#? ตั้งค่า CORS (Cross-Origin Resource Sharing) 
#! ในสภาพแวดล้อมจริง (Production) ควรระบุ Origins ที่ชัดเจนแทน "*" เพื่อความปลอดภัย
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#? API Endpoint สำหรับการเข้าสู่ระบบ (Login)
@app.post("/api/login")
def login(req: LoginRequest):
    #? ดึงอินสแตนซ์ของฐานข้อมูล Firestore
    db = get_db()
    users_ref = db.collection("users")
    doc = users_ref.document(req.email).get()

    if not doc.exists:
        #! หากไม่พบ Email ในระบบ จะส่ง Error 401 กลับไป (ไม่ควรบอกว่าอีเมลผิดหรือรหัสผ่านผิดเพื่อความปลอดภัย)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_data = doc.to_dict()
    if user_data.get("password") != req.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({
        "sub": req.email,
        "user_id": user_data.get("personal_id", ""),
        "name": f"{user_data.get('firstname', '')} {user_data.get('lastname', '')}".strip(),
        "role": user_data.get("role", "employee"),
        "level": user_data.get("level", 0),
        "department": user_data.get("department", ""),
        "agency": user_data.get("agency", ""),
    })

    return {
        "status": "success",
        "token": token,
        "user": user_data
    }

#? API สำหรับดึงข้อมูลของผู้ใช้งานที่ Login อยู่ ณ ปัจจุบัน
@app.get("/api/me", response_model=UserInfo)
def me(current_user: dict = Depends(get_current_user)):
    """Return current user info from JWT token"""
    return {
        "user_id": current_user.get("user_id", ""),
        "email": current_user.get("sub", ""),
        "name": current_user.get("name", ""),
        "role": current_user.get("role", "employee"),
        "department": current_user.get("department", ""),
        "agency": current_user.get("agency", ""),
        "level": current_user.get("level", 0),
    }

#? API สำหรับดึงรายชื่อผู้ใช้งาน (คัดกรองตามสิทธิ์ Role-Based Access Control)
@app.get("/api/users")
def get_users(current_user: dict = Depends(get_current_user)):
    """Return list of users the caller is authorized to see"""
    level = current_user.get("level", 0)
    role = current_user.get("role", "").lower()
    personal_id = current_user.get("user_id")
    is_super_admin = level == 9 or 'admin' in role

    db = get_db()
    allowed_target_ids = set()
    if not is_super_admin and 1 <= level <= 3:
        for e in db.collection("evaluations") \
                    .where("evaluator_ids", "array_contains", personal_id) \
                    .stream():
            allowed_target_ids.add(e.to_dict().get("target_id"))

    result = []
    for u_doc in db.collection("users").stream():
        u = u_doc.to_dict()
        u_pid = u.get("personal_id")

        if is_super_admin:
            pass
        elif level == 0:
            if u_pid != personal_id:
                continue
        elif 1 <= level <= 3:
            #? พนักงานระดับ Supervisor จะเห็นรายงานของลูกน้องตามที่ระบุใน Evaluations
            if u_pid not in allowed_target_ids and u_pid != personal_id:
                continue
        else:
            if u_pid != personal_id:
                continue

        firstname = u.get("firstname", "")
        lastname = u.get("lastname", "")
        name = f"{firstname} {lastname}".strip() or u.get("name", "")
        result.append({
            "user_id": u_pid,
            "name": name,
            "role": u.get("role", ""),
            "department": u.get("department", ""),
            "ignore": u.get("ignore", 0),
        })

    #todo ปรับปรุงประสิทธิภาพการดึงข้อมูลเพื่อให้รองรับจำนวน User ที่เพิ่มขึ้นในอนาคต
    return result

#? นำเข้า API Routes แยกตาม Module (Reports และ Admin)
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])

#? Page routes ต้องกำหนดก่อน app.mount() เสมอ มิฉะนั้น FastAPI จะไม่พบ route
#? ให้หน้าแรก (Login) Serve ไฟล์ HTML โดยตรง ซ่อน URL จริงของไฟล์
@app.get("/")
def index():
    return FileResponse("static/index.html")

#? หน้าพนักงาน — ใช้ URL สะอาด /employee แทน /static/employee.html
@app.get("/employee/")
def employee_page():
    return FileResponse("static/employee.html")

#? หน้าแอดมิน — ใช้ URL สะอาด /admin แทน /static/admin.html
@app.get("/admin/")
def admin_page():
    return FileResponse("static/admin.html")

#? หน้า Logout — เคลียร์ Session และแสดงข้อความสำเร็จก่อน redirect กลับ Login
@app.get("/logout/")
def logout_page():
    return FileResponse("static/logout.html")

# Ensure static directories exist
os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js", exist_ok=True)

#! app.mount ต้องอยู่หลัง @app.get() routes ทั้งหมด — Mount sub-app จะกิน routes ที่ตามมา
app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    #? ดึงค่าจาก Environment Variables ถ้าไม่มีให้ใช้ค่า Default
    #? บนเซิร์ฟเวอร์จริง '0.0.0.0' คือการยอมรับทุก IP ที่วิ่งเข้ามาหาเครื่องนี้
    host_ip = os.getenv("APP_HOST", "0.0.0.0")
    port_num = int(os.getenv("APP_PORT", 8000))

    print(f"🚀 เริ่มรันระบบที่ {host_ip}:{port_num} เรียบร้อย!")
    uvicorn.run("main:app", host=host_ip, port=port_num, reload=False)
