"""Per-org live event stream over WebSocket.

The client connects with `?token=<jwt>`; we authenticate the same way HTTP routes do,
resolve the org, and subscribe the socket to that org's fan-out. Events are pushed by
the ticket/comment routers via `events.broadcast`.
"""

from typing import Annotated

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from ..db import get_sessionmaker
from ..events import hub
from ..models import Membership
from ..security import decode_token

router = APIRouter()


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket, token: Annotated[str, Query()]) -> None:
    claims = decode_token(token)
    if not claims or "sub" not in claims or "org" not in claims:
        await websocket.close(code=4401)  # unauthorized
        return

    # Verify the caller really belongs to the org before subscribing.
    async with get_sessionmaker()() as db:
        membership = (
            await db.execute(
                select(Membership).where(
                    Membership.user_id == claims["sub"],
                    Membership.org_id == claims["org"],
                )
            )
        ).scalar_one_or_none()
    if membership is None:
        await websocket.close(code=4403)  # forbidden
        return

    org_id = str(claims["org"])
    await websocket.accept()
    await hub.subscribe(org_id, websocket)
    await websocket.send_json({"type": "connected", "org_id": org_id})
    try:
        while True:
            # We don't expect client messages; this keeps the socket open and
            # detects disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await hub.unsubscribe(org_id, websocket)
