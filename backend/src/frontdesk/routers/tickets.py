"""Ticket CRUD + comments, all tenant-scoped, with live WS broadcasts on change."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..events import broadcast
from ..models import Membership, Ticket, TicketComment
from ..rbac import Permission, require
from ..schemas import CommentIn, CommentOut, TicketIn, TicketOut, TicketUpdateIn
from ..tenancy import get_scoped, scoped

router = APIRouter(prefix="/api/tickets", tags=["tickets"])


@router.get("", response_model=list[TicketOut])
async def list_tickets(
    db: Annotated[AsyncSession, Depends(get_db)],
    membership: Annotated[Membership, Depends(require(Permission.ticket_read))],
) -> list[Ticket]:
    stmt = scoped(select(Ticket), membership).order_by(Ticket.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    payload: TicketIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    membership: Annotated[Membership, Depends(require(Permission.ticket_write))],
) -> Ticket:
    ticket = Ticket(
        org_id=membership.org_id,
        subject=payload.subject,
        body=payload.body,
        requester_email=payload.requester_email,
        created_by=membership.user_id,
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    await broadcast(
        membership.org_id,
        {
            "type": "ticket.created",
            "id": ticket.id,
            "subject": ticket.subject,
            "status": ticket.status.value,
        },
    )
    return ticket


@router.get("/{ticket_id}", response_model=TicketOut)
async def get_ticket(
    ticket_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    membership: Annotated[Membership, Depends(require(Permission.ticket_read))],
) -> Ticket:
    ticket = await get_scoped(db, Ticket, ticket_id, membership)
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")
    return ticket


@router.patch("/{ticket_id}", response_model=TicketOut)
async def update_ticket(
    ticket_id: str,
    payload: TicketUpdateIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    membership: Annotated[Membership, Depends(require(Permission.ticket_write))],
) -> Ticket:
    ticket = await get_scoped(db, Ticket, ticket_id, membership)
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(ticket, field, value)
    await db.commit()
    await db.refresh(ticket)
    await broadcast(
        membership.org_id,
        {"type": "ticket.updated", "id": ticket.id, "status": ticket.status.value},
    )
    return ticket


@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ticket(
    ticket_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    membership: Annotated[Membership, Depends(require(Permission.ticket_delete))],
) -> None:
    ticket = await get_scoped(db, Ticket, ticket_id, membership)
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")
    await db.delete(ticket)
    await db.commit()
    await broadcast(membership.org_id, {"type": "ticket.deleted", "id": ticket_id})


@router.get("/{ticket_id}/comments", response_model=list[CommentOut])
async def list_comments(
    ticket_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    membership: Annotated[Membership, Depends(require(Permission.ticket_read))],
) -> list[TicketComment]:
    ticket = await get_scoped(db, Ticket, ticket_id, membership)
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")
    stmt = (
        scoped(select(TicketComment), membership)
        .where(TicketComment.ticket_id == ticket_id)
        .order_by(TicketComment.created_at.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post(
    "/{ticket_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED
)
async def add_comment(
    ticket_id: str,
    payload: CommentIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    membership: Annotated[Membership, Depends(require(Permission.comment_write))],
) -> TicketComment:
    ticket = await get_scoped(db, Ticket, ticket_id, membership)
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")
    comment = TicketComment(
        org_id=membership.org_id,
        ticket_id=ticket_id,
        author_id=membership.user_id,
        body=payload.body,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    await broadcast(
        membership.org_id, {"type": "comment.created", "ticket_id": ticket_id, "id": comment.id}
    )
    return comment
