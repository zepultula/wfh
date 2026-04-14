from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class UserInfo(BaseModel):
    user_id: str
    email: str
    name: str
    role: str
    department: str
    agency: str
    level: int

class LoginRequest(BaseModel):
    email: str
    password: str

class TaskModel(BaseModel):
    id: int
    title: str
    description: Optional[str] = ""
    status: str # 'done', 'prog', 'pend'

class ReportBase(BaseModel):
    user_id: str
    name: str
    role: str
    department: str
    work_mode: str # 'wfh', 'onsite', 'hybrid'
    progress: int
    problems: str
    plan_tomorrow: str
    tasks: List[TaskModel]
    
class ReportCreate(ReportBase):
    pass

class CommentCreate(BaseModel):
    author_id: str
    author_name: str
    author_role: str
    avatar_color: str
    author_initials: str
    message: str
    tag: Optional[str] = ""

class CommentModel(CommentCreate):
    id: str
    timestamp: str

class ReportOut(ReportBase):
    id: str
    timestamp: str
    submit_time: str
    comments: List[CommentModel] = []
