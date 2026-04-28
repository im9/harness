"""Backend providers (ADR 008).

Phase 1 ships mock implementations only; real-vendor adapters live
outside the public tree. Each protocol has a string-keyed registry so
adapters (mocks here, out-of-tree adapters when they exist) register
themselves uniformly.
"""
