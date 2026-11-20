"""Hermetic unit tests for Homelab Telemetry Hub backend."""

import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite:///./test_telemetry.db"

from fastapi.testclient import TestClient
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import RffmUserModel
from app.system_metrics import compute_container_usage, fetch_raspberry_metrics


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

    @patch("app.main.fetch_raspberry_metrics")
    @patch("app.main.fetch_dokploy_snapshot")
    def test_pin_auth_event_ingestion_and_dashboard_overview(
        self, mock_dokploy, mock_rpi
    ) -> None:
        # Arrange
        mock_dokploy.return_value = {
            "connected": True,
            "projects": [{"project_id": "p1", "name": "RFFM", "services": []}],
            "containers_running": 7,
            "containers_total": 7,
            "total_cpu_percent": 12.5,
            "total_memory_mb": 512.0,
            "containers": [],
        }
        mock_rpi.return_value = {
            "available": True,
            "cpu_percent": 18.2,
            "cpu_cores": 4,
            "load_1m": 0.45,
            "ram_used_mb": 2048.0,
            "ram_total_mb": 8192.0,
            "ram_percent": 25.0,
            "temperature_c": 49.5,
            "uptime_formatted": "3d 4h 12m",
            "fan_detected": True,
            "fan_active": True,
            "fan_rpm": 2100,
            "fan_level": None,
            "fan_status": "Funcionando",
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

        e1_anon = self.client.post(
            "/api/events",
            json={
                "app_id": "futmad",
                "event_type": "session_start",
                "visitor_id": "vis-futmad-anon-2",
                "path": "/partidos",
            },
        )
        self.assertEqual(e1_anon.status_code, 201)

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
        self.assertEqual(data["global_kpis"]["unique_visitors_24h"], 3)
        self.assertEqual(data["global_kpis"]["errors_24h"], 1)
        self.assertEqual(data["futmad"]["sessions_total"], 2)
        self.assertTrue(len(data["futmad"]["daily_accesses"]) >= 1)
        today_entry = data["futmad"]["daily_accesses"][-1]
        self.assertEqual(today_entry["anonymous_accesses"], 1)
        self.assertEqual(today_entry["registered_accesses"], 1)
        self.assertEqual(today_entry["new_registrations"], 1)
        self.assertEqual(today_entry["total_accesses"], 2)
        self.assertEqual(len(today_entry["registered_users_detail"]), 1)
        self.assertEqual(today_entry["registered_users_detail"][0]["email"], "cesar@cabrerizolab.net")
        self.assertEqual(today_entry["registered_users_detail"][0]["count"], 1)
        self.assertEqual(data["futmad"]["registered_user_accesses"][0]["access_count"], 1)
        self.assertTrue(data["raspberry"]["available"])
        self.assertEqual(data["raspberry"]["temperature_c"], 49.5)
        self.assertEqual(data["georisk"]["unlock_clicks_total"], 1)
        self.assertEqual(data["georisk"]["unlock_by_plan"]["SINGLE_REPORT_699"], 1)
        self.assertEqual(len(data["georisk"]["recent_errors"]), 1)

    def test_raspberry_metrics_from_proc_and_sys(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            proc_dir = Path(tmp) / "proc"
            sys_dir = Path(tmp) / "sys"
            proc_dir.mkdir()
            (sys_dir / "class" / "thermal" / "thermal_zone0").mkdir(parents=True)
            (sys_dir / "class" / "thermal" / "cooling_device0").mkdir(parents=True)

            (proc_dir / "stat").write_text("cpu  1000 0 200 8800 0 0 0 0 0 0\n")
            (proc_dir / "loadavg").write_text("0.42 0.35 0.30 1/200 1234\n")
            (proc_dir / "meminfo").write_text(
                "MemTotal:        8388608 kB\nMemAvailable:    6291456 kB\n"
            )
            (proc_dir / "uptime").write_text("90061.50 1234.00\n")
            (sys_dir / "class" / "thermal" / "thermal_zone0" / "temp").write_text("47500\n")
            (sys_dir / "class" / "thermal" / "cooling_device0" / "type").write_text("pwm-fan\n")
            (sys_dir / "class" / "thermal" / "cooling_device0" / "cur_state").write_text("2\n")
            (sys_dir / "class" / "thermal" / "cooling_device0" / "max_state").write_text("4\n")

            metrics = fetch_raspberry_metrics(proc_root=str(proc_dir), sys_roots=(str(sys_dir),))
            self.assertTrue(metrics["available"])
            self.assertEqual(metrics["ram_total_mb"], 8192.0)
            self.assertEqual(metrics["ram_used_mb"], 2048.0)
            self.assertEqual(metrics["ram_percent"], 25.0)
            self.assertEqual(metrics["temperature_c"], 47.5)
            self.assertEqual(metrics["uptime_formatted"], "1d 1h 1m")
            self.assertTrue(metrics["fan_detected"])
            self.assertTrue(metrics["fan_active"])
            self.assertEqual(metrics["fan_level"], 50)
            self.assertEqual(metrics["fan_status"], "Funcionando")

    def test_compute_container_usage(self) -> None:
        stats = {
            "cpu_stats": {
                "cpu_usage": {"total_usage": 200_000_000},
                "system_cpu_usage": 2_000_000_000,
                "online_cpus": 4,
            },
            "precpu_stats": {
                "cpu_usage": {"total_usage": 100_000_000},
                "system_cpu_usage": 1_000_000_000,
            },
            "memory_stats": {
                "usage": 300 * 1024 * 1024,
                "limit": 1024 * 1024 * 1024,
                "stats": {"inactive_file": 44 * 1024 * 1024},
            },
        }
        cpu_pct, mem_mb, mem_limit_mb, mem_pct = compute_container_usage(stats)
        self.assertEqual(cpu_pct, 40.0)
        self.assertEqual(mem_mb, 256.0)
        self.assertEqual(mem_limit_mb, 1024.0)
        self.assertEqual(mem_pct, 25.0)


if __name__ == "__main__":
    unittest.main()
