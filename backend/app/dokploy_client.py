"""Client for querying live Dokploy projects, applications, and Docker containers."""

import json
import os
from typing import Any, Dict, List
import urllib.request


def fetch_dokploy_snapshot() -> Dict[str, Any]:
    """Query Dokploy REST API for projects, services, and container states."""
    base_url = os.getenv("DOKPLOY_URL", "").strip().rstrip("/")
    api_key = os.getenv("DOKPLOY_API_KEY", "").strip()
    if not base_url or not api_key:
        return {
            "connected": False,
            "projects": [],
            "containers_running": 0,
            "containers_total": 0,
            "containers": [],
        }

    headers = {"x-api-key": api_key, "Accept": "application/json"}
    projects_summary: List[Dict[str, Any]] = []
    containers_list: List[Dict[str, Any]] = []
    running_count = 0

    try:
        req = urllib.request.Request(f"{base_url}/api/project.all", headers=headers)
        with urllib.request.urlopen(req, timeout=8) as resp:
            raw_projects = json.loads(resp.read().decode("utf-8"))

        for proj in raw_projects:
            services: List[Dict[str, Any]] = []
            for env in proj.get("environments", []):
                for app in env.get("applications", []):
                    services.append({
                        "id": app.get("applicationId"),
                        "name": app.get("name"),
                        "kind": "application",
                        "status": app.get("applicationStatus") or "unknown",
                    })
                for comp in env.get("compose", []):
                    services.append({
                        "id": comp.get("composeId"),
                        "name": comp.get("name"),
                        "kind": "compose",
                        "status": comp.get("composeStatus") or "unknown",
                    })
                for pg in env.get("postgres", []):
                    services.append({
                        "id": pg.get("postgresId"),
                        "name": pg.get("name") or "postgres-db",
                        "kind": "postgres",
                        "status": pg.get("applicationStatus") or "done",
                    })
            projects_summary.append({
                "project_id": proj.get("projectId"),
                "name": proj.get("name"),
                "description": proj.get("description") or "",
                "services": services,
            })

        req_c = urllib.request.Request(f"{base_url}/api/docker.getContainers", headers=headers)
        with urllib.request.urlopen(req_c, timeout=8) as resp_c:
            raw_containers = json.loads(resp_c.read().decode("utf-8"))

        for c in raw_containers:
            state = c.get("state") or c.get("State") or "unknown"
            if state == "running":
                running_count += 1
                containers_list.append({
                    "name": c.get("name") or "container",
                    "state": state,
                    "status": c.get("status") or c.get("Status") or "",
                })

        return {
            "connected": True,
            "projects": projects_summary,
            "containers_running": running_count,
            "containers_total": len(raw_containers),
            "containers": containers_list,
        }
    except Exception as exc:
        return {
            "connected": False,
            "error": str(exc),
            "projects": projects_summary,
            "containers_running": running_count,
            "containers_total": len(containers_list),
            "containers": containers_list,
        }
