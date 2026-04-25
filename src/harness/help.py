"""Help UI — persistence, schema, and HTTP routes (ADR 010 Phase 1).

Phase 1 ships browse + search behind a route surface (`/help` list +
`/help/:slug` detail per Phase 1 Decision Q3), with bilingual entry
content (Q1: `title_en` / `title_ja`, `body_en` / `body_ja`,
optional `aliases_en` / `aliases_ja`). Tags are language-neutral
keys; display labels live in the frontend i18n dict.

The list page fetches the full corpus once via `GET /api/help` and
filters client-side in the active language (Phase 1 Decision Q5).
The server-side `?tag=` (exact match against the neutral key) and
`?q=` (substring across all four searchable fields — both languages
of title and aliases) parameters exist for future paging convenience
and are not used by the page in Phase 1.

Persistence is row-per-entry (unlike the single-row JSON document
pattern used for AppConfig in settings.py) because the help corpus
is operator-curated content with stable slug identity, not
configuration state — slug is the seed-import upsert key and the
URL handle.
"""

import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from harness.auth.dependencies import current_user
from harness.db import get_session
from harness.models import HelpEntry, User

# camelCase wire format mirrors settings.py — keeps frontend zod
# schemas field-aligned without per-field alias plumbing on the
# response side. `populate_by_name=True` also lets the YAML import
# use the snake_case field names for readability.
_FIELD_CONFIG = ConfigDict(populate_by_name=True, alias_generator=None)


class HelpEntryDocument(BaseModel):
    """Wire + import shape of a single help entry.

    Used as both the API response model and the import-YAML row
    schema — one Pydantic class for both keeps validation rules
    uniform across surfaces (HTTP and CLI). Bilingual title and body
    are required; aliases are optional per language.
    """

    model_config = _FIELD_CONFIG

    slug: str = Field(min_length=1, max_length=128)
    title_en: str = Field(min_length=1, max_length=255, alias="titleEn")
    title_ja: str = Field(min_length=1, max_length=255, alias="titleJa")
    tags: list[str] = Field(default_factory=list)
    body_en: str = Field(alias="bodyEn")
    body_ja: str = Field(alias="bodyJa")
    aliases_en: list[str] | None = Field(default=None, alias="aliasesEn")
    aliases_ja: list[str] | None = Field(default=None, alias="aliasesJa")


def _row_to_document(row: HelpEntry) -> HelpEntryDocument:
    return HelpEntryDocument(
        slug=row.slug,
        title_en=row.title_en,
        title_ja=row.title_ja,
        tags=json.loads(row.tags) if row.tags else [],
        body_en=row.body_en,
        body_ja=row.body_ja,
        aliases_en=json.loads(row.aliases_en) if row.aliases_en else None,
        aliases_ja=json.loads(row.aliases_ja) if row.aliases_ja else None,
    )


def _matches_q(doc: HelpEntryDocument, needle: str) -> bool:
    # Server-side `?q=` matches in either language's title or aliases.
    # The server doesn't know which language the caller is reading in,
    # so it checks all four searchable fields. The frontend (which
    # does know) filters more tightly in the active-language fields.
    haystacks = [doc.title_en, doc.title_ja]
    if doc.aliases_en:
        haystacks.extend(doc.aliases_en)
    if doc.aliases_ja:
        haystacks.extend(doc.aliases_ja)
    return any(needle in h.casefold() for h in (s.casefold() for s in haystacks))


async def list_help_entries(
    session: AsyncSession,
    *,
    tag: str | None = None,
    q: str | None = None,
) -> list[HelpEntryDocument]:
    """List entries with optional server-side filters."""
    rows = (await session.execute(select(HelpEntry).order_by(HelpEntry.title_en))).scalars().all()
    docs = [_row_to_document(r) for r in rows]

    if tag is not None:
        docs = [d for d in docs if tag in d.tags]
    if q is not None:
        needle = q.casefold()
        docs = [d for d in docs if _matches_q(d, needle)]
    return docs


async def get_help_entry(session: AsyncSession, slug: str) -> HelpEntryDocument | None:
    row = (
        await session.execute(select(HelpEntry).where(HelpEntry.slug == slug))
    ).scalar_one_or_none()
    return _row_to_document(row) if row is not None else None


async def save_help_entries(
    session: AsyncSession, entries: list[HelpEntryDocument]
) -> list[HelpEntryDocument]:
    """Upsert a batch of entries by slug.

    Transactional: a single `commit` at the end so either all rows
    land or none do. The CLI import path leans on this so a malformed
    entry in the middle of a YAML file doesn't leave the DB half-
    seeded.
    """
    for entry in entries:
        row = (
            await session.execute(select(HelpEntry).where(HelpEntry.slug == entry.slug))
        ).scalar_one_or_none()
        tags_json = json.dumps(entry.tags)
        aliases_en_json = (
            json.dumps(entry.aliases_en) if entry.aliases_en is not None else None
        )
        aliases_ja_json = (
            json.dumps(entry.aliases_ja) if entry.aliases_ja is not None else None
        )
        if row is None:
            session.add(
                HelpEntry(
                    slug=entry.slug,
                    title_en=entry.title_en,
                    title_ja=entry.title_ja,
                    tags=tags_json,
                    body_en=entry.body_en,
                    body_ja=entry.body_ja,
                    aliases_en=aliases_en_json,
                    aliases_ja=aliases_ja_json,
                )
            )
        else:
            row.title_en = entry.title_en
            row.title_ja = entry.title_ja
            row.tags = tags_json
            row.body_en = entry.body_en
            row.body_ja = entry.body_ja
            row.aliases_en = aliases_en_json
            row.aliases_ja = aliases_ja_json
    await session.commit()
    return entries


router = APIRouter(prefix="/api")


@router.get("/help", response_model=list[HelpEntryDocument], response_model_by_alias=True)
async def list_help(
    tag: str | None = Query(default=None),
    q: str | None = Query(default=None),
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[HelpEntryDocument]:
    return await list_help_entries(session, tag=tag, q=q)


@router.get("/help/{slug}", response_model=HelpEntryDocument, response_model_by_alias=True)
async def get_help(
    slug: str,
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> HelpEntryDocument:
    doc = await get_help_entry(session, slug)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Help entry not found")
    return doc
