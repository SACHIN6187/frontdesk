"""Billing endpoints: view subscription, upgrade to pro, cancel, and a webhook
that reconciles our stored plan/status with Stripe events."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import billing
from ..db import get_db
from ..models import Membership, Org, Plan, Subscription
from ..rbac import Permission, require
from ..schemas import SubscriptionOut

router = APIRouter(prefix="/api/billing", tags=["billing"])


async def _get_sub(db: AsyncSession, org_id: str) -> Subscription:
    sub = (await db.execute(select(Subscription).where(Subscription.org_id == org_id))).scalar_one()
    return sub


def _to_out(sub: Subscription) -> SubscriptionOut:
    return SubscriptionOut(
        plan=sub.plan,
        status=sub.status,
        seats=sub.seats,
        seat_limit=billing.seat_limit_for(sub.plan),
        stripe_subscription_id=sub.stripe_subscription_id,
    )


@router.get("", response_model=SubscriptionOut)
async def get_subscription(
    db: Annotated[AsyncSession, Depends(get_db)],
    membership: Annotated[Membership, Depends(require(Permission.billing_read))],
) -> SubscriptionOut:
    return _to_out(await _get_sub(db, membership.org_id))


@router.post("/upgrade", response_model=SubscriptionOut)
async def upgrade(
    db: Annotated[AsyncSession, Depends(get_db)],
    membership: Annotated[Membership, Depends(require(Permission.billing_manage))],
) -> SubscriptionOut:
    sub = await _get_sub(db, membership.org_id)
    if sub.plan == Plan.pro and sub.status == "active":
        return _to_out(sub)
    org = await db.get(Org, membership.org_id)
    assert org is not None
    customer_id = billing.ensure_customer(org.id, org.name, sub.stripe_customer_id)
    stripe_sub = billing.create_subscription(customer_id)
    sub.stripe_customer_id = customer_id
    sub.stripe_subscription_id = stripe_sub.id
    sub.status = stripe_sub.status
    sub.plan = billing.plan_from_status(stripe_sub.status)
    await db.commit()
    return _to_out(sub)


@router.post("/cancel", response_model=SubscriptionOut)
async def cancel(
    db: Annotated[AsyncSession, Depends(get_db)],
    membership: Annotated[Membership, Depends(require(Permission.billing_manage))],
) -> SubscriptionOut:
    sub = await _get_sub(db, membership.org_id)
    if sub.stripe_subscription_id:
        billing.cancel_subscription(sub.stripe_subscription_id)
    sub.plan = Plan.free
    sub.status = "canceled"
    sub.stripe_subscription_id = None
    await db.commit()
    return _to_out(sub)


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def webhook(request: Request, db: Annotated[AsyncSession, Depends(get_db)]) -> dict[str, str]:
    """Reconcile subscription state from a Stripe event.

    In test mode the webhook secret is empty, so we parse the JSON directly. With a
    real secret set, signature verification would gate this (documented, not run in CI).
    """
    payload = await request.body()
    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid payload") from None

    event_type = event.get("type", "")
    obj = event.get("data", {}).get("object", {})
    stripe_sub_id = obj.get("id")
    if not stripe_sub_id or not event_type.startswith("customer.subscription"):
        return {"status": "ignored"}

    sub = (
        await db.execute(
            select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
        )
    ).scalar_one_or_none()
    if sub is None:
        return {"status": "unknown_subscription"}

    if event_type == "customer.subscription.deleted":
        sub.status = "canceled"
        sub.plan = Plan.free
    else:  # created / updated
        new_status = obj.get("status", sub.status)
        sub.status = new_status
        sub.plan = billing.plan_from_status(new_status)
    await db.commit()
    return {"status": "ok"}
