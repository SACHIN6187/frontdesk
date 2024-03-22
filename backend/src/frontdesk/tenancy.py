"""Central tenant scoping.

`scoped(stmt, membership)` appends an `org_id == membership.org_id` filter to any
select over a tenant-owned model, so no router can accidentally leak cross-org rows.
Fetch-by-id goes through `get_scoped`, which returns None if the row belongs to
another org — callers turn that into a 404, never revealing existence.
"""

from __future__ import annotations

from typing import TypeVar

from sqlalchemy import Select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Membership, Ticket, TicketComment

# Models that carry an org_id and must always be scoped.
TenantModel = TypeVar("TenantModel", Ticket, TicketComment)


def scoped(stmt: Select[tuple[TenantModel]], membership: Membership) -> Select[tuple[TenantModel]]:
    entity = stmt.column_descriptions[0]["entity"]
    return stmt.where(entity.org_id == membership.org_id)


async def get_scoped(
    db: AsyncSession,
    model: type[TenantModel],
    obj_id: str,
    membership: Membership,
) -> TenantModel | None:
    obj = await db.get(model, obj_id)
    if obj is None or obj.org_id != membership.org_id:
        return None
    return obj
