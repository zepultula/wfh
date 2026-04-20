import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import Request

#? พยายาม import user_agents — ถ้าไม่ได้ติดตั้ง จะ fallback แบบ raw string parse
try:
    from user_agents import parse as ua_parse
    _UA_LIB = True
except ImportError:
    _UA_LIB = False

BKK_TZ = ZoneInfo("Asia/Bangkok")

# --- ค่าคงที่ประเภท action ---
class LogAction:
    # AUTH
    LOGIN_SUCCESS    = "LOGIN_SUCCESS"
    LOGIN_FAIL       = "LOGIN_FAIL"
    LOGOUT           = "LOGOUT"
    PASSWORD_CHANGE  = "PASSWORD_CHANGE"
    # REPORT
    REPORT_SUBMIT       = "REPORT_SUBMIT"
    REPORT_VIEW         = "REPORT_VIEW"
    REPORT_TASK_UPDATE  = "REPORT_TASK_UPDATE"
    REPORT_COMMENT_ADD  = "REPORT_COMMENT_ADD"
    # PLAN
    PLAN_SAVE    = "PLAN_SAVE"
    PLAN_VIEW    = "PLAN_VIEW"
    PLAN_APPROVE = "PLAN_APPROVE"
    PLAN_REJECT  = "PLAN_REJECT"
    PLAN_EXPORT  = "PLAN_EXPORT"
    # STATS
    STATS_VIEW    = "STATS_VIEW"
    STATS_EXPORT  = "STATS_EXPORT"
    REPORT_EXPORT = "REPORT_EXPORT"
    # USER_MGMT
    USER_CREATE = "USER_CREATE"
    USER_UPDATE = "USER_UPDATE"
    USER_DELETE = "USER_DELETE"
    USER_TOGGLE = "USER_TOGGLE"
    # EVALUATION
    EVALUATION_UPDATE = "EVALUATION_UPDATE"
    # ANNOUNCEMENT
    ANN_CREATE = "ANN_CREATE"
    ANN_UPDATE = "ANN_UPDATE"
    ANN_DELETE = "ANN_DELETE"
    ANN_TOGGLE = "ANN_TOGGLE"
    # FUEL
    FUEL_SETTINGS_UPDATE = "FUEL_SETTINGS_UPDATE"
    FUEL_VIEW_SAVINGS    = "FUEL_VIEW_SAVINGS"
    # FILE
    FILE_UPLOAD = "FILE_UPLOAD"
    FILE_DELETE = "FILE_DELETE"

# --- หมวดหมู่ของแต่ละ action ---
_ACTION_CATEGORY = {
    "LOGIN_SUCCESS": "AUTH", "LOGIN_FAIL": "AUTH",
    "LOGOUT": "AUTH", "PASSWORD_CHANGE": "AUTH",
    "REPORT_SUBMIT": "REPORT", "REPORT_VIEW": "REPORT",
    "REPORT_TASK_UPDATE": "REPORT", "REPORT_COMMENT_ADD": "REPORT",
    "PLAN_SAVE": "PLAN", "PLAN_VIEW": "PLAN",
    "PLAN_APPROVE": "PLAN", "PLAN_REJECT": "PLAN", "PLAN_EXPORT": "PLAN",
    "STATS_VIEW": "STATS", "STATS_EXPORT": "STATS", "REPORT_EXPORT": "STATS",
    "USER_CREATE": "USER_MGMT", "USER_UPDATE": "USER_MGMT",
    "USER_DELETE": "USER_MGMT", "USER_TOGGLE": "USER_MGMT",
    "EVALUATION_UPDATE": "EVALUATION",
    "ANN_CREATE": "ANNOUNCEMENT", "ANN_UPDATE": "ANNOUNCEMENT",
    "ANN_DELETE": "ANNOUNCEMENT", "ANN_TOGGLE": "ANNOUNCEMENT",
    "FUEL_SETTINGS_UPDATE": "FUEL", "FUEL_VIEW_SAVINGS": "FUEL",
    "FILE_UPLOAD": "FILE", "FILE_DELETE": "FILE",
}


def _parse_ua(ua_string: str) -> tuple[str, str]:
    """คืนค่า (browser, device_type) จาก User-Agent string"""
    if not ua_string:
        return "Unknown", "desktop"

    if _UA_LIB:
        ua = ua_parse(ua_string)
        browser = ua.browser.family
        ver = ua.browser.version_string
        if ver:
            browser = f"{browser} {ver}"
        if ua.is_mobile:
            device = "mobile"
        elif ua.is_tablet:
            device = "tablet"
        else:
            device = "desktop"
        return browser, device

    #? fallback: ตรวจสอบจาก keyword ใน UA string แบบง่าย
    ua_lower = ua_string.lower()
    if "mobile" in ua_lower or "android" in ua_lower or "iphone" in ua_lower:
        device = "mobile"
    elif "ipad" in ua_lower or "tablet" in ua_lower:
        device = "tablet"
    else:
        device = "desktop"

    for name in ("Chrome", "Firefox", "Safari", "Edge", "OPR", "Opera"):
        if name.lower() in ua_lower:
            return name, device
    return "Unknown", device


async def _write_log(db, entry: dict):
    """เขียน log entry ลง Firestore collection activity_logs"""
    try:
        db.collection("activity_logs").add(entry)
    except Exception:
        pass  #! ไม่ให้ logging error กระทบ main flow


def log_activity(
    db,
    *,
    action: str,
    request: Request | None = None,
    user: dict | None = None,
    #? ข้อมูล user สำหรับกรณีที่ยังไม่มี JWT (เช่น login)
    user_id: str = "",
    user_name: str = "",
    user_level: int = 0,
    resource_id: str | None = None,
    resource_type: str | None = None,
    details: dict | None = None,
    success: bool = True,
):
    """
    บันทึก activity log — fire-and-forget (ไม่ await ใน caller)
    ใช้ asyncio.create_task() เพื่อไม่ block response
    """
    #? ดึงข้อมูล user จาก JWT dict ถ้ามี
    if user:
        user_id   = user.get("user_id", "") or user_id
        user_name = user.get("name", "")    or user_name
        user_level = user.get("level", 0)  if user.get("level") is not None else user_level

    #? parse browser + device_type จาก User-Agent header
    ua_string = ""
    ip = None
    if request:
        ua_string = request.headers.get("user-agent", "")
        ip = request.client.host if request.client else None
    browser, device_type = _parse_ua(ua_string)

    entry = {
        "timestamp":    datetime.now(BKK_TZ).isoformat(),
        "user_id":      user_id,
        "user_name":    user_name,
        "user_level":   user_level,
        "action":       action,
        "category":     _ACTION_CATEGORY.get(action, "OTHER"),
        "resource_id":  resource_id,
        "resource_type": resource_type,
        "details":      details or {},
        "success":      success,
        "ip":           ip,
        "browser":      browser,
        "device_type":  device_type,
    }

    #? ใช้ asyncio.create_task ให้ทำงาน background ไม่ block response
    try:
        loop = asyncio.get_event_loop()
        loop.create_task(_write_log(db, entry))
    except RuntimeError:
        #? fallback ถ้าไม่อยู่ใน async context
        asyncio.run(_write_log(db, entry))
