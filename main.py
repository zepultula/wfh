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

@app.get("/api/me", response_model=UserInfo)
def get_current_user():
    """Return current user info (hardcoded for now, can be replaced with auth later)"""
    return {
        "user_id": "U001",
        "name": "นายนักวิชาการ วิทยาคม",
        "role": "นักวิชาการคอมพิวเตอร์ชำนาญการ",
        "department": "งานระบบสารสนเทศ"
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
