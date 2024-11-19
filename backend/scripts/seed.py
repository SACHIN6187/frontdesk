"""Seed a demo org with members and a realistic ticket queue, then print real counts.

Run against a live stack (`make up` first, or a local Postgres + backend). Every
number the README quotes about the demo comes from this script's output — nothing is
hand-typed. Idempotent: re-running resets the demo org.

Usage:  uv run python -m scripts.seed
"""

from __future__ import annotations

import asyncio

from sqlalchemy import delete, select

from frontdesk.db import get_sessionmaker
from frontdesk.models import (
    Membership,
    Org,
    Plan,
    Role,
    Subscription,
    Ticket,
    TicketComment,
    TicketStatus,
    User,
)
from frontdesk.security import hash_password

DEMO_ORG = "Northwind Support"

MEMBERS = [
    ("ops@northwind.io", "Dana Ops", Role.owner),
    ("amir@northwind.io", "Amir Agent", Role.agent),
    ("bea@northwind.io", "Bea Agent", Role.agent),
    ("val@northwind.io", "Val Viewer", Role.viewer),
]

TICKETS = [
    ("Login page returns 500 after password reset", "open", "customer1@acme.io"),
    ("Invoice PDF missing line items", "open", "billing@globex.io"),
    ("Export to CSV truncates at 1000 rows", "pending", "data@initech.io"),
    ("Dark mode toggle resets on reload", "open", "ux@umbrella.io"),
    ("Webhook retries firing twice", "pending", "dev@hooli.io"),
    ("Cannot invite teammate — seat limit", "closed", "admin@stark.io"),
    ("2FA SMS not delivered in the EU", "open", "eu@wayne.io"),
    ("API rate limit unclear in docs", "pending", "api@cyberdyne.io"),
    ("Billing charged after cancellation", "open", "finance@tyrell.io"),
    ("Search ignores accented characters", "closed", "intl@aperture.io"),
    ("Mobile layout overlaps footer", "open", "mobile@oscorp.io"),
    ("Slow dashboard load (>8s) at peak", "pending", "perf@lexcorp.io"),
]


async def seed() -> dict[str, int]:
    sm = get_sessionmaker()
    async with sm() as db:
        # Reset any prior demo org.
        existing = (await db.execute(select(Org).where(Org.name == DEMO_ORG))).scalar_one_or_none()
        if existing:
            for model in (TicketComment, Ticket, Membership, Subscription):
                await db.execute(delete(model).where(model.org_id == existing.id))
            await db.delete(existing)
            await db.commit()

        org = Org(name=DEMO_ORG)
        db.add(org)
        await db.flush()

        owner_id = ""
        agent_ids: list[str] = []
        for email, name, role in MEMBERS:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if user is None:
                user = User(email=email, name=name, password_hash=hash_password("password123"))
                db.add(user)
                await db.flush()
            db.add(Membership(org_id=org.id, user_id=user.id, role=role))
            if role == Role.owner:
                owner_id = user.id
            elif role == Role.agent:
                agent_ids.append(user.id)

        # The demo team is on Pro so its 4 seats sit comfortably within the plan limit
        # (a Free org is capped at 3 by the invite endpoint). A fake subscription id
        # stands in for the Stripe object created via the billing flow / stripe-mock.
        db.add(
            Subscription(
                org_id=org.id,
                plan=Plan.pro,
                status="active",
                seats=len(MEMBERS),
                stripe_subscription_id="sub_demo_pro",
            )
        )

        for i, (subject, status, requester) in enumerate(TICKETS):
            assignee = agent_ids[i % len(agent_ids)] if status != "closed" else None
            ticket = Ticket(
                org_id=org.id,
                subject=subject,
                body=f"Reported by {requester}. Reproduced on latest release.",
                requester_email=requester,
                status=TicketStatus(status),
                assignee_id=assignee,
                created_by=owner_id,
            )
            db.add(ticket)
            await db.flush()
            db.add(
                TicketComment(
                    org_id=org.id,
                    ticket_id=ticket.id,
                    author_id=agent_ids[0],
                    body="Thanks for the report — investigating now.",
                )
            )

        await db.commit()

        counts = {
            "members": len(MEMBERS),
            "tickets": len(TICKETS),
            "open": sum(1 for _, s, _ in TICKETS if s == "open"),
            "pending": sum(1 for _, s, _ in TICKETS if s == "pending"),
            "closed": sum(1 for _, s, _ in TICKETS if s == "closed"),
            "comments": len(TICKETS),
        }
        return counts


def main() -> None:
    counts = asyncio.run(seed())
    print(f"Seeded '{DEMO_ORG}':")
    for k, v in counts.items():
        print(f"  {k:10s} {v}")


if __name__ == "__main__":
    main()
