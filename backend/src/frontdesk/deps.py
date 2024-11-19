"""FastAPI dependencies: resolve the caller's user + org membership from the JWT."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .models import Membership, User
from .security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

_CREDS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


async def current_claims(token: Annotated[str | None, Depends(oauth2_scheme)]) -> dict[str, str]:
    if not token:
        raise _CREDS_EXC
    claims = decode_token(token)
    if not claims or "sub" not in claims or "org" not in claims:
        raise _CREDS_EXC
    return {"sub": str(claims["sub"]), "org": str(claims["org"])}


async def current_user(
    claims: Annotated[dict[str, str], Depends(current_claims)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    user = await db.get(User, claims["sub"])
    if user is None:
        raise _CREDS_EXC
    return user


async def current_membership(
    claims: Annotated[dict[str, str], Depends(current_claims)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Membership:
    """The caller's membership in the org named by the token. This is the tenancy anchor:
    if the user has no membership in that org, they are treated as unauthenticated."""
    result = await db.execute(
        select(Membership).where(
            Membership.user_id == claims["sub"],
            Membership.org_id == claims["org"],
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise _CREDS_EXC
    return membership
