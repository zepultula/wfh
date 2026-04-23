from fastapi import APIRouter, UploadFile, File, HTTPException, Header, Request
import os
import uuid
from typing import Dict
from auth import decode_access_token
from database import get_db
from activity_logger import log_activity, LogAction

#? กำหนด Router สำหรับระบบจัดการไฟล์อัปโหลด
router = APIRouter()

# กำหนดขนาดไฟล์สูงสุดที่อัปโหลดได้ (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024

ALLOWED_EXTENSIONS = {'.pdf', '.jpg', '.jpeg', '.png', '.webp'}

def _validate_magic_bytes(ext: str, data: bytes) -> bool:
    if ext in ('.jpg', '.jpeg'):
        return data[:3] == b'\xFF\xD8\xFF'
    if ext == '.png':
        return data[:8] == b'\x89\x50\x4E\x47\x0D\x0A\x1A\x0A'
    if ext == '.webp':
        return data[:4] == b'RIFF' and data[8:12] == b'WEBP'
    if ext == '.pdf':
        return data[:4] == b'\x25\x50\x44\x46'
    return False

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
async def upload_file(file: UploadFile = File(...), request: Request = None, authorization: str = Header(None)) -> Dict[str, str]:
    """
    รับไฟล์จากฝั่ง Frontend เพื่อบันทึกลงโฟลเดอร์ uploads/
    จำกัดให้เฉพาะไฟล์ .pdf และขนาดไม่เกิน 10MB
    """
    user = _require_auth(authorization)

    # 1. ตรวจสอบนามสกุลไฟล์
    ext = os.path.splitext(file.filename.lower())[1]
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="อนุญาตเฉพาะ PDF, JPG, PNG, WEBP เท่านั้น")

    # 2. ตรวจสอบขนาดไฟล์
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="ขนาดไฟล์เกิน 10MB")

    # 3. ตรวจสอบ Magic Bytes (ป้องกันการ rename ไฟล์อันตราย)
    if not _validate_magic_bytes(ext, contents):
        raise HTTPException(status_code=400, detail="ไฟล์ไม่ตรงกับนามสกุล")

    # เตรียมไฟล์สำหรับบันทึก
    # นำ uuid มาต่อหน้าชื่อไฟล์เพื่อป้องกันปัญหาไฟล์ชื่อซ้ำกัน
    safe_filename = file.filename.replace(" ", "_").replace("/", "").replace("\\", "")
    unique_id = str(uuid.uuid4())[:8]
    final_filename = f"{unique_id}_{safe_filename}"
    file_path = os.path.join(UPLOAD_DIR, final_filename)

    # 3. เซฟไฟล์ลงโฟลเดอร์บนเซิร์ฟเวอร์
    with open(file_path, "wb") as f:
        f.write(contents)

    log_activity(get_db(), action=LogAction.FILE_UPLOAD, request=request, user=user,
                 resource_id=final_filename, resource_type="file",
                 details={"original_name": file.filename, "size_bytes": len(contents)})

    # คืนค่าเส้นทางไปยังไฟล์
    return {
        "name": file.filename,
        "url": f"/uploads/{final_filename}"
    }

@router.delete("/{filename}")
async def delete_file(filename: str, request: Request = None, authorization: str = Header(None)) -> Dict[str, str]:
    """ลบไฟล์ออกจากเซิร์ฟเวอร์"""
    user = _require_auth(authorization)

    # เพื่อป้องกัน Directory Traversal แนะนำให้กั้น path
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            log_activity(get_db(), action=LogAction.FILE_DELETE, request=request, user=user,
                         resource_id=safe_filename, resource_type="file")
            return {"status": "success", "message": "ลบไฟล์สำเร็จ"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"ไม่สามารถลบไฟล์ได้: {str(e)}")
    else:
        raise HTTPException(status_code=404, detail="ไม่พบไฟล์")
