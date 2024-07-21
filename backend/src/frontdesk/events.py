"""Per-org WebSocket fan-out. In-process pub/sub keyed by org_id.

A single-process broadcaster is right for this scope; the interface (`broadcast`,
`subscribe`, `unsubscribe`) is what a Redis pub/sub swap would preserve, so scaling
out later doesn't touch callers.
"""

from __future__ import annotations

import asyncio
from typing import Any

from starlette.websockets import WebSocket


class EventHub:
    def __init__(self) -> None:
        self._subs: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, org_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._subs.setdefault(org_id, set()).add(ws)

    async def unsubscribe(self, org_id: str, ws: WebSocket) -> None:
        async with self._lock:
            conns = self._subs.get(org_id)
            if conns:
                conns.discard(ws)
                if not conns:
                    self._subs.pop(org_id, None)

    def connection_count(self, org_id: str) -> int:
        return len(self._subs.get(org_id, ()))

    async def broadcast(self, org_id: str, event: dict[str, Any]) -> None:
        """Send `event` to every live socket for the org; drop ones that error."""
        async with self._lock:
            targets = list(self._subs.get(org_id, ()))
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                conns = self._subs.get(org_id)
                if conns:
                    for ws in dead:
                        conns.discard(ws)


hub = EventHub()


async def broadcast(org_id: str, event: dict[str, Any]) -> None:
    await hub.broadcast(org_id, event)
