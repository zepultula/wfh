from fastapi import APIRouter, HTTPException, Header
from database import get_db
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()


def _require_super_admin(authorization: str):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    email = authorization.replace("Bearer ", "")
    db = get_db()
    doc = db.collection("users").document(email).get()
    if not doc.exists:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = doc.to_dict()
    level = user.get("level", 0)
    role = user.get("role", "").lower()
    if not (level == 9 or 'admin' in role):
        raise HTTPException(status_code=403, detail="Forbidden: super admin only")
    return db


class UserCreate(BaseModel):
    personal_id: str
    firstname: str
    lastname: str
    email: str
    position: str = ""
    department: str = ""
    agency: str = ""
    level: int = 0
    role: str = "employee"
    password: str
    ignore: int = 0


class UserUpdate(BaseModel):
    personal_id: Optional[str] = None
    firstname: Optional[str] = None
    lastname: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    agency: Optional[str] = None
    level: Optional[int] = None
    role: Optional[str] = None
    password: Optional[str] = None
    ignore: Optional[int] = None


@router.get("/users")
def list_all_users(authorization: str = Header(None)):
    db = _require_super_admin(authorization)
    result = []
    for doc in db.collection("users").stream():
        u = doc.to_dict()
        u.setdefault('ignore', 0)
        result.append(u)
    result.sort(key=lambda x: (x.get('department', ''), x.get('firstname', '')))
    return result


@router.post("/users", status_code=201)
def create_user(user: UserCreate, authorization: str = Header(None)):
    db = _require_super_admin(authorization)
    email = user.email
    if db.collection("users").document(email).get().exists:
        raise HTTPException(status_code=409, detail="Email นี้มีอยู่ในระบบแล้ว")
    user_dict = user.model_dump()
    db.collection("users").document(email).set(user_dict)
    return {"success": True, "email": email}


@router.put("/users/{email:path}")
def update_user(email: str, update: UserUpdate, authorization: str = Header(None)):
    db = _require_super_admin(authorization)
    doc_ref = db.collection("users").document(email)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="User not found")
    update_data = update.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    doc_ref.update(update_data)
    return {"success": True}


@router.delete("/users/{email:path}")
def delete_user(email: str, authorization: str = Header(None)):
    db = _require_super_admin(authorization)
    doc_ref = db.collection("users").document(email)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="User not found")
    doc_ref.delete()
    return {"success": True}


class EvaluationUpdate(BaseModel):
    evaluator_ids: List[str]


@router.get("/evaluations")
def list_evaluations(authorization: str = Header(None)):
    """Get all users with their evaluators (join from evaluations collection)"""
    db = _require_super_admin(authorization)

    users_by_pid = {}
    for doc in db.collection("users").stream():
        u = doc.to_dict()
        pid = u.get("personal_id")
        if pid:
            users_by_pid[pid] = {
                "personal_id": pid,
                "name": f"{u.get('firstname','')} {u.get('lastname','')}".strip(),
                "position": u.get("position", ""),
                "department": u.get("department", ""),
                "level": u.get("level", 0),
                "ignore": u.get("ignore", 0),
            }

    eval_map = {}
    for doc in db.collection("evaluations").stream():
        d = doc.to_dict()
        target_id = d.get("target_id", doc.id)
        evaluator_list = []
        for ev in sorted(d.get("evaluators", []), key=lambda x: x.get("order", 0)):
            ev_id = ev.get("evaluator_id")
            ev_info = users_by_pid.get(ev_id, {"name": ev_id, "position": "", "department": ""})
            evaluator_list.append({
                "evaluator_id": ev_id,
                "name": ev_info["name"],
                "position": ev_info["position"],
                "department": ev_info["department"],
            })
        eval_map[target_id] = evaluator_list

    all_users_list = list(users_by_pid.values())
    all_users_list.sort(key=lambda x: (x.get("department", ""), x.get("name", "")))

    evaluations = []
    for pid, u in users_by_pid.items():
        evaluations.append({
            "target_id": pid,
            "target_name": u["name"],
            "target_department": u["department"],
            "target_position": u["position"],
            "target_level": u["level"],
            "target_ignore": u["ignore"],
            "evaluators": eval_map.get(pid, []),
        })
    evaluations.sort(key=lambda x: (x.get("target_department", ""), x.get("target_name", "")))

    return {"users": all_users_list, "evaluations": evaluations}


@router.put("/evaluations/{target_id}")
def update_evaluation(target_id: str, update: EvaluationUpdate, authorization: str = Header(None)):
    """Create/update evaluators for a target (replaces the full list)"""
    db = _require_super_admin(authorization)
    doc_ref = db.collection("evaluations").document(target_id)
    evaluators = [{"evaluator_id": pid, "order": i + 1} for i, pid in enumerate(update.evaluator_ids)]
    doc_ref.set({
        "target_id": target_id,
        "evaluators": evaluators,
        "evaluator_ids": update.evaluator_ids,
    })
    return {"success": True}


@router.post("/migrate/ignore")
def migrate_ignore(authorization: str = Header(None)):
    """เพิ่ม ignore=0 ให้ผู้ใช้ที่ยังไม่มี field นี้"""
    db = _require_super_admin(authorization)
    count = 0
    for doc in db.collection("users").stream():
        if 'ignore' not in doc.to_dict():
            doc.reference.update({'ignore': 0})
            count += 1
    return {"updated": count}


@router.post("/migrate/evaluator-ids")
def migrate_evaluator_ids(authorization: str = Header(None)):
    """เพิ่ม evaluator_ids (flat array) ให้ evaluation documents ที่ยังไม่มี field นี้"""
    db = _require_super_admin(authorization)
    count = 0
    for doc in db.collection("evaluations").stream():
        d = doc.to_dict()
        if 'evaluator_ids' not in d:
            ids = [ev['evaluator_id'] for ev in d.get('evaluators', [])]
            doc.reference.update({'evaluator_ids': ids})
            count += 1
    return {"updated": count}
