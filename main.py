from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from routers import reports, admin
from models import LoginRequest, UserInfo
from auth import create_access_token, get_current_user
import os
from contextlib import asynccontextmanager
from database import get_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize Firebase on startup
    get_db()
    yield

app = FastAPI(title="WFH Daily Report API", lifespan=lifespan)

# Allow CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/login")
def login(req: LoginRequest):
    db = get_db()
    users_ref = db.collection("users")
    doc = users_ref.document(req.email).get()

    if not doc.exists:
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

    return result

app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])

# Ensure static directories exist
os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js", exist_ok=True)

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def index():
    return RedirectResponse(url="/static/index.html")

if __name__ == "__main__":
    import uvicorn
    #? ดึงค่าจาก Environment Variables ถ้าไม่มีให้ใช้ค่า Default
    #? บนเซิร์ฟเวอร์จริง '0.0.0.0' คือการยอมรับทุก IP ที่วิ่งเข้ามาหาเครื่องนี้
    host_ip = os.getenv("APP_HOST", "0.0.0.0")
    port_num = int(os.getenv("APP_PORT", 8000))

    print(f"🚀 เริ่มรันระบบที่ {host_ip}:{port_num} เรียบร้อย!")
    uvicorn.run("main:app", host=host_ip, port=port_num, reload=False)
