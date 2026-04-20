import firebase_admin
from firebase_admin import credentials, firestore

import os

#? อ่านชื่อไฟล์ Credential จาก ENV — fallback เป็นชื่อไฟล์เดิมถ้าไม่ได้ตั้งค่า
#! คำเตือน: ไฟล์ .json นี้เป็นข้อมูลลับสูงสุด (Credential) ห้ามแชร์หรืออัปโหลดขึ้น Public Repository โดยเด็ดขาด
_credential_file = os.getenv("FIREBASE_CREDENTIAL_FILE", "work-from-home-75108-firebase-adminsdk-fbsvc-73f34e61a2.json")
CREDENTIAL_PATH = os.path.join(os.path.dirname(__file__), _credential_file)

#? ฟังก์ชันสำหรับการดึงอินสแตนซ์ของฐานข้อมูล Firestore (Get Database Client)
def get_db():
    #? ตรวจสอบว่า Firebase App ถูกเริ่มต้นการทำงานไปแล้วหรือยัง (เพื่อไม่ให้เกิด Error ในการ Initialize ซ้ำ)
    if not firebase_admin._apps:
        #? โหลดไฟล์ Credential เพื่อระบุสิทธิ์ในการจัดการ Firebase Project
        cred = credentials.Certificate(CREDENTIAL_PATH)
        #? เริ่มต้นการทำงานของ Firebase Admin SDK
        firebase_admin.initialize_app(cred)
    
    #? ส่งคืน Client ของ Firestore เพื่อให้นำไปใช้งานในการ Query ข้อมูลต่อไป
    #todo ในอนาคตควรนำข้อมูลในไฟล์ JSON ไปใส่ใน Environment Variable แทนการอ้างอิงไฟล์โดยตรงเพื่อความปลอดภัย
    return firestore.client()
