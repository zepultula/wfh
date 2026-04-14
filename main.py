from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from routers import reports
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

app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])

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
