from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.database import get_supabase

router = APIRouter()


class SignUpRequest(BaseModel):
    email: str
    password: str
    full_name: str


class SignInRequest(BaseModel):
    email: str
    password: str


@router.post("/signup")
async def sign_up(payload: SignUpRequest):
    db = get_supabase()
    try:
        res = db.auth.sign_up({
            "email": payload.email,
            "password": payload.password,
            "options": {"data": {"full_name": payload.full_name}},
        })
        return {"user": res.user, "session": res.session}
    except Exception as e:
        raise HTTPException(400, str(e))


@router.post("/signin")
async def sign_in(payload: SignInRequest):
    db = get_supabase()
    try:
        res = db.auth.sign_in_with_password({
            "email": payload.email,
            "password": payload.password,
        })
        return {"user": res.user, "session": res.session}
    except Exception as e:
        raise HTTPException(401, str(e))


@router.post("/signout")
async def sign_out(access_token: str):
    db = get_supabase()
    db.auth.sign_out()
    return {"message": "Signed out"}
