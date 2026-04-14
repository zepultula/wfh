from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from routers import reports, admin
from models import UserInfo
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

from fastapi import Header, HTTPException
from models import LoginRequest

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
        
    return {
        "status": "success",
        "token": req.email, # For mockup we use email as a token
        "user": user_data
    }

@app.get("/api/me", response_model=UserInfo)
def get_current_user(authorization: str = Header(None)):
    """Return current user info from token (email)"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    email = authorization.replace("Bearer ", "")
    db = get_db()
    doc = db.collection("users").document(email).get()
    
    if not doc.exists:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    user_data = doc.to_dict()
    return {
        "user_id": user_data.get("personal_id", ""),
        "email": user_data.get("email", ""),
        "name": f"{user_data.get('firstname', '')} {user_data.get('lastname', '')}",
        "role": user_data.get("role", "employee"),
        "department": user_data.get("department", ""),
        "agency": user_data.get("agency", ""),
        "level": user_data.get("level", 0)
    }

@app.get("/api/users")
def get_users(authorization: str = Header(None)):
    """Return list of users the caller is authorized to see"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    email = authorization.replace("Bearer ", "")

    db = get_db()
    caller_doc = db.collection("users").document(email).get()
    if not caller_doc.exists:
        raise HTTPException(status_code=401, detail="Invalid token")

    caller = caller_doc.to_dict()
    level = caller.get("level", 0)
    role = caller.get("role", "").lower()
    personal_id = caller.get("personal_id")
    is_super_admin = level == 9 or 'admin' in role

    allowed_target_ids = set()
    if not is_super_admin and 1 <= level <= 3:
        for e in db.collection("evaluations") \
                    .where("evaluator_ids", "array-contains", personal_id) \
                    .stream():
            allowed_target_ids.add(e.to_dict().get("target_id"))

    result = []
    for u_doc in db.collection("users").stream():
        u = u_doc.to_dict()
        u_pid = u.get("personal_id")
        u_role = u.get("role", "").lower()
        u_level = u.get("level", 0)

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
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
