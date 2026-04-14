import csv
import json
import codecs
from database import get_db
from firebase_admin import firestore

def import_data():
    db = get_db()
    
    # 1. Import Users
    print("Starting user import...")
    users_ref = db.collection('users')
    
    # อ่านไฟล์ employee.csv (โดยใช้ utf-8-sig เพื่อตัด BOM หากติดมา)
    with codecs.open('employee.csv', 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        user_count = 0
        for row in reader:
            email = row['ps_email']
            level_str = row['ps_level'].strip()
            level = int(level_str) if level_str.isdigit() else 0
            
            # Map roles
            role = 'employee'
            if level == 1:
                role = 'supervisor'
            elif level == 2:
                role = 'director'
            elif level == 3:
                role = 'executive'
            elif level == 9:
                role = 'super_admin'
                
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
                'password': 'zaqwsx',
                'created_at': firestore.SERVER_TIMESTAMP
            }
            
            # Use email as document ID
            users_ref.document(email).set(user_data)
            user_count += 1
            
    print(f"Successfully imported {user_count} users.")
    
    # 2. Import Evaluations
    print("Starting evaluations import...")
    evaluations_ref = db.collection('evaluations')
    
    with open('manual_evaluations.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        
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
        
    # Write to Firestore
    eval_count = 0
    for target_id, eval_data in evaluations_dict.items():
        eval_data['evaluator_ids'] = [ev['evaluator_id'] for ev in eval_data['evaluators']]
        evaluations_ref.document(target_id).set(eval_data)
        eval_count += 1
        
    print(f"Successfully imported {eval_count} evaluation assignments.")
    
if __name__ == '__main__':
    import_data()
