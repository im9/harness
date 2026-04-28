"""Registry dispatch for ChatProvider mock modes (ADR 008)."""

import pytest

from harness.providers.chat_echo import EchoChatProvider
from harness.providers.chat_registry import (
    ChatProviderRegistry,
    default_chat_registry,
)


def test_register_and_create():
    reg = ChatProviderRegistry()
    reg.register("echo", EchoChatProvider)
    p = reg.create("echo")
    assert isinstance(p, EchoChatProvider)


def test_unknown_key_raises():
    reg = ChatProviderRegistry()
    with pytest.raises(KeyError):
        reg.create("does-not-exist")


def test_duplicate_key_rejected():
    # Two adapters claiming the same key is a config bug; fail loud at
    # startup rather than silently overwriting.
    reg = ChatProviderRegistry()
    reg.register("echo", EchoChatProvider)
    with pytest.raises(ValueError):
        reg.register("echo", EchoChatProvider)


def test_default_registry_includes_echo():
    # Public tree must run end-to-end against the mock registry alone
    # (ADR 008 — Phase 1 ships mocks only). `echo` is the only mock.
    reg = default_chat_registry()
    p = reg.create("echo")
    assert isinstance(p, EchoChatProvider)
