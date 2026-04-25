"""Tests for the help-entries YAML import path (ADR 010 Phase 1).

The import is the only authoring surface in Phase 1 (in-app editor
deferred). It bootstraps entries from `config/help-entries.yaml`
(gitignored, operator-private). Contract: idempotent re-runs,
transactional batches, no-op for empty files, missing-file error.

Tests target the import function directly with a session fixture
rather than shelling out — the CLI subcommand is thin glue (per
cli.py module docstring: "intentionally kept free of logic that
would warrant tests").
"""

import json
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from harness.help_import import import_help_yaml
from harness.models import HelpEntry


@pytest_asyncio.fixture
async def session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        yield s


def _write_yaml(tmp_path: Path, content: str) -> Path:
    path = tmp_path / "help-entries.yaml"
    path.write_text(content)
    return path


async def _count(session: AsyncSession) -> int:
    return (await session.execute(select(func.count(HelpEntry.id)))).scalar_one()


# ---------- happy path ----------


async def test_import_creates_rows(tmp_path: Path, session: AsyncSession) -> None:
    yaml_path = _write_yaml(
        tmp_path,
        """
- slug: vwap
  title_en: VWAP
  title_ja: 出来高加重平均価格
  tags: [chart, indicator]
  body_en: Volume-weighted price.
  body_ja: 出来高加重の価格基準。
- slug: bid-ask
  title_en: Bid/Ask Spread
  title_ja: ビッド・アスクスプレッド
  tags: [securities]
  body_en: Best-bid to best-ask distance.
  body_ja: 最良ビッドと最良アスクの距離。
""",
    )

    count = await import_help_yaml(session, yaml_path)
    assert count == 2
    assert await _count(session) == 2


# ---------- idempotency ----------


async def test_import_is_idempotent_via_slug_upsert(
    tmp_path: Path, session: AsyncSession
) -> None:
    # Re-running the same import must not duplicate rows. Slug is the
    # stable upsert key (Phase 1 Decision Q1).
    yaml_path = _write_yaml(
        tmp_path,
        """
- slug: vwap
  title_en: VWAP
  title_ja: VWAP
  tags: [chart]
  body_en: First version.
  body_ja: 初版。
""",
    )

    await import_help_yaml(session, yaml_path)
    await import_help_yaml(session, yaml_path)

    assert await _count(session) == 1


async def test_import_overwrites_changed_fields_on_reimport(
    tmp_path: Path, session: AsyncSession
) -> None:
    # Idempotent ≠ ignore-on-conflict. Re-importing edited content
    # must replace mutable fields so the operator can edit YAML and
    # re-import to see the change. The bilingual fields all need to
    # round-trip — pin both EN and JA bodies after the second import.
    initial = _write_yaml(
        tmp_path,
        """
- slug: vwap
  title_en: VWAP
  title_ja: VWAP
  tags: [chart]
  body_en: Old EN body.
  body_ja: 旧 JA 本文。
""",
    )
    await import_help_yaml(session, initial)

    edited = _write_yaml(
        tmp_path,
        """
- slug: vwap
  title_en: VWAP (revised)
  title_ja: VWAP (改訂)
  tags: [chart, indicator]
  body_en: New EN body.
  body_ja: 新 JA 本文。
""",
    )
    await import_help_yaml(session, edited)

    row = (await session.execute(select(HelpEntry).where(HelpEntry.slug == "vwap"))).scalar_one()
    assert row.title_en == "VWAP (revised)"
    assert row.title_ja == "VWAP (改訂)"
    assert row.body_en == "New EN body."
    assert row.body_ja == "新 JA 本文。"
    # tags stored as JSON; parse rather than match the wire string.
    assert json.loads(row.tags) == ["chart", "indicator"]


# ---------- transactional rollback ----------


async def test_import_rolls_back_entire_batch_on_invalid_entry(
    tmp_path: Path, session: AsyncSession
) -> None:
    # Validation failures inside the batch must leave the DB
    # untouched. Half-applied imports leave the DB in a state the
    # operator can't recover cleanly with a second run.
    yaml_path = _write_yaml(
        tmp_path,
        """
- slug: vwap
  title_en: VWAP
  title_ja: VWAP
  tags: [chart]
  body_en: Valid entry.
  body_ja: 有効な項目。
- slug: ""
  title_en: Bad
  title_ja: 不正
  tags: [chart]
  body_en: Empty slug fails validation.
  body_ja: 空 slug は検証失敗。
""",
    )

    with pytest.raises(ValueError):
        await import_help_yaml(session, yaml_path)

    assert await _count(session) == 0


async def test_import_rolls_back_when_required_language_field_is_missing(
    tmp_path: Path, session: AsyncSession
) -> None:
    # Both languages of title and body are required (Phase 1 Decision
    # Q1). A YAML entry missing one must fail validation, not silently
    # save with an empty string in the missing field.
    yaml_path = _write_yaml(
        tmp_path,
        """
- slug: vwap
  title_en: VWAP
  tags: [chart]
  body_en: Missing title_ja and body_ja.
""",
    )
    with pytest.raises(ValueError):
        await import_help_yaml(session, yaml_path)
    assert await _count(session) == 0


# ---------- empty / missing file ----------


async def test_import_empty_yaml_is_noop(tmp_path: Path, session: AsyncSession) -> None:
    # An empty YAML file is a valid operator state — they may have
    # removed all curated entries. No-op is the least-surprise reading.
    yaml_path = _write_yaml(tmp_path, "# nothing here\n")
    count = await import_help_yaml(session, yaml_path)
    assert count == 0
    assert await _count(session) == 0


async def test_import_missing_file_raises(tmp_path: Path, session: AsyncSession) -> None:
    # Missing file is a path typo, not "empty". The CLI subcommand
    # turns FileNotFoundError into a non-zero exit with a clear
    # message; silently treating it as "empty" would mask the typo.
    missing = tmp_path / "does-not-exist.yaml"
    with pytest.raises(FileNotFoundError):
        await import_help_yaml(session, missing)


async def test_import_rejects_non_list_root(tmp_path: Path, session: AsyncSession) -> None:
    # The schema is "a list of entries at the top level". A mapping at
    # the root is almost certainly an operator mistake (forgot the `-`
    # bullet). Reject loudly rather than guess.
    yaml_path = _write_yaml(
        tmp_path,
        """
slug: vwap
title_en: VWAP
title_ja: VWAP
tags: [chart]
body_en: oops, wrapped at top level
body_ja: 最上位でラップしてしまった
""",
    )
    with pytest.raises(ValueError):
        await import_help_yaml(session, yaml_path)
