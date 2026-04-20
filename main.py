from dotenv import load_dotenv
#? โหลดค่า Configuration จากไฟล์ .env (เช่น API Keys หรือ Database URL)
load_dotenv()

from fastapi import FastAPI, Header, HTTPException, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from routers import reports, admin, announcements, plans, uploads, fuel
from models import LoginRequest, UserInfo, PasswordUpdateRequest
from auth import create_access_token, get_current_user
import os
import bcrypt
from contextlib import asynccontextmanager
from database import get_db
from activity_logger import log_activity, LogAction
from ldap3 import Server as LdapServer, Connection, ALL as LDAP_ALL
from ldap3.core.exceptions import LDAPBindError, LDAPException

#? ค่าคงที่สำหรับ Active Directory
AD_SERVER_IP = os.getenv("AD_SERVER_IP")          #! ต้องตั้ง ENV — ห้าม hardcode IP ภายใน
AD_DOMAIN_PREFIX = os.getenv("AD_DOMAIN_PREFIX", "RMUTL")
AD_DOMAIN_SUFFIX = os.getenv("AD_DOMAIN_SUFFIX", "rmutl.ac.th")


#? ตรวจสอบว่ารหัสผ่านนี้ผ่านการ hash ด้วย bcrypt แล้วหรือยัง
def _is_hashed(password: str) -> bool:
    return password.startswith("$2b$") or password.startswith("$2a$")


#? Hash รหัสผ่านด้วย bcrypt (rounds=12)
def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


#? เปรียบเทียบรหัสผ่านกับ hash ที่เก็บไว้ (รองรับทั้ง bcrypt hash และ plaintext เพื่อ Lazy Migration)
def _verify_password(plain: str, stored: str) -> bool:
    if _is_hashed(stored):
        #? รหัสผ่าน hash แล้ว — ใช้ bcrypt เปรียบเทียบ
        return bcrypt.checkpw(plain.encode("utf-8"), stored.encode("utf-8"))
    #? รหัสผ่านยังเป็น plaintext (ยังไม่ migrate) — เปรียบเทียบตรงๆ
    return plain == stored


#? ยืนยันตัวตนผ่าน Active Directory ด้วย ldap3
#? คืนค่า (authenticated, server_available):
#?   (True,  True)  → AD ยืนยันสำเร็จ
#?   (False, True)  → AD พร้อมใช้งาน แต่รหัสผ่านผิด
#?   (False, False) → เชื่อมต่อ AD ไม่ได้ — ให้ fallback ตรวจ bcrypt แทน
def _authenticate_ad(username: str, password: str) -> tuple[bool, bool]:
    try:
        server = LdapServer(AD_SERVER_IP, get_info=LDAP_ALL, connect_timeout=3)
        conn = Connection(server, user=f'{AD_DOMAIN_PREFIX}\\{username}', password=password, auto_bind=True)
        conn.unbind()
        return True, True
    except LDAPBindError:
        #! Bind ล้มเหลว — username/password ผิด (server ตอบสนองแต่ปฏิเสธ)
        return False, True
    except LDAPException:
        #! ไม่สามารถเชื่อมต่อ AD ได้ (timeout, network error)
        return False, False
    except Exception:
        return False, False


#? กำหนดสิ่งที่จะให้ระบบทำทันทีที่เริ่มรันหรือปิดตัวลง (Lifespan Events)
@asynccontextmanager
async def lifespan(app: FastAPI):
    #? เริ่มต้นการเชื่อมต่อ Firebase ทันทีที่ API เริ่มทำงาน
    get_db()
    yield

app = FastAPI(title="WFH Daily Report API", lifespan=lifespan)

#? Mount โฟลเดอร์ uploads ไว้สำหรับเสิร์ฟไฟล์ PDF แบบ Static ให้ดาวน์โหลด/เปิดดูได้
if not os.path.exists("uploads"):
    os.makedirs("uploads")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

#? จัดการ Error 404 ทุกกรณี — ให้แสดงหน้า 404.html แทน JSON error default ของ FastAPI
@app.exception_handler(StarletteHTTPException)
async def not_found_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code == 404:
        #? ถ้าเป็นการเรียกใช้ API ให้ส่ง JSON กลับไป เพื่อไม่ให้ JS ฝั่ง Client สับสนกับ HTML
        if request.url.path.startswith("/api/"):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=404, content={"detail": exc.detail})
        return FileResponse("static/404.html", status_code=404)
    #! กรณี HTTP error อื่น ๆ ที่ไม่ใช่ 404 ให้ยังคง raise ต่อไปตามปกติ
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

