from httpx import AsyncClient

from tests.conftest import signup


async def test_signup_creates_owner_and_free_sub(client: AsyncClient) -> None:
    a = await signup(client, "Acme", "owner@acme.io")
    ctx = await client.get("/api/auth/context", headers={"Authorization": a["auth"]})
    assert ctx.status_code == 200
    assert ctx.json() == {"org_id": a["org_id"], "role": "owner"}

    bill = await client.get("/api/billing", headers={"Authorization": a["auth"]})
    assert bill.status_code == 200
    body = bill.json()
    assert body["plan"] == "free"
    assert body["seat_limit"] == 3


async def test_duplicate_email_rejected(client: AsyncClient) -> None:
    await signup(client, "Acme", "dup@acme.io")
    resp = await client.post(
        "/api/auth/signup",
        json={"org_name": "Other", "name": "X", "email": "dup@acme.io", "password": "password123"},
    )
    assert resp.status_code == 409


async def test_login_json_and_bad_password(client: AsyncClient) -> None:
    await signup(client, "Acme", "login@acme.io")
    ok = await client.post(
        "/api/auth/login-json", json={"email": "login@acme.io", "password": "password123"}
    )
    assert ok.status_code == 200
    assert ok.json()["role"] == "owner"

    bad = await client.post(
        "/api/auth/login-json", json={"email": "login@acme.io", "password": "wrong"}
    )
    assert bad.status_code == 401


async def test_unauthenticated_is_401(client: AsyncClient) -> None:
    resp = await client.get("/api/tickets")
    assert resp.status_code == 401
