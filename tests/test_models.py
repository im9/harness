from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from harness.models import Notification, Rule, TradeJournal, User


async def _make_user(session: AsyncSession, username: str = "alice") -> User:
    user = User(
        username=username,
        password_hash="$2b$12$placeholder",
        totp_secret="JBSWY3DPEHPK3PXP",
    )
    session.add(user)
    await session.flush()
    return user


async def test_user_roundtrip(session: AsyncSession) -> None:
    await _make_user(session)
    await session.commit()

    fetched = (await session.execute(select(User).where(User.username == "alice"))).scalar_one()
    assert fetched.username == "alice"
    # created_at auto-populated by default=_utcnow; non-null is the contract.
    assert fetched.created_at is not None


async def test_trade_journal_roundtrip(session: AsyncSession) -> None:
    user = await _make_user(session)
    journal = TradeJournal(
        user_id=user.id,
        symbol="7203.T",
        side="buy",
        qty=Decimal("100"),
        price=Decimal("2500.00"),
        entered_at=datetime(2026, 4, 22, 9, 0, tzinfo=UTC),
        notes="breakout above 20MA",
    )
    session.add(journal)
    await session.commit()

    fetched = (
        await session.execute(select(TradeJournal).where(TradeJournal.symbol == "7203.T"))
    ).scalar_one()
    # Numeric precision preserved through SQLite: exact equality with the original Decimal
    # confirms the column type carried the value without float conversion.
    assert fetched.qty == Decimal("100")
    assert fetched.price == Decimal("2500.00")
    assert fetched.side == "buy"


async def test_rule_roundtrip(session: AsyncSession) -> None:
    user = await _make_user(session)
    rule = Rule(
        user_id=user.id,
        name="breakout-20ma",
        expression="close > sma(close, 20)",
    )
    session.add(rule)
    await session.commit()

    fetched = (await session.execute(select(Rule).where(Rule.name == "breakout-20ma"))).scalar_one()
    # enabled defaults to True — this is the contract so new rules are active on creation.
    assert fetched.enabled is True


async def test_notification_roundtrip(session: AsyncSession) -> None:
    user = await _make_user(session)
    notification = Notification(
        user_id=user.id,
        channel="webhook",
        payload='{"text":"signal fired"}',
    )
    session.add(notification)
    await session.commit()

    fetched = (
        await session.execute(select(Notification).where(Notification.user_id == user.id))
    ).scalar_one()
    # status defaults to "pending" — delivery lifecycle starts unsent.
    assert fetched.status == "pending"
    assert fetched.sent_at is None


async def test_user_has_many_trade_journals(session: AsyncSession) -> None:
    user = await _make_user(session)
    for i in range(3):
        session.add(
            TradeJournal(
                user_id=user.id,
                symbol=f"TEST{i}",
                side="buy",
                qty=Decimal("1"),
                price=Decimal("1"),
                entered_at=datetime(2026, 4, 22, 9, 0, tzinfo=UTC),
            )
        )
    await session.commit()

    fetched = (
        await session.execute(
            select(User).options(selectinload(User.trade_journals)).where(User.id == user.id)
        )
    ).scalar_one()
    # 3 journals inserted for one user — the relationship should expose all of them.
    assert len(fetched.trade_journals) == 3
