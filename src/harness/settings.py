"""Operator settings — persistence, schema, and HTTP routes.

ADR 009 Phase A: backbone (single-row JSON document, schema-driven
validation, GET / PUT) ships behind the Localization panel. Later
panels grow the schema in place; the persistence and route shape do
not change.
"""

import json
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from harness.auth.dependencies import current_user
from harness.db import get_session
from harness.models import AppConfig, User

# camelCase wire format keeps parity with the frontend's TS / zod
# schemas without a per-field alias dance. Python-side reads stay
# snake_case via populate_by_name.
_FIELD_CONFIG = ConfigDict(populate_by_name=True, alias_generator=None)


UiLanguage = Literal["ja", "en"]
"""Phase A locks the UI language to the two values harness ships
translation dictionaries for. Adding a third (e.g. zh / ko) requires
a paired translation dictionary; until then the schema rejects it
so the operator can never select a code with no message dict."""


class LocalizationConfig(BaseModel):
    model_config = _FIELD_CONFIG

    display_timezone: str = Field(alias="displayTimezone")
    language: UiLanguage

    @field_validator("display_timezone")
    @classmethod
    def _validate_iana_timezone(cls, v: str) -> str:
        # zoneinfo is the stdlib's IANA tz database. Validating against
        # it covers the full canonical name space without us hand-curating
        # a list that drifts as the tz database evolves. The frontend
        # offers a curated short list, but accepting any valid IANA name
        # leaves room for operators who want a less-common zone (e.g. an
        # operator splitting time between two markets).
        try:
            ZoneInfo(v)
        except ZoneInfoNotFoundError as e:
            raise ValueError(f"Unknown IANA timezone: {v}") from e
        return v


class SettingsDocument(BaseModel):
    model_config = _FIELD_CONFIG

    localization: LocalizationConfig


def _defaults() -> SettingsDocument:
    # Asia/Tokyo matches the constant currently in
    # frontend/src/lib/display-timezone.ts that this slice replaces.
    # Harness' primary market is JP equities/futures (CLAUDE.md), so the
    # default reading frame stays JST.
    # Default UI language is `ja` because the operator is a Japanese
    # trader (ADR 009 policy); an `en` operator overrides via the
    # Localization panel.
    return SettingsDocument(
        localization=LocalizationConfig(display_timezone="Asia/Tokyo", language="ja")
    )


_CONFIG_ROW_ID = 1
"""Single-row table — the row id is fixed so reads/writes don't need to
hunt for "the" config row."""


async def load_settings(session: AsyncSession) -> SettingsDocument:
    """Read the single-row config; fall back to defaults on miss or invalid JSON.

    The fallback path covers two cases:
    1. First load before any PUT — no row exists yet.
    2. Schema drift (older shape, hand-edited DB, mid-rollout) — the row
       exists but doesn't validate. Returning defaults keeps the UI from
       hard-locking; the operator's next PUT writes a clean document
       over the bad row.
    """
    row = await session.get(AppConfig, _CONFIG_ROW_ID)
    if row is None:
        return _defaults()
    try:
        parsed = json.loads(row.data)
        return SettingsDocument.model_validate(parsed)
    except (json.JSONDecodeError, ValueError):
        return _defaults()


async def save_settings(session: AsyncSession, doc: SettingsDocument) -> SettingsDocument:
    """Replace the single-row config with the validated document."""
    payload = doc.model_dump_json(by_alias=True)
    row = await session.get(AppConfig, _CONFIG_ROW_ID)
    if row is None:
        session.add(AppConfig(id=_CONFIG_ROW_ID, data=payload))
    else:
        row.data = payload
    await session.commit()
    return doc


router = APIRouter(prefix="/api")


@router.get("/settings", response_model=SettingsDocument, response_model_by_alias=True)
async def get_settings(
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> SettingsDocument:
    return await load_settings(session)


@router.put("/settings", response_model=SettingsDocument, response_model_by_alias=True)
async def put_settings(
    body: SettingsDocument,
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> SettingsDocument:
    try:
        return await save_settings(session, body)
    except ValueError as e:
        # Catches any post-validation domain failure that slips past the
        # Pydantic layer (none today, but the slot exists once cross-field
        # constraints land — e.g. provider URL must be reachable).
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from e
