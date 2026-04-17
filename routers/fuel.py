from fastapi import APIRouter, HTTPException, Depends, Header
from database import get_db
from auth import get_current_user, decode_access_token
from models import FuelSettings, FuelSettingsUpdate, FuelSettingsWithHistory, FuelSavingsResponse, FuelSavingsWeeklyResponse
from datetime import date as date_mod, timedelta
import re

router = APIRouter()

FUEL_COLLECTION = 'fuel_settings'


def _get_effective_price(price_history: list, date_str: str, fallback: float) -> float:
    """คืนราคาน้ำมันที่มีผล ณ date_str จาก price_history (เรียงน้อย→มาก)
    ถ้าไม่มี history ใช้ fallback; ถ้า date_str ก่อน entry แรกสุด ใช้ entry แรกสุด"""
    if not price_history:
        return fallback
    applicable = [e for e in price_history if e.get('effective_from', '') <= date_str]
    if not applicable:
        earliest = min(price_history, key=lambda e: e.get('effective_from', '9999'))
        return earliest.get('fuel_price', fallback)
    return max(applicable, key=lambda e: e.get('effective_from', ''))['fuel_price']


# ── Endpoints สำหรับผู้ใช้ทั่วไป (ตัวเอง) ──────────────────────────────────

@router.get("/settings", response_model=FuelSettingsWithHistory)
def get_fuel_settings(current_user: dict = Depends(get_current_user)):
    #? ดึงการตั้งค่าน้ำมันของผู้ใช้จาก Firestore (รวม price_history)
    user_id = current_user.get("user_id")
    db = get_db()
    doc = db.collection(FUEL_COLLECTION).document(user_id).get()
    if not doc.exists:
        return FuelSettingsWithHistory(distance_km=0, fuel_efficiency=0, fuel_price=0, toll_parking=0)
    data = doc.to_dict()
    return FuelSettingsWithHistory(
        distance_km=data.get('distance_km', 0),
        fuel_efficiency=data.get('fuel_efficiency', 0),
        fuel_price=data.get('fuel_price', 0),
        toll_parking=data.get('toll_parking', 0.0),
        price_history=data.get('price_history', []),
    )


@router.put("/settings")
def save_fuel_settings(settings: FuelSettingsUpdate, current_user: dict = Depends(get_current_user)):
    #? บันทึก/อัปเดตการตั้งค่าน้ำมัน พร้อม append ราคาใหม่ลง price_history
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id หายไปจาก token")
    if settings.fuel_efficiency <= 0:
        raise HTTPException(status_code=422, detail="อัตราสิ้นเปลืองน้ำมันต้องมากกว่า 0")

    effective_from = settings.effective_from or date_mod.today().isoformat()

    db = get_db()
    doc_ref = db.collection(FUEL_COLLECTION).document(user_id)
    existing = doc_ref.get()

    #? ดึง price_history เดิม (ถ้ามี)
    price_history = existing.to_dict().get('price_history', []) if existing.exists else []

    #? ถ้ามี entry ที่ effective_from ตรงกันอยู่แล้ว → อัปเดตราคา แทนการสร้างซ้ำ
    updated = False
    for entry in price_history:
        if entry.get('effective_from') == effective_from:
            entry['fuel_price'] = settings.fuel_price
            updated = True
            break
    if not updated:
        price_history.append({'fuel_price': settings.fuel_price, 'effective_from': effective_from})

    #? เรียงตาม effective_from น้อย → มาก
    price_history.sort(key=lambda e: e.get('effective_from', ''))

    doc_ref.set({
        'distance_km': settings.distance_km,
        'fuel_efficiency': settings.fuel_efficiency,
        'fuel_price': settings.fuel_price,
        'toll_parking': settings.toll_parking,
        'price_history': price_history,
    })
    return {"status": "success"}


