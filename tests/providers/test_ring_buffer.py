"""Bounded FIFO ring buffer used by MarketDataProvider mocks (ADR 008).

Phase 1 keeps tick / bar history in memory only — no persistence — so a
fixed-capacity FIFO is enough. Overflow drops the oldest item.
"""

import pytest

from harness.providers._ring_buffer import RingBuffer


def test_push_then_iterate_in_insertion_order():
    buf: RingBuffer[int] = RingBuffer(capacity=4)
    # 3 < capacity=4 — verifies pre-overflow ordering without exercising drop.
    for i in [10, 20, 30]:
        buf.push(i)
    assert list(buf) == [10, 20, 30]
    assert len(buf) == 3
    assert buf.latest() == 30


def test_drops_oldest_on_overflow():
    buf: RingBuffer[int] = RingBuffer(capacity=3)
    # 5 pushes into capacity-3 buffer — derives "drop the first 2" from
    # the FIFO contract: surviving items are the most-recent `capacity`.
    for i in range(5):
        buf.push(i)
    assert list(buf) == [2, 3, 4]
    assert len(buf) == 3
    assert buf.latest() == 4


def test_latest_is_none_when_empty():
    buf: RingBuffer[int] = RingBuffer(capacity=4)
    assert buf.latest() is None
    assert len(buf) == 0


@pytest.mark.parametrize("bad", [0, -1, -100])
def test_capacity_must_be_positive(bad: int):
    # Zero / negative capacity has no FIFO semantics — reject at construction
    # rather than silently producing a buffer that drops every push.
    with pytest.raises(ValueError):
        RingBuffer[int](capacity=bad)
