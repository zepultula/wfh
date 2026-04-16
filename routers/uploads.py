from fastapi import APIRouter, UploadFile, File, HTTPException, Header
import os
import uuid
from typing import Dict
from auth import decode_access_token

#? กำหนด Router สำหรับระบบจัดการไฟล์อัปโหลด
router = APIRouter()

# กำหนดขนาดไฟล์สูงสุดที่อัปโหลดได้ (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024

# โฟลเดอร์สำหรับเก็บไฟล์ที่อัปโหลด
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

#? ฟังก์ชันตรวจสอบและดึงตัวตนจาก Token ป้องกันไม่ให้คนนอกอัปโหลดไฟล์เข้ามามั่วซั่ว
def _require_auth(authorization: str):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.removeprefix("Bearer ")
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload

@router.post("")
async def upload_file(file: UploadFile = File(...), authorization: str = Header(None)) -> Dict[str, str]:
    """
    รับไฟล์จากฝั่ง Frontend เพื่อบันทึกลงโฟลเดอร์ uploads/
    จำกัดให้เฉพาะไฟล์ .pdf และขนาดไม่เกิน 10MB
    """
    _require_auth(authorization)

    # 1. ตรวจสอบนามสกุลไฟล์
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="อนุญาตให้อัปโหลดเฉพาะไฟล์ PDF เท่านั้น")
    
    # 2. ตรวจสอบขนาดไฟล์
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="ขนาดไฟล์เกิน 10MB")
    
    # เตรียมไฟล์สำหรับบันทึก
    # นำ uuid มาต่อหน้าชื่อไฟล์เพื่อป้องกันปัญหาไฟล์ชื่อซ้ำกัน
    safe_filename = file.filename.replace(" ", "_").replace("/", "").replace("\\", "")
    unique_id = str(uuid.uuid4())[:8]
    final_filename = f"{unique_id}_{safe_filename}"
    file_path = os.path.join(UPLOAD_DIR, final_filename)
    
    # 3. เซฟไฟล์ลงโฟลเดอร์บนเซิร์ฟเวอร์
    with open(file_path, "wb") as f:
        f.write(contents)
        
    # คืนค่าเส้นทางไปยังไฟล์
    return {
        "name": file.filename,
        "url": f"/uploads/{final_filename}"
    }

@router.delete("/{filename}")
async def delete_file(filename: str, authorization: str = Header(None)) -> Dict[str, str]:
    """ลบไฟล์ออกจากเซิร์ฟเวอร์"""
    _require_auth(authorization)
    
    # เพื่อป้องกัน Directory Traversal แนะนำให้กั้น path
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            return {"status": "success", "message": "ลบไฟล์สำเร็จ"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"ไม่สามารถลบไฟล์ได้: {str(e)}")
    else:
        raise HTTPException(status_code=404, detail="ไม่พบไฟล์")
