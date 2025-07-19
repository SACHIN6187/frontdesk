"""WebSocket fan-out: broadcasts reach an org's sockets and never leak across orgs."""

from typing import Any

import pytest
from httpx import AsyncClient

from frontdesk.events import EventHub, broadcast, hub
from tests.conftest import signup


class FakeWS:
    """Minimal stand-in for a Starlette WebSocket that records sent events."""

    def __init__(self, fail: bool = False) -> None:
        self.sent: list[dict[str, Any]] = []
        self.fail = fail

    async def send_json(self, data: dict[str, Any]) -> None:
        if self.fail:
            raise RuntimeError("socket dead")
        self.sent.append(data)


async def test_hub_broadcasts_within_org_only() -> None:
    h = EventHub()
    a1, a2, b1 = FakeWS(), FakeWS(), FakeWS()
    await h.subscribe("orgA", a1)  # type: ignore[arg-type]
    await h.subscribe("orgA", a2)  # type: ignore[arg-type]
    await h.subscribe("orgB", b1)  # type: ignore[arg-type]

    await h.broadcast("orgA", {"type": "ticket.created", "id": "1"})

    assert a1.sent == [{"type": "ticket.created", "id": "1"}]
    assert a2.sent == a1.sent
    assert b1.sent == []  # org B never receives org A's event
    assert h.connection_count("orgA") == 2


async def test_hub_drops_dead_sockets() -> None:
    h = EventHub()
    good, dead = FakeWS(), FakeWS(fail=True)
    await h.subscribe("org", good)  # type: ignore[arg-type]
    await h.subscribe("org", dead)  # type: ignore[arg-type]
    await h.broadcast("org", {"type": "x"})
    # The dead socket is pruned; the good one still got the event.
    assert good.sent == [{"type": "x"}]
    assert h.connection_count("org") == 1


async def test_unsubscribe_removes_socket() -> None:
    h = EventHub()
    ws = FakeWS()
    await h.subscribe("org", ws)  # type: ignore[arg-type]
    await h.unsubscribe("org", ws)  # type: ignore[arg-type]
    assert h.connection_count("org") == 0
    await h.broadcast("org", {"type": "x"})
    assert ws.sent == []


async def test_ticket_create_triggers_broadcast(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Creating a ticket over HTTP pushes a ticket.created event to the org fan-out."""
    captured: list[tuple[str, dict[str, Any]]] = []

    async def fake_broadcast(org_id: str, event: dict[str, Any]) -> None:
        captured.append((org_id, event))

    # Patch the name the tickets router imported.
    import frontdesk.routers.tickets as tickets_mod

    monkeypatch.setattr(tickets_mod, "broadcast", fake_broadcast)

    owner = await signup(client, "Acme", "ws@acme.io")
    resp = await client.post(
        "/api/tickets",
        headers={"Authorization": owner["auth"]},
        json={"subject": "live!", "body": "", "requester_email": "r@x.io"},
    )
    assert resp.status_code == 201
    assert len(captured) == 1
    org_id, event = captured[0]
    assert org_id == owner["org_id"]
    assert event["type"] == "ticket.created"
    assert event["subject"] == "live!"


def test_module_hub_singleton() -> None:
    # The module-level `broadcast` targets the shared `hub`.
    assert broadcast.__module__ == "frontdesk.events"
    assert isinstance(hub, EventHub)
