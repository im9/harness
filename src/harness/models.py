from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from harness.db import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    totp_secret: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    trade_journals: Mapped[list["TradeJournal"]] = relationship(back_populates="user")


class TradeJournal(Base):
    __tablename__ = "trade_journals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    symbol: Mapped[str] = mapped_column(String(32))
    side: Mapped[str] = mapped_column(String(8))
    qty: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    price: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    user: Mapped["User"] = relationship(back_populates="trade_journals")


class Rule(Base):
    __tablename__ = "rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(128))
    expression: Mapped[str] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    # TEXT uuid per ADR 001 §Token strategy. String(36) fits the canonical
    # 8-4-4-4-12 form; no DB-side default so the service layer can assign ids
    # deterministically in tests.
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    # SHA-256 hex digest = 64 chars. We never store the plaintext token.
    token_hash: Mapped[str] = mapped_column(String(64))
    family_id: Mapped[str] = mapped_column(String(36))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    channel: Mapped[str] = mapped_column(String(32))
    payload: Mapped[str] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")


class HelpEntry(Base):
    """Operator-curated learning reference (ADR 010 Phase 1).

    One row per term/concept, **bilingual** (Phase 1 Decision Q1):
    `title_en` / `title_ja`, `body_en` / `body_ja`, and optional
    per-language aliases. The frontend selects the field pair matching
    `useTranslation()`'s active language so chrome and content track
    the same switch.

    `slug` is the stable seed key — the CLI `harness help-import`
    upserts by slug so re-running the import is idempotent, and the
    URL handle `/help/{slug}` (Phase 1 Decision Q3) hangs off it
    without a separate migration.

    `tags` is a single TEXT JSON array of **neutral keys** (e.g.
    `["chart", "indicator"]`); display labels are translated through
    the i18n dict (`help.tag.{key}`) on the frontend so tag identity
    stays singular across languages. `aliases_en` / `aliases_ja` are
    JSON-encoded TEXT arrays; `body_*` is markdown rendered client-
    side via react-markdown.
    """

    __tablename__ = "help_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(128), unique=True)
    title_en: Mapped[str] = mapped_column(String(255))
    title_ja: Mapped[str] = mapped_column(String(255))
    tags: Mapped[str] = mapped_column(Text)
    body_en: Mapped[str] = mapped_column(Text)
    body_ja: Mapped[str] = mapped_column(Text)
    aliases_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    aliases_ja: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class AppConfig(Base):
    """Single-row JSON document holding operator settings (ADR 009).

    Phase A only carries `localization.displayTimezone`; the JSON shape
    grows as more panels land (sessions / rule / setup library / macro /
    providers / notifications). One row keeps the persistence story
    boring: PUT is full-document replace, no per-panel partials, no
    join logic.
    """

    __tablename__ = "app_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    data: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
