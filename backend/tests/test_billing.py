"""Billing: seat limits, and the webhook that reconciles plan/status from Stripe events.

Stripe API calls (upgrade path) are exercised in `test_stripe_mock.py`, which is
skipped unless stripe-mock is reachable. Here we test our own state machine directly,
which needs no external service.
"""

from httpx import AsyncClient
from sqlalchemy import select

from frontdesk.db import get_sessionmaker
from frontdesk.models import Plan, Subscription
from tests.conftest import signup


async def _set_stripe_sub(org_id: str, stripe_sub_id: str) -> None:
    async with get_sessionmaker()() as s:
        sub = (
            await s.execute(select(Subscription).where(Subscription.org_id == org_id))
        ).scalar_one()
        sub.stripe_subscription_id = stripe_sub_id
        await s.commit()


async def test_free_seat_limit_blocks_fourth_member(client: AsyncClient) -> None:
    owner = await signup(client, "Acme", "owner@seat.io")
    # Free limit is 3 (owner already counts as 1). Invite 2 more => ok, 3rd => 402.
    for i in range(2):
        resp = await client.post(
            "/api/members",
            headers={"Authorization": owner["auth"]},
            json={
                "email": f"m{i}@seat.io",
                "name": f"M{i}",
                "password": "password123",
                "role": "agent",
            },
        )
        assert resp.status_code == 201, resp.text
    over = await client.post(
        "/api/members",
        headers={"Authorization": owner["auth"]},
        json={"email": "m3@seat.io", "name": "M3", "password": "password123", "role": "agent"},
    )
    assert over.status_code == 402
    assert "seat limit" in over.json()["detail"]


async def test_webhook_activates_and_cancels(client: AsyncClient) -> None:
    owner = await signup(client, "Acme", "owner@wh.io")
    await _set_stripe_sub(owner["org_id"], "sub_test_123")

    # subscription.updated with active status => plan becomes pro.
    up = await client.post(
        "/api/billing/webhook",
        json={
            "type": "customer.subscription.updated",
            "data": {"object": {"id": "sub_test_123", "status": "active"}},
        },
    )
    assert up.status_code == 200 and up.json()["status"] == "ok"
    bill = await client.get("/api/billing", headers={"Authorization": owner["auth"]})
    assert bill.json()["plan"] == "pro"
    assert bill.json()["seat_limit"] == 50

    # subscription.deleted => back to free.
    down = await client.post(
        "/api/billing/webhook",
        json={
            "type": "customer.subscription.deleted",
            "data": {"object": {"id": "sub_test_123", "status": "canceled"}},
        },
    )
    assert down.status_code == 200
    bill2 = await client.get("/api/billing", headers={"Authorization": owner["auth"]})
    assert bill2.json()["plan"] == "free"


async def test_webhook_unknown_subscription_ignored(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/billing/webhook",
        json={
            "type": "customer.subscription.updated",
            "data": {"object": {"id": "sub_nope", "status": "active"}},
        },
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "unknown_subscription"


def test_plan_from_status() -> None:
    from frontdesk.billing import plan_from_status

    assert plan_from_status("active") == Plan.pro
    assert plan_from_status("trialing") == Plan.pro
    assert plan_from_status("canceled") == Plan.free
    assert plan_from_status("past_due") == Plan.free
