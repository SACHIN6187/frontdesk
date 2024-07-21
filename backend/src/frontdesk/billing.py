"""Stripe billing in test mode.

Against `stripe-mock` (docker-compose service), the SDK talks to a local server that
mimics the Stripe API — no real keys, no network, deterministic responses. The same
code runs against real Stripe by pointing `stripe_api_base` at api.stripe.com and
setting a real test key. Only the plan/seat state lives in our DB; Stripe owns the
customer + subscription objects.
"""

from __future__ import annotations

import stripe

from .config import get_settings
from .models import Plan


def _client() -> stripe.StripeClient:
    s = get_settings()
    return stripe.StripeClient(api_key=s.stripe_api_key, base_addresses={"api": s.stripe_api_base})


def seat_limit_for(plan: Plan) -> int:
    s = get_settings()
    return s.pro_seat_limit if plan == Plan.pro else s.free_seat_limit


def ensure_customer(org_id: str, org_name: str, existing_id: str | None) -> str:
    """Return a Stripe customer id, creating one on first use."""
    if existing_id:
        return existing_id
    customer = _client().customers.create(params={"name": org_name, "metadata": {"org_id": org_id}})
    return customer.id


def create_subscription(customer_id: str) -> stripe.Subscription:
    """Subscribe the customer to the pro price (test mode)."""
    s = get_settings()
    return _client().subscriptions.create(
        params={"customer": customer_id, "items": [{"price": s.stripe_price_pro}]}
    )


def cancel_subscription(subscription_id: str) -> stripe.Subscription:
    return _client().subscriptions.cancel(subscription_id)


def plan_from_status(status: str) -> Plan:
    """Map a Stripe subscription status to our plan. Active/trialing => pro."""
    return Plan.pro if status in {"active", "trialing"} else Plan.free