@router.get("/savings", response_model=FuelSavingsResponse)
def get_fuel_savings(month: str, current_user: dict = Depends(get_current_user)):
    #? คำนวณค่าน้ำมันที่ประหยัดได้จากการ WFH ในเดือนที่ระบุ
    if not re.match(r'^\d{4}-\d{2}$', month):
        raise HTTPException(status_code=400, detail="รูปแบบเดือนไม่ถูกต้อง ใช้ YYYY-MM")

    user_id = current_user.get("user_id")
    db = get_db()

    #? ดึงการตั้งค่าน้ำมันของผู้ใช้
    doc = db.collection(FUEL_COLLECTION).document(user_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="กรุณาบันทึกการตั้งค่าก่อน")
    s = doc.to_dict()
    settings = FuelSettings(
        distance_km=s.get('distance_km', 0),
        fuel_efficiency=s.get('fuel_efficiency', 1),
        fuel_price=s.get('fuel_price', 0),
        toll_parking=s.get('toll_parking', 0.0),
    )

    price_history = s.get('price_history', [])
    fallback_price = s.get('fuel_price', 0)

    #? นับวัน WFH และสะสม monthly_savings ด้วยราคาที่ถูกต้องในแต่ละวัน
    eff = settings.fuel_efficiency if settings.fuel_efficiency > 0 else 1
    wfh_days = 0
    monthly_savings = 0.0
    for report_doc in db.collection('reports').stream():
        r = report_doc.to_dict()
        if r.get('user_id') != user_id:
            continue
        if not r.get('timestamp', '').startswith(month):
            continue
        if r.get('work_mode', '').lower() != 'wfh':
            continue
        wfh_days += 1
        day_date = r.get('timestamp', '')[:10]
        day_price = _get_effective_price(price_history, day_date, fallback_price)
        monthly_savings += (settings.distance_km / eff) * day_price + settings.toll_parking
    monthly_savings = round(monthly_savings, 2)

    #? daily_fuel_cost / daily_total_cost แสดงตามราคาปัจจุบัน (สำหรับ info ในการ์ด)
    current_price = _get_effective_price(price_history, date_mod.today().isoformat(), fallback_price)
    daily_fuel_cost = round((settings.distance_km / eff) * current_price, 2)
    daily_total_cost = round(daily_fuel_cost + settings.toll_parking, 2)

    return FuelSavingsResponse(
        settings=FuelSettings(
            distance_km=settings.distance_km,
            fuel_efficiency=settings.fuel_efficiency,
            fuel_price=current_price,
            toll_parking=settings.toll_parking,
        ),
        wfh_days=wfh_days,
        daily_fuel_cost=daily_fuel_cost,
        daily_total_cost=daily_total_cost,
        monthly_savings=monthly_savings,
        month=month,
    )


@router.get("/savings/weekly", response_model=FuelSavingsWeeklyResponse)
def get_fuel_savings_weekly(week: str, current_user: dict = Depends(get_current_user)):
    #? คำนวณค่าน้ำมันที่ประหยัดได้จากการ WFH ในอาทิตย์ที่ระบุ (week = YYYY-MM-DD วันใดก็ได้ในอาทิตย์)
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', week):
        raise HTTPException(status_code=400, detail="รูปแบบวันที่ไม่ถูกต้อง ใช้ YYYY-MM-DD")

    #? คำนวณวันจันทร์และอาทิตย์ของสัปดาห์ที่ระบุ
    try:
        d = date_mod.fromisoformat(week)
    except ValueError:
        raise HTTPException(status_code=400, detail="วันที่ไม่ถูกต้อง")
    monday = d - timedelta(days=d.weekday())          # weekday(): Mon=0 … Sun=6
    sunday = monday + timedelta(days=6)
    week_dates = {(monday + timedelta(days=i)).isoformat() for i in range(7)}

    user_id = current_user.get("user_id")
    db = get_db()

    #? ดึงการตั้งค่าน้ำมันของผู้ใช้
    doc = db.collection(FUEL_COLLECTION).document(user_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="กรุณาบันทึกการตั้งค่าก่อน")
    s = doc.to_dict()
    settings = FuelSettings(
        distance_km=s.get('distance_km', 0),
        fuel_efficiency=s.get('fuel_efficiency', 1),
        fuel_price=s.get('fuel_price', 0),
        toll_parking=s.get('toll_parking', 0.0),
    )

    price_history = s.get('price_history', [])
    fallback_price = s.get('fuel_price', 0)

    #? ใช้ราคาที่มีผล ณ วันจันทร์ของอาทิตย์นั้น (ราคาเดียวตลอดทั้งอาทิตย์)
    eff = settings.fuel_efficiency if settings.fuel_efficiency > 0 else 1
    week_price = _get_effective_price(price_history, monday.isoformat(), fallback_price)
    daily_fuel_cost = round((settings.distance_km / eff) * week_price, 2)
    daily_total_cost = round(daily_fuel_cost + settings.toll_parking, 2)

    #? นับวัน WFH ในอาทิตย์นั้น (timestamp ขึ้นต้น YYYY-MM-DD)
    wfh_days = 0
    for report_doc in db.collection('reports').stream():
        r = report_doc.to_dict()
        if r.get('user_id') != user_id:
            continue
        if r.get('timestamp', '')[:10] not in week_dates:
            continue
        if r.get('work_mode', '').lower() == 'wfh':
            wfh_days += 1

    weekly_savings = round(daily_total_cost * wfh_days, 2)

    return FuelSavingsWeeklyResponse(
        settings=FuelSettings(
            distance_km=settings.distance_km,
            fuel_efficiency=settings.fuel_efficiency,
            fuel_price=week_price,
            toll_parking=settings.toll_parking,
        ),
        wfh_days=wfh_days,
        daily_fuel_cost=daily_fuel_cost,
        daily_total_cost=daily_total_cost,
        weekly_savings=weekly_savings,
        week_start=monday.isoformat(),
        week_end=sunday.isoformat(),
    )


