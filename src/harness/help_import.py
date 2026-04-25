"""YAML seed import for help entries (ADR 010 Phase 1).

The only authoring surface for help entries in Phase 1 — the operator
edits `config/help-entries.yaml` (gitignored, operator-private) and
runs `harness help-import` to upsert into the DB. The in-app editor is
deferred to a follow-on ADR.

Import semantics (Phase 1 Decision Q6):
- Idempotent re-runs (upsert by slug)
- Transactional batches (validation failure = no rows applied)
- Empty file = no-op (operator may clear authored notes)
- Missing file = error (must not silently mask path typos)
"""

from pathlib import Path

import yaml
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from harness.help import HelpEntryDocument, save_help_entries


async def import_help_yaml(session: AsyncSession, path: Path) -> int:
    """Read, validate, and upsert a YAML batch of help entries.

    Returns the number of entries written (0 if the file was empty).
    Raises:
      FileNotFoundError: if `path` does not exist.
      ValueError: if the YAML root is not a list, or any entry fails
                  Pydantic validation. The DB is not mutated when this
                  is raised (validation runs before `save_help_entries`).
    """
    raw = path.read_text()
    parsed = yaml.safe_load(raw)
    if parsed is None:
        return 0
    if not isinstance(parsed, list):
        raise ValueError(
            "help-entries YAML must be a list at the top level "
            "(each entry prefixed with '- ')."
        )

    entries: list[HelpEntryDocument] = []
    for index, item in enumerate(parsed):
        try:
            entries.append(HelpEntryDocument.model_validate(item))
        except ValidationError as e:
            raise ValueError(f"help-entries YAML entry {index} failed validation: {e}") from e

    await save_help_entries(session, entries)
    return len(entries)
