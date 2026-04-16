from dotenv import load_dotenv
#? โหลดค่า Configuration จากไฟล์ .env (เช่น API Keys หรือ Database URL)
load_dotenv()

from fastapi import FastAPI, Header, HTTPException, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from routers import reports, admin
from models import LoginRequest, UserInfo, PasswordUpdateRequest
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

    #? รองรับการ Login ด้วย username ย่อ (ไม่มี @domain) โดยค้นหา email ที่ขึ้นต้นด้วย username นั้น
    if "@" not in req.email:
        username = req.email.strip().lower()
        doc = None
        #? ค้นหา email field ที่อยู่ในช่วง username@ ถึง username + ตัวอักษรหลัง @
        for d in users_ref \
                .where("email", ">=", username + "@") \
                .where("email", "<", username + "A") \
                .limit(1).stream():
            doc = d
        if doc is None:
            raise HTTPException(status_code=401, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
    else:
        doc = users_ref.document(req.email).get()
        if not doc.exists:
            #! หากไม่พบ Email ในระบบ จะส่ง Error 401 กลับไป (ไม่ควรบอกว่าอีเมลผิดหรือรหัสผ่านผิดเพื่อความปลอดภัย)
            raise HTTPException(status_code=401, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")

    user_data = doc.to_dict()
    if user_data.get("password") != req.password:
        raise HTTPException(status_code=401, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")

    #? ใช้ doc.id (Document ID = email) เป็น sub เพื่อให้ตรงกันทั้งกรณีกรอกเต็มและ username ย่อ
    token = create_access_token({
        "sub": doc.id,
        "user_id": user_data.get("personal_id", ""),
        "name": f"{user_data.get('firstname', '')} {user_data.get('lastname', '')}".strip(),
        "role": user_data.get("role", "employee"),
        "position": user_data.get("position", ""),  #? เพิ่มตำแหน่งงานจริงลงใน Token เพื่อใช้แสดงผลแทน role
        "level": user_data.get("level", 0),
        "department": user_data.get("department", ""),
        "agency": user_data.get("agency", ""),
    })

    #? คืนค่า token และข้อมูล user พร้อม email จริงจาก Firestore (doc.id)
    return {
        "status": "success",
        "token": token,
        "user": {**user_data, "email": doc.id}
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
        "position": current_user.get("position", ""),  #? ตำแหน่งงานจริง ใช้แสดงผลแทน role ใน UI
        "department": current_user.get("department", ""),
        "agency": current_user.get("agency", ""),
        "level": current_user.get("level", 0),
    }

#? API สำหรับเปลี่ยนรหัสผ่านของผู้ใช้ปัจจุบัน
@app.post("/api/me/password")
def update_my_password(req: PasswordUpdateRequest, current_user: dict = Depends(get_current_user)):
    """Update current user password in Firestore"""
    email = current_user.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
        
    if len(req.new_password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters long")

    db = get_db()
    user_ref = db.collection("users").document(email)
    
    if not user_ref.get().exists:
        raise HTTPException(status_code=404, detail="User not found")
        
    user_ref.update({
        "password": req.new_password
    })
    
    return {"status": "success", "message": "Password updated successfully"}

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
            "position": u.get("position", ""),  #? เพิ่มตำแหน่งงานจริงเพื่อให้ Frontend แสดงแทน role
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

#? Serve favicon.ico จาก root directory โดยตรง — ป้องกัน 404 ที่ browser ร้องขออัตโนมัติ
@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return FileResponse("favicon.ico")

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
    port_num = int(os.getenv("APP_PORT", 8100))

    print(f"Starting server at {host_ip}:{port_num}...")
    uvicorn.run("main:app", host=host_ip, port=port_num, reload=False)