# ── Endpoint สำหรับ Admin (level 1+) ─────────────────────────────────────────

@router.get("/savings/all")
def get_all_fuel_savings(month: str, authorization: str = Header(None)):
    #? ดึงข้อมูลประหยัดค่าน้ำมันของทุกคน (สำหรับ admin level 1+)
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="ไม่ได้รับอนุญาต")
    token = authorization.removeprefix("Bearer ").strip()
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token ไม่ถูกต้องหรือหมดอายุ")
    level = payload.get("level", 0)
    role = payload.get("role", "").lower()
    if not (level >= 1 or 'admin' in role):
        raise HTTPException(status_code=403, detail="ต้องการสิทธิ์ระดับ Admin")

    if not re.match(r'^\d{4}-\d{2}$', month):
        raise HTTPException(status_code=400, detail="รูปแบบเดือนไม่ถูกต้อง ใช้ YYYY-MM")

    db = get_db()

    #? สร้าง map user_id → ข้อมูลพนักงาน (เฉพาะที่ active: ignore != 1)
    users_map = {}
    for doc in db.collection("users").stream():
        u = doc.to_dict()
        if u.get("ignore", 0) == 1:
            continue
        pid = u.get("personal_id")
        if pid:
            users_map[pid] = {
                "name": f"{u.get('firstname', '')} {u.get('lastname', '')}".strip(),
                "department": u.get("department", ""),
                "position": u.get("position", ""),
            }

    #? นับวัน WFH ต่อ user_id ในเดือนที่ระบุ
    wfh_counts: dict = {}
    for report_doc in db.collection('reports').stream():
        r = report_doc.to_dict()
        if not r.get('timestamp', '').startswith(month):
            continue
        uid = r.get('user_id')
        if uid not in users_map:
            continue
        if r.get('work_mode', '').lower() == 'wfh':
            wfh_counts[uid] = wfh_counts.get(uid, 0) + 1

    #? คำนวณผลต่อคนจาก fuel_settings
    results = []
    for settings_doc in db.collection(FUEL_COLLECTION).stream():
        s = settings_doc.to_dict()
        uid = settings_doc.id
        if uid not in users_map:
            continue
        eff = s.get('fuel_efficiency', 1) or 1
        daily_fuel = round((s.get('distance_km', 0) / eff) * s.get('fuel_price', 0), 2)
        daily_total = round(daily_fuel + s.get('toll_parking', 0.0), 2)
        wfh_days = wfh_counts.get(uid, 0)
        monthly = round(daily_total * wfh_days, 2)
        results.append({
            "user_id": uid,
            "name": users_map[uid]["name"],
            "department": users_map[uid]["department"],
            "position": users_map[uid]["position"],
            "distance_km": s.get('distance_km', 0),
            "fuel_efficiency": eff,
            "fuel_price": s.get('fuel_price', 0),
            "toll_parking": s.get('toll_parking', 0.0),
            "wfh_days": wfh_days,
            "daily_fuel_cost": daily_fuel,
            "daily_total_cost": daily_total,
            "monthly_savings": monthly,
        })

    #? เรียงตาม department แล้ว name
    results.sort(key=lambda x: (x["department"], x["name"]))
    return {"month": month, "users": results}
