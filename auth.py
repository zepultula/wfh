import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from jose import JWTError, jwt
from fastapi import Header, HTTPException

#? กุญแจลับสำหรับใช้ลงนาม (Sign) และตรวจสอบ Token 
#! สำคัญมาก: ในระบบจริง (Production) ต้องตั้งค่า JWT_SECRET_KEY ใน .env และไม่ควรใช้ค่า Default ที่ตั้งไว้ในโค้ด
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "Matoom-So-Lovly-Cat")

#? อัลกอริทึมที่ใช้ในการเข้ารหัส (HS256 เป็นที่นิยมและปลอดภัยสำหรับการใช้งานทั่วไป)
ALGORITHM = "HS256"

#? กำหนดเวลาหมดอายุของ Token (ในที่นี้คือ 8 ชั่วโมง ซึ่งครอบคลุมเวลาทำงาน 1 วันพอดี)
ACCESS_TOKEN_EXPIRE_HOURS = 8


#? ฟังก์ชันสำหรับการสร้าง Access Token (JWT) เพื่อส่งกลับไปให้ Client
def create_access_token(data: dict) -> str:
    #? ทำการคัดลอกข้อมูล (Payload) เพื่อป้องกันการแก้ไขข้อมูลต้นฉบับโดยไม่ตั้งใจ
    payload = data.copy()
    
    #? กำหนดวันเวลาหมดอายุของ Token โดยอ้างอิงจากเวลาปัจจุบันของประเทศไทย
    expire = datetime.now(ZoneInfo("Asia/Bangkok")) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    
    #? เพิ่มฟิลด์ 'exp' (Expiration Time) ลงใน Payload เพื่อให้ Library ตรวจสอบการหมดอายุได้อัตโนมัติ
    payload["exp"] = expire
    
    #? ทำการเข้ารหัสข้อมูล Payload ด้วย SECRET_KEY และอัลกอริทึมที่กำหนด
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


#? ฟังก์ชันสำหรับการถอดรหัสและตรวจสอบความถูกต้องของ Token
def decode_access_token(token: str) -> dict:
    try:
        #? พยายามถอดรหัส Token ด้วยกุญแจลับที่เก็บไว้
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        #? หาก Token ถูกแก้ไข, หมดอายุ หรือไม่ถูกต้อง จะถูกเด้งออกด้วย Error 401 ทันที
        #! ผู้เรียกใช้งานฟังก์ชันนี้ต้องระวังการจัดการ Error หากต้องการจัดการแบบ Custom
        raise HTTPException(status_code=401, detail="Invalid or expired token")


#? FastAPI Dependency: ใช้สำหรับฉีดสิทธิ์ (Dependency Injection) เข้าไปในแต่ละ API Endpoint
def get_current_user(authorization: str = Header(None)) -> dict:
    """FastAPI dependency — ใช้ใน Depends() ทุก endpoint ที่ต้องการ auth"""
    
    #? ตรวจสอบว่าใน Header มีฟิลด์ 'Authorization' และขึ้นต้นด้วย 'Bearer ' หรือไม่
    #! หากไม่มีหรือรูปแบบไม่ถูกต้อง จะปฏิเสธการเข้าถึงทันที (Unauthorized)
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    #? ตัดคำว่า 'Bearer ' ออกเพื่อดึงเอาเฉพาะตัว Token เพียวๆ ส่งไปตรวจสอบ
    token = authorization.removeprefix("Bearer ")
    
    #? ส่ง Token ไปตรวจสอบและดึงร่างข้อมูลผู้ใช้ (Payload) ออกมา
    #todo ในอนาคตอาจเพิ่มการตรวจสอบข้อมูลผู้ใช้ซ้ำกับฐานข้อมูล (Database Check) เพื่อความปลอดภัยสูงสุด
    return decode_access_token(token)
