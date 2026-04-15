import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from jose import JWTError, jwt
from fastapi import Header, HTTPException

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "Matoom-So-Lovly-Cat")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8


def create_access_token(data: dict) -> str:
    payload = data.copy()
    expire = datetime.now(ZoneInfo("Asia/Bangkok")) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload["exp"] = expire
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user(authorization: str = Header(None)) -> dict:
    """FastAPI dependency — ใช้ใน Depends() ทุก endpoint ที่ต้องการ auth"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.removeprefix("Bearer ")
    return decode_access_token(token)
