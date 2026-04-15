import csv
import json
import codecs
from database import get_db
from firebase_admin import firestore

#? ฟังก์ชันหลักสำหรับนำเข้าข้อมูลเริ่มต้น (Seed Data) เข้าสู่ระบบ
def import_data():
    #? ดึงอินสแตนซ์ฐานข้อมูลเพื่อเตรียมเขียนข้อมูลลง Firestore
    db = get_db()
    
    # 1. Import Users
    print("Starting user import...")
    #? อ้างอิงไปยัง Collection 'users' ใน Firestore
    users_ref = db.collection('users')
    
    #? เปิดไฟล์ employee.csv เพื่ออ่านรายชื่อพนักงาน
    #? ใช้ encoding='utf-8-sig' เพื่อกำจัดตัวอักษร BOM (Byte Order Mark) ที่อาจติดมาจาก Excel
    with codecs.open('employee.csv', 'r', encoding='utf-8-sig') as f:
        #? ใช้ DictReader เพื่อให้อ่านข้อมูลแต่ละแถวออกมาเป็น Dictionary ตามหัวตาราง (Header)
        reader = csv.DictReader(f)
        user_count = 0
        for row in reader:
            email = row['ps_email']
            level_str = row['ps_level'].strip()
            level = int(level_str) if level_str.isdigit() else 0
            
            #? กำหนดบทบาทพนักงาน (Role) ตามระดับเลเวล (Level) ที่ระบุใน CSV
            role = 'employee'
            if level == 1:
                role = 'supervisor'
            elif level == 2:
                role = 'director'
            elif level == 3:
                role = 'executive'
            elif level == 9:
                role = 'super_admin'
                
            #? จัดรูปแบบข้อมูลพนักงานให้อยู่ในโครงสร้างที่ระบบรองรับ
            user_data = {
                'personal_id': row['personal_id'],
                'firstname': row['ps_firstname'],
                'lastname': row['ps_lastname'],
                'email': email,
                'position': row['position_name'],
                'department': row['department_name'],
                'agency': row['agency_name'],
                'level': level,
                'role': role,
                #? กำหนดรหัสผ่านเริ่มต้น (Default Password) ให้ทุกคน
                'password': 'zaqwsx',
                #? บันทึกเวลาที่นำข้อมูลเข้าจาก Server
                'created_at': firestore.SERVER_TIMESTAMP
            }
            
            #? บันทึกลง Firestore โดยใช้ Email เป็นชื่อเอกสาร (Document ID)
            #! คำเตือน: การใช้ .set() โดยไม่มี merge=True จะเป็นการเขียนทับข้อมูลเดิมทั้งหมดใน Document นั้น
            users_ref.document(email).set(user_data)
            user_count += 1
            
    print(f"Successfully imported {user_count} users.")
    
    # 2. Import Evaluations
    print("Starting evaluations import...")
    #? อ้างอิงไปยัง Collection 'evaluations' (สิทธิ์การมองเห็น/ประเมิน)
    evaluations_ref = db.collection('evaluations')
    
    #? อ่านไฟล์ JSON ที่ระบุการจับคู่หัวหน้าและลูกน้อง
    with open('manual_evaluations.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    #? สร้างพจนานุกรมชั่วคราวเพื่อจัดกลุ่มผู้ประเมินตามตัวบุคคล (Target)
    evaluations_dict = {}
    
    for item in data.get('manual_assignments', []):
        target_id = item['target_id']
        if target_id not in evaluations_dict:
            evaluations_dict[target_id] = {
                'target_id': target_id,
                'evaluators': []
            }
            
        evaluations_dict[target_id]['evaluators'].append({
            'evaluator_id': item['evaluator_id'],
            'order': item['order']
        })
        
    #? วนลูปเพื่อเขียนข้อมูลสายการบังคับบัญชาลง Firestore
    eval_count = 0
    for target_id, eval_data in evaluations_dict.items():
        #? สร้างอาเรย์พื้นราบ (Flat Array) ของ ID ผู้ประเมิน เพื่อใช้สำหรับการ Query ด้วย 'array_contains'
        eval_data['evaluator_ids'] = [ev['evaluator_id'] for ev in eval_data['evaluators']]
        evaluations_ref.document(target_id).set(eval_data)
        eval_count += 1
        
    #todo เพิ่มการตรวจสอบว่า personal_id ที่นำเข้านั้นมีตัวตนอยู่ใน Collection 'users' จริงหรือไม่
    print(f"Successfully imported {eval_count} evaluation assignments.")
    
if __name__ == '__main__':
    import_data()
