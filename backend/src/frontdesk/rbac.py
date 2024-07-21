"""Role-based access control as one explicit matrix.

Every protected route depends on `require(Permission.X)`. Adding a permission means
editing the matrix here, in one place — never scattering role checks across routers.
"""

from __future__ import annotations

import enum

from fastapi import Depends, HTTPException, status

from .deps import current_membership
from .models import Membership, Role


class Permission(str, enum.Enum):
    ticket_read = "ticket:read"
    ticket_write = "ticket:write"
    ticket_delete = "ticket:delete"
    comment_write = "comment:write"
    member_read = "member:read"
    member_manage = "member:manage"
    billing_read = "billing:read"
    billing_manage = "billing:manage"


# The matrix. Read it top to bottom to audit exactly what each role can do.
_MATRIX: dict[Role, set[Permission]] = {
    Role.owner: set(Permission),  # owner can do everything
    Role.agent: {
        Permission.ticket_read,
        Permission.ticket_write,
        Permission.comment_write,
        Permission.member_read,
        Permission.billing_read,
    },
    Role.viewer: {
        Permission.ticket_read,
        Permission.member_read,
        Permission.billing_read,
    },
}


def role_has(role: Role, perm: Permission) -> bool:
    return perm in _MATRIX[role]


def require(perm: Permission):  # type: ignore[no-untyped-def]
    """FastAPI dependency factory: 403 unless the caller's role grants `perm`."""

    async def _dep(membership: Membership = Depends(current_membership)) -> Membership:  # noqa: B008
        if not role_has(membership.role, perm):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"role '{membership.role.value}' lacks permission '{perm.value}'",
            )
        return membership

    return _dep
