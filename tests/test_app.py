from fastapi.testclient import TestClient

from harness.app import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")
    # 200 = HTTP spec "OK". The /health endpoint is a liveness probe used during
    # boilerplate verification and later by uptime checks; the contract is
    # { "status": "ok" } on success.
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
