"""Local desktop/web frontend may call the backend; arbitrary sites may not."""

from fastapi.testclient import TestClient
import pytest
from backend.main import app


@pytest.mark.parametrize("origin", ["http://localhost:1420", "http://127.0.0.1:1420", "http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"])
def test_local_frontend_preflight_allowed(origin):
    with TestClient(app) as client:
        response = client.options("/schedule", headers={
            "Origin": origin, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_unknown_origin_not_allowed():
    with TestClient(app) as client:
        response = client.options("/schedule", headers={
            "Origin": "https://example.com", "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
