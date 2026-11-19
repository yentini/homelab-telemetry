"""Hermetic unit tests for Homelab Telemetry Hub backend."""

import os
import unittest
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite:///./test_telemetry.db"

from fastapi.testclient import TestClient
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import RffmUserModel


class TestTelemetryBackend(unittest.TestCase):
    def setUp(self) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        Base.metadata.drop_all(bind=engine)

    def test_health_endpoint(self) -> None:
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "ok"})

    @patch("app.main.fetch_dokploy_snapshot")
    def test_pin_auth_event_ingestion_and_dashboard_overview(self, mock_dokploy) -> None:
        # Arrange
        mock_dokploy.return_value = {
            "connected": True,
            "projects": [{"project_id": "p1", "name": "RFFM", "services": []}],
            "containers_running": 7,
            "containers_total": 7,
            "containers": [],
        }
        with SessionLocal() as db:
            db.add(
                RffmUserModel(
                    email="cesar@cabrerizolab.net",
                    name="César",
                    auth_provider="local",
                )
            )
            db.commit()

        # Act 1: Ingest FutMad and GeoRisk events
        e1 = self.client.post(
            "/api/events",
            json={
                "app_id": "futmad",
                "event_type": "session_start",
                "visitor_id": "vis-futmad-1",
                "user_email": "cesar@cabrerizolab.net",
                "path": "/favoritos",
            },
        )
        self.assertEqual(e1.status_code, 201)

        e2 = self.client.post(
            "/api/events",
            json={
                "app_id": "georisk",
                "event_type": "unlock_click",
                "visitor_id": "vis-geo-1",
                "path": "/inmueble/1234567VK4713S0001WX",
                "metadata": {"plan_type": "SINGLE_REPORT_699", "rc": "1234567VK4713S0001WX"},
            },
        )
        self.assertEqual(e2.status_code, 201)

        e3 = self.client.post(
            "/api/events",
            json={
                "app_id": "georisk",
                "event_type": "unlock_error",
                "visitor_id": "vis-geo-1",
                "path": "/inmueble/1234567VK4713S0001WX",
                "metadata": {"error": "Polar checkout timeout"},
            },
        )
        self.assertEqual(e3.status_code, 201)

        # Act 2: Verify PIN
        bad_pin = self.client.post("/api/auth/verify-pin", json={"pin": "0000"})
        self.assertEqual(bad_pin.status_code, 401)

        ok_pin = self.client.post("/api/auth/verify-pin", json={"pin": "3272"})
        self.assertEqual(ok_pin.status_code, 200)
        token = ok_pin.json()["access_token"]

        # Act 3: Fetch Dashboard Overview
        overview = self.client.get(
            "/api/dashboard/overview",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(overview.status_code, 200)
        data = overview.json()

        # Assert
        self.assertEqual(data["global_kpis"]["total_registered_users"], 1)
        self.assertEqual(data["global_kpis"]["unique_visitors_24h"], 2)
        self.assertEqual(data["global_kpis"]["errors_24h"], 1)
        self.assertEqual(data["futmad"]["sessions_total"], 1)
        self.assertEqual(data["georisk"]["unlock_clicks_total"], 1)
        self.assertEqual(data["georisk"]["unlock_by_plan"]["SINGLE_REPORT_699"], 1)
        self.assertEqual(len(data["georisk"]["recent_errors"]), 1)


if __name__ == "__main__":
    unittest.main()
