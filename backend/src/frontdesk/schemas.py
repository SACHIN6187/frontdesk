"""Pydantic request/response models. Shared across routers."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import Plan, Role, TicketStatus


class SignupIn(BaseModel):
    org_name: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    org_id: str
    role: Role


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str
    name: str


class MemberOut(BaseModel):
    user_id: str
    email: str
    name: str
    role: Role


class InviteIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    role: Role = Role.agent


class RoleUpdateIn(BaseModel):
    role: Role


class TicketIn(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    body: str = ""
    requester_email: EmailStr


class TicketUpdateIn(BaseModel):
    subject: str | None = Field(default=None, max_length=200)
    body: str | None = None
    status: TicketStatus | None = None
    assignee_id: str | None = None


class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    subject: str
    body: str
    requester_email: str
    status: TicketStatus
    assignee_id: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime


class CommentIn(BaseModel):
    body: str = Field(min_length=1)


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    ticket_id: str
    author_id: str
    body: str
    created_at: datetime


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    plan: Plan
    status: str
    seats: int
    seat_limit: int
    stripe_subscription_id: str | None
