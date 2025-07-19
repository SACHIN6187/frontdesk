"""RBAC: prove each role can do exactly what the matrix says, no more."""

import pytest
from httpx import AsyncClient

from frontdesk.models import Role
from frontdesk.rbac import Permission, role_has
from tests.conftest import signup


async def _invite(client: AsyncClient, owner_auth: str, email: str, role: str) -> str:
    resp = await client.post(
        "/api/members",
        headers={"Authorization": owner_auth},
        json={"email": email, "name": email.split("@")[0], "password": "password123", "role": role},
    )
    assert resp.status_code == 201, resp.text
    login = await client.post(
        "/api/auth/login-json", json={"email": email, "password": "password123"}
    )
    return f"Bearer {login.json()['access_token']}"


def test_matrix_shape() -> None:
    # Owner has all permissions; viewer cannot write tickets; agent cannot manage members.
    assert all(role_has(Role.owner, p) for p in Permission)
    assert not role_has(Role.viewer, Permission.ticket_write)
    assert not role_has(Role.agent, Permission.member_manage)
    assert not role_has(Role.agent, Permission.ticket_delete)
    assert role_has(Role.agent, Permission.comment_write)


@pytest.mark.parametrize(
    ("role", "can_create", "can_delete", "can_invite"),
    [
        ("agent", True, False, False),
        ("viewer", False, False, False),
    ],
)
async def test_role_enforcement(
    client: AsyncClient, role: str, can_create: bool, can_delete: bool, can_invite: bool
) -> None:
    owner = await signup(client, "Acme", f"owner-{role}@acme.io")
    member_auth = await _invite(client, owner["auth"], f"{role}@acme.io", role)

    # Owner makes a ticket the member might try to delete.
    made = await client.post(
        "/api/tickets",
        headers={"Authorization": owner["auth"]},
        json={"subject": "seed", "body": "", "requester_email": "r@x.io"},
    )
    ticket_id = made.json()["id"]

    # Create.
    create = await client.post(
        "/api/tickets",
        headers={"Authorization": member_auth},
        json={"subject": "by-member", "body": "", "requester_email": "r@x.io"},
    )
    assert (create.status_code == 201) == can_create
    if not can_create:
        assert create.status_code == 403

    # Delete.
    delete = await client.delete(
        f"/api/tickets/{ticket_id}", headers={"Authorization": member_auth}
    )
    assert (delete.status_code == 204) == can_delete
    if not can_delete:
        assert delete.status_code == 403

    # Invite.
    invite = await client.post(
        "/api/members",
        headers={"Authorization": member_auth},
        json={"email": "x@acme.io", "name": "X", "password": "password123", "role": "viewer"},
    )
    assert (invite.status_code == 201) == can_invite
    if not can_invite:
        assert invite.status_code == 403

    # Everyone can read tickets.
    assert (
        await client.get("/api/tickets", headers={"Authorization": member_auth})
    ).status_code == 200


async def test_cannot_demote_last_owner(client: AsyncClient) -> None:
    owner = await signup(client, "Acme", "solo-owner@acme.io")
    # Find own user id via members list.
    members = await client.get("/api/members", headers={"Authorization": owner["auth"]})
    uid = members.json()[0]["user_id"]
    resp = await client.patch(
        f"/api/members/{uid}", headers={"Authorization": owner["auth"]}, json={"role": "agent"}
    )
    assert resp.status_code == 409
