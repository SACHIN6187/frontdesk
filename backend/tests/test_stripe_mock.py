"""Integration test against stripe-mock (the real Stripe SDK, local emulator).

Skipped automatically when stripe-mock isn't reachable (e.g. a CI job without the
service), so the suite stays green everywhere while still proving the billing code
talks to Stripe for real when the emulator is up.
"""

import httpx
import pytest

from frontdesk.config import get_settings
from frontdesk.models import Plan


def _stripe_mock_up() -> bool:
    base = get_settings().stripe_api_base
    try:
        # stripe-mock returns 401 without auth, which still proves it is listening.
        httpx.get(f"{base}/v1/customers", timeout=1.0)
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _stripe_mock_up(), reason="stripe-mock not reachable at configured api_base"
)


def test_ensure_customer_and_subscribe() -> None:
    from frontdesk.billing import create_subscription, ensure_customer, plan_from_status

    customer_id = ensure_customer("org-int", "Integration Org", None)
    assert customer_id.startswith("cus_")

    sub = create_subscription(customer_id)
    assert sub.id.startswith("sub_")
    # stripe-mock returns a well-formed subscription with a status.
    assert plan_from_status(sub.status) in set(Plan)
