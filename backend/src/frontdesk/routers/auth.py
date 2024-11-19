"""Signup (creates an org + owner + a free subscription) and login."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import current_membership, current_user
from ..models import Membership, Org, Plan, Role, Subscription, User
from ..schemas import LoginIn, SignupIn, TokenOut, UserOut
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupIn, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenOut:
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")

    org = Org(name=payload.org_name)
    user = User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
    )
    db.add_all([org, user])
    await db.flush()

    membership = Membership(org_id=org.id, user_id=user.id, role=Role.owner)
    sub = Subscription(org_id=org.id, plan=Plan.free, status="active", seats=1)
    db.add_all([membership, sub])
    await db.commit()

    token = create_access_token(user.id, org.id)
    return TokenOut(access_token=token, org_id=org.id, role=Role.owner)


@router.post("/login", response_model=TokenOut)
async def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenOut:
    result = await db.execute(select(User).where(User.email == form.username))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")

    # Pick the user's first membership as the active org (single-org users are the norm).
    mres = await db.execute(select(Membership).where(Membership.user_id == user.id))
    membership = mres.scalars().first()
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "user has no org")

    token = create_access_token(user.id, membership.org_id)
    return TokenOut(access_token=token, org_id=membership.org_id, role=membership.role)


@router.post("/login-json", response_model=TokenOut)
async def login_json(payload: LoginIn, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenOut:
    """JSON variant of login for the SPA (the form variant powers OAuth2 tooling)."""
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    mres = await db.execute(select(Membership).where(Membership.user_id == user.id))
    membership = mres.scalars().first()
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "user has no org")
    token = create_access_token(user.id, membership.org_id)
    return TokenOut(access_token=token, org_id=membership.org_id, role=membership.role)


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(current_user)]) -> User:
    return user


@router.get("/context")
async def context(membership: Annotated[Membership, Depends(current_membership)]) -> dict[str, str]:
    return {"org_id": membership.org_id, "role": membership.role.value}
