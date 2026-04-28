"""Bounded FIFO ring buffer (ADR 008).

Phase 1 keeps tick / bar history in memory only; persistence is a
Future extension (see ADR 007 — tick log persistence). A bounded FIFO
caps memory and matches the "last N ticks" access pattern the engine
will use.
"""

from collections import deque
from collections.abc import Iterator


class RingBuffer[T]:
    def __init__(self, capacity: int) -> None:
        if capacity <= 0:
            raise ValueError(f"capacity must be positive, got {capacity}")
        self._buf: deque[T] = deque(maxlen=capacity)

    def push(self, item: T) -> None:
        self._buf.append(item)

    def latest(self) -> T | None:
        return self._buf[-1] if self._buf else None

    def __iter__(self) -> Iterator[T]:
        return iter(self._buf)

    def __len__(self) -> int:
        return len(self._buf)
