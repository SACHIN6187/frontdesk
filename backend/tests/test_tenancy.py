"""The isolation proof: org A can never see or touch org B's data."""

from httpx import AsyncClient

from tests.conftest import signup


async def test_ticket_isolation_between_orgs(client: AsyncClient) -> None:
    a = await signup(client, "Acme", "a@acme.io")
    b = await signup(client, "Beta", "b@beta.io")
    ha = {"Authorization": a["auth"]}
    hb = {"Authorization": b["auth"]}

    # Org A creates a ticket.
    created = await client.post(
        "/api/tickets",
        headers=ha,
        json={"subject": "A secret", "body": "confidential", "requester_email": "c@x.io"},
    )
    assert created.status_code == 201
    ticket_id = created.json()["id"]

    # Org B's list is empty; it never sees A's ticket.
    b_list = await client.get("/api/tickets", headers=hb)
    assert b_list.status_code == 200
    assert b_list.json() == []

    # Org B cannot fetch A's ticket by id — 404, not 403 (existence not revealed).
    b_get = await client.get(f"/api/tickets/{ticket_id}", headers=hb)
    assert b_get.status_code == 404

    # Org B cannot modify or delete A's ticket.
    b_patch = await client.patch(f"/api/tickets/{ticket_id}", headers=hb, json={"status": "closed"})
    assert b_patch.status_code == 404
    b_del = await client.delete(f"/api/tickets/{ticket_id}", headers=hb)
    assert b_del.status_code == 404

    # Org A still sees its ticket intact and open.
    a_get = await client.get(f"/api/tickets/{ticket_id}", headers=ha)
    assert a_get.status_code == 200
    assert a_get.json()["status"] == "open"


async def test_comment_isolation(client: AsyncClient) -> None:
    a = await signup(client, "Acme", "a2@acme.io")
    b = await signup(client, "Beta", "b2@beta.io")
    ticket = await client.post(
        "/api/tickets",
        headers={"Authorization": a["auth"]},
        json={"subject": "T", "body": "", "requester_email": "r@x.io"},
    )
    tid = ticket.json()["id"]
    # B cannot list or add comments on A's ticket.
    assert (
        await client.get(f"/api/tickets/{tid}/comments", headers={"Authorization": b["auth"]})
    ).status_code == 404
    assert (
        await client.post(
            f"/api/tickets/{tid}/comments",
            headers={"Authorization": b["auth"]},
            json={"body": "intrusion"},
        )
    ).status_code == 404


async def test_members_isolation(client: AsyncClient) -> None:
    a = await signup(client, "Acme", "a3@acme.io")
    b = await signup(client, "Beta", "b3@beta.io")
    a_members = await client.get("/api/members", headers={"Authorization": a["auth"]})
    b_members = await client.get("/api/members", headers={"Authorization": b["auth"]})
    a_emails = {m["email"] for m in a_members.json()}
    b_emails = {m["email"] for m in b_members.json()}
    assert a_emails == {"a3@acme.io"}
    assert b_emails == {"b3@beta.io"}
    assert a_emails.isdisjoint(b_emails)
