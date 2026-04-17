"""
migrate_passwords.py — Batch Script สำหรับแปลงรหัสผ่าน Plaintext ทั้งหมดใน Firebase เป็น bcrypt hash
รันครั้งเดียวก่อน deploy ระบบ Password Hashing จริง

วิธีใช้:
    python tools/migrate_passwords.py   (จาก root ของโปรเจกต์)

ผล:
    - user ที่รหัสผ่านยังเป็น plaintext จะถูก hash และเขียนทับลง Firestore
    - user ที่ hash แล้วจะถูกข้ามไป (idempotent — รันซ้ำได้ปลอดภัย)
"""

import sys
import os
#? เพิ่ม root ของโปรเจกต์เข้า sys.path เพื่อให้ import database, dotenv ได้จากโฟลเดอร์ tools
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
#? โหลด .env ก่อนเสมอเพื่อให้ Firebase credentials พร้อมใช้งาน
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import bcrypt
from database import get_db


def is_hashed(password: str) -> bool:
    """ตรวจสอบว่ารหัสผ่านนี้ผ่านการ hash ด้วย bcrypt แล้วหรือยัง"""
    #? bcrypt hash ขึ้นต้นด้วย $2b$ หรือ $2a$ เสมอ — plaintext ไม่มีทาง
    return password.startswith("$2b$") or password.startswith("$2a$")


def main():
    db = get_db()
    users_ref = db.collection("users")

    total = 0
    migrated = 0
    skipped = 0
    errors = 0

    print("เริ่มต้น Migration รหัสผ่าน Plaintext → bcrypt hash...\n")

    for doc in users_ref.stream():
        total += 1
        data = doc.to_dict()
        email = doc.id
        password = data.get("password", "")

        if not password:
            #! user บางคนอาจไม่มี field password — ข้ามไป
            print(f"  [SKIP]  {email} — ไม่มี field password")
            skipped += 1
            continue

        if is_hashed(password):
            #? รหัสผ่านนี้ hash แล้ว ไม่ต้องทำซ้ำ
            print(f"  [OK]    {email} — hash แล้ว")
            skipped += 1
            continue

        try:
            #? แปลง plaintext → bcrypt hash (rounds=12 สมดุลระหว่างความปลอดภัยและความเร็ว)
            hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12))
            doc.reference.update({"password": hashed.decode("utf-8")})
            print(f"  [DONE]  {email} — migrate สำเร็จ")
            migrated += 1
        except Exception as e:
            #! เกิด error — บันทึกและทำต่อ ไม่หยุด script
            print(f"  [ERROR] {email} — {e}")
            errors += 1

    print(f"\nสรุป: ทั้งหมด {total} user")
    print(f"  migrate แล้ว : {migrated}")
    print(f"  ข้ามไป (hash แล้ว / ไม่มีรหัส) : {skipped}")
    print(f"  error : {errors}")

    if errors == 0:
        print("\nMigration เสร็จสมบูรณ์ ✓")
    else:
        print(f"\n! มี {errors} error — ตรวจสอบ log ด้านบน")


if __name__ == "__main__":
    main()
