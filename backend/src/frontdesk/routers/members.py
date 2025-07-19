"""Org member management: list, invite (seat-limited), change role, remove."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..billing import seat_limit_for
from ..db import get_db
from ..deps import current_membership
from ..models import Membership, Role, Subscription, User
from ..rbac import Permission, require
from ..schemas import InviteIn, MemberOut, RoleUpdateIn
from ..security import hash_password

router = APIRouter(prefix="/api/members", tags=["members"])


async def _members(db: AsyncSession, org_id: str) -> list[MemberOut]:
    result = await db.execute(
        select(Membership, User)
        .join(User, User.id == Membership.user_id)
        .where(Membership.org_id == org_id)
    )
    return [
        MemberOut(user_id=u.id, email=u.email, name=u.name, role=m.role) for m, u in result.all()
    ]


@router.get("", response_model=list[MemberOut])
async def list_members(
    db: Annotated[AsyncSession, Depends(get_db)],
    membership: Annotated[Membership, Depends(require(Permission.member_read))],
) -> list[MemberOut]:
    return await _members(db, membership.org_id)


@router.post("", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def invite_member(
    payload: InviteIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    membership: Annotated[Membership, Depends(require(Permission.member_manage))],
) -> MemberOut:
    # Seat enforcement: current members must stay within the plan's limit.
    sub = (
        await db.execute(select(Subscription).where(Subscription.org_id == membership.org_id))
    ).scalar_one()
    current = (
        (await db.execute(select(Membership).where(Membership.org_id == membership.org_id)))
        .scalars()
        .all()
    )
    limit = seat_limit_for(sub.plan)
    if len(current) >= limit:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"seat limit reached for plan '{sub.plan.value}' ({limit}); upgrade to add members",
        )

    # Reuse an existing user by email, else create one.
    user = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if user is None:
        user = User(
            email=payload.email, name=payload.name, password_hash=hash_password(payload.password)
        )
        db.add(user)
        await db.flush()

    already = (
        await db.execute(
            select(Membership).where(
                Membership.org_id == membership.org_id, Membership.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if already is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "user already a member")

    new_membership = Membership(org_id=membership.org_id, user_id=user.id, role=payload.role)
    db.add(new_membership)
    sub.seats = len(current) + 1
    await db.commit()
    return MemberOut(user_id=user.id, email=user.email, name=user.name, role=payload.role)


@router.patch("/{user_id}", response_model=MemberOut)
async def change_role(
    user_id: str,
    payload: RoleUpdateIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    membership: Annotated[Membership, Depends(require(Permission.member_manage))],
) -> MemberOut:
    target = (
        await db.execute(
            select(Membership).where(
                Membership.org_id == membership.org_id, Membership.user_id == user_id
            )
        )
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member not found")

    # Guard: never leave an org with zero owners.
    if target.role == Role.owner and payload.role != Role.owner:
        owners = (
            (
                await db.execute(
                    select(Membership).where(
                        Membership.org_id == membership.org_id, Membership.role == Role.owner
                    )
                )
            )
            .scalars()
            .all()
        )
        if len(owners) <= 1:
            raise HTTPException(status.HTTP_409_CONFLICT, "cannot demote the last owner")

    target.role = payload.role
    await db.commit()
    user = await db.get(User, user_id)
    assert user is not None
    return MemberOut(user_id=user.id, email=user.email, name=user.name, role=payload.role)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    user_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    membership: Annotated[Membership, Depends(require(Permission.member_manage))],
    caller: Annotated[Membership, Depends(current_membership)],
) -> None:
    if user_id == caller.user_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "cannot remove yourself")
    target = (
        await db.execute(
            select(Membership).where(
                Membership.org_id == membership.org_id, Membership.user_id == user_id
            )
        )
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member not found")
    await db.delete(target)
    sub = (
        await db.execute(select(Subscription).where(Subscription.org_id == membership.org_id))
    ).scalar_one()
    sub.seats = max(0, sub.seats - 1)
    await db.commit()