#? ปิด Log กวนใจจาก Chrome DevTools ที่พยายามเรียกหาไฟล์คอนฟิก
@app.get("/.well-known/appspecific/com.chrome.devtools.json", include_in_schema=False)
def chrome_devtools_json():
    return {}


#? ตั้งค่า CORS (Cross-Origin Resource Sharing) 
#! ในสภาพแวดล้อมจริง (Production) ควรระบุ Origins ที่ชัดเจนแทน "*" เพื่อความปลอดภัย
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#? API Endpoint สำหรับการเข้าสู่ระบบ (Login) — ยืนยันตัวตนผ่าน AD เป็นหลัก / fallback bcrypt เมื่อ AD ล่ม
@app.post("/api/login")
def login(req: LoginRequest, request: Request):
    db = get_db()

    #? Normalize: ตัด @domain ออก เพื่อให้ได้ username สั้น ไม่ว่าผู้ใช้จะพิมพ์แบบไหน
    raw_input = req.email.strip()
    if "@" in raw_input:
        username = raw_input.split("@")[0].lower()
    else:
        username = raw_input.lower()
    full_email = f"{username}@{AD_DOMAIN_SUFFIX}"

    #? ลอง authenticate ผ่าน Active Directory ก่อน
    ad_ok, ad_available = _authenticate_ad(username, req.password)

    if ad_available and not ad_ok:
        #! AD พร้อมใช้งาน แต่ปฏิเสธ credentials — ไม่ fallback
        log_activity(db, action=LogAction.LOGIN_FAIL, request=request,
                     user_id=username, details={"email": full_email, "reason": "AD rejected"}, success=False)
        raise HTTPException(status_code=401, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")

    #? ดึงข้อมูล user จาก Firestore (ต้องมีอยู่จึงจะ login ได้)
    user_ref = db.collection("users").document(full_email)
    user_snap = user_ref.get()
    if not user_snap.exists:
        log_activity(db, action=LogAction.LOGIN_FAIL, request=request,
                     user_id=username, details={"email": full_email, "reason": "user not found"}, success=False)
        raise HTTPException(status_code=401, detail="ไม่พบบัญชีผู้ใช้ในระบบ")

    user_data = user_snap.to_dict()

    if not ad_available:
        #? AD ล่ม — fallback ตรวจสอบรหัสผ่านจาก Firestore แทน
        stored_pw = user_data.get("password", "")
        if not _verify_password(req.password, stored_pw):
            log_activity(db, action=LogAction.LOGIN_FAIL, request=request,
                         user_id=username, details={"email": full_email, "reason": "wrong password (fallback)"}, success=False)
            raise HTTPException(status_code=401, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
        #? Lazy Migration — ถ้ารหัสผ่านยังเป็น plaintext ให้ hash แล้วเขียนทับลง Firestore ทันที
        if not _is_hashed(stored_pw):
            user_ref.update({"password": _hash_password(req.password)})

    #? สร้าง JWT token พร้อม payload ข้อมูล user
    token = create_access_token({
        "sub": full_email,
        "user_id": user_data.get("personal_id", ""),
        "name": f"{user_data.get('firstname', '')} {user_data.get('lastname', '')}".strip(),
        "role": user_data.get("role", "employee"),
        "position": user_data.get("position", ""),  #? เพิ่มตำแหน่งงานจริงลงใน Token เพื่อใช้แสดงผลแทน role
        "level": user_data.get("level", 0),
        "department": user_data.get("department", ""),
        "agency": user_data.get("agency", ""),
    })

    #? log login สำเร็จ
    log_activity(db, action=LogAction.LOGIN_SUCCESS, request=request,
                 user_id=user_data.get("personal_id", ""),
                 user_name=f"{user_data.get('firstname','')} {user_data.get('lastname','')}".strip(),
                 user_level=user_data.get("level", 0),
                 details={"email": full_email, "ad_used": ad_available and ad_ok})

    return {
        "status": "success",
        "token": token,
        "user": {**user_data, "email": full_email}
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
def update_my_password(req: PasswordUpdateRequest, request: Request, current_user: dict = Depends(get_current_user)):
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

    #? Hash รหัสผ่านใหม่ก่อนบันทึกลง Firestore — ไม่เก็บ plaintext เด็ดขาด
    user_ref.update({
        "password": _hash_password(req.new_password)
    })

    log_activity(db, action=LogAction.PASSWORD_CHANGE, request=request, user=current_user)

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
app.include_router(announcements.router, prefix="/api/announcements", tags=["Announcements"])
app.include_router(plans.router, prefix="/api/plans", tags=["Plans"])
app.include_router(uploads.router, prefix="/api/upload", tags=["Uploads"])
app.include_router(fuel.router, prefix="/api/fuel", tags=["Fuel"])

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
