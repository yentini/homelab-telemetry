"""Host (Raspberry Pi) and Docker container resource metrics collector."""

from concurrent.futures import ThreadPoolExecutor
import http.client
import json
import os
from pathlib import Path
import socket
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple


class _UnixSocketHTTPConnection(http.client.HTTPConnection):
    """HTTPConnection subclass communicating over a local Unix domain socket."""

    def __init__(self, socket_path: str, timeout: float = 5.0) -> None:
        super().__init__("localhost", timeout=timeout)
        self.socket_path = socket_path

    def connect(self) -> None:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(self.timeout)
        sock.connect(self.socket_path)
        self.sock = sock


def _read_text(path: Path) -> Optional[str]:
    try:
        return path.read_text(encoding="utf-8", errors="ignore").strip()
    except OSError:
        return None


def _parse_proc_stat_cpu(proc_root: Path) -> Optional[Tuple[int, int]]:
    raw = _read_text(proc_root / "stat")
    if not raw:
        return None
    for line in raw.splitlines():
        if line.startswith("cpu "):
            parts = line.split()
            values = [int(v) for v in parts[1:] if v.isdigit()]
            if len(values) < 4:
                return None
            idle = values[3] + (values[4] if len(values) > 4 else 0)
            total = sum(values)
            return total, idle
    return None


def _format_uptime(seconds: float) -> str:
    total_mins = int(seconds // 60)
    days, rem_mins = divmod(total_mins, 1440)
    hours, mins = divmod(rem_mins, 60)
    if days > 0:
        return f"{days}d {hours}h {mins}m"
    if hours > 0:
        return f"{hours}h {mins}m"
    return f"{mins}m"


def _read_temperature(sys_roots: Sequence[str]) -> Optional[float]:
    for root in sys_roots:
        thermal_dir = Path(root) / "class" / "thermal"
        if not thermal_dir.is_dir():
            continue
        for zone in sorted(thermal_dir.glob("thermal_zone*")):
            raw_temp = _read_text(zone / "temp")
            if raw_temp and raw_temp.lstrip("-").isdigit():
                val = int(raw_temp)
                # Linux thermal_zone reports millidegrees Celsius
                temp_c = val / 1000.0 if val > 200 else float(val)
                return round(temp_c, 1)
    return None


def _read_fan_status(sys_roots: Sequence[str]) -> Dict[str, Any]:
    for root in sys_roots:
        base = Path(root)
        # 1. Check hwmon fan*_input (RPM) or pwm1
        hwmon_dir = base / "class" / "hwmon"
        if hwmon_dir.is_dir():
            for hw in sorted(hwmon_dir.glob("hwmon*")):
                for fan_file in sorted(hw.glob("fan*_input")):
                    raw_rpm = _read_text(fan_file)
                    if raw_rpm and raw_rpm.isdigit():
                        rpm = int(raw_rpm)
                        return {
                            "fan_detected": True,
                            "fan_active": rpm > 0,
                            "fan_rpm": rpm,
                            "fan_level": None,
                            "fan_status": "Funcionando" if rpm > 0 else "En reposo",
                        }

        # 2. Check cooling_device* (e.g. Raspberry Pi 5 pwm-fan)
        thermal_dir = base / "class" / "thermal"
        if thermal_dir.is_dir():
            for cdev in sorted(thermal_dir.glob("cooling_device*")):
                dev_type = (_read_text(cdev / "type") or "").lower()
                if "fan" in dev_type:
                    cur_raw = _read_text(cdev / "cur_state")
                    max_raw = _read_text(cdev / "max_state")
                    cur_state = int(cur_raw) if cur_raw and cur_raw.isdigit() else 0
                    max_state = int(max_raw) if max_raw and max_raw.isdigit() else None
                    pct = (
                        round((cur_state / max_state) * 100)
                        if max_state and max_state > 0
                        else None
                    )
                    return {
                        "fan_detected": True,
                        "fan_active": cur_state > 0,
                        "fan_rpm": None,
                        "fan_level": pct if pct is not None else cur_state,
                        "fan_status": "Funcionando" if cur_state > 0 else "En reposo",
                    }

    return {
        "fan_detected": False,
        "fan_active": None,
        "fan_rpm": None,
        "fan_level": None,
        "fan_status": "No detectado",
    }


def fetch_raspberry_metrics(
    proc_root: str = "/proc",
    sys_roots: Sequence[str] = ("/host/sys", "/sys"),
) -> Dict[str, Any]:
    """Collect host CPU, RAM, load average, uptime, temperature, and fan status."""
    proc_path = Path(proc_root)
    if not proc_path.is_dir():
        return {
            "available": False,
            "cpu_percent": None,
            "cpu_cores": os.cpu_count() or 1,
            "load_1m": None,
            "ram_used_mb": None,
            "ram_total_mb": None,
            "ram_percent": None,
            "temperature_c": None,
            "uptime_formatted": None,
            "fan_detected": False,
            "fan_active": None,
            "fan_rpm": None,
            "fan_level": None,
            "fan_status": "No detectado",
        }

    # CPU % via two /proc/stat samples
    cpu_percent: Optional[float] = None
    first = _parse_proc_stat_cpu(proc_path)
    if first:
        time.sleep(0.25)
        second = _parse_proc_stat_cpu(proc_path)
        if second:
            total_delta = second[0] - first[0]
            idle_delta = second[1] - first[1]
            if total_delta > 0:
                cpu_percent = round(((total_delta - idle_delta) / total_delta) * 100.0, 1)

    # Load average
    load_1m: Optional[float] = None
    load_raw = _read_text(proc_path / "loadavg")
    if load_raw:
        try:
            load_1m = round(float(load_raw.split()[0]), 2)
        except (ValueError, IndexError):
            load_1m = None

    # RAM from /proc/meminfo
    ram_total_mb: Optional[float] = None
    ram_used_mb: Optional[float] = None
    ram_percent: Optional[float] = None
    mem_raw = _read_text(proc_path / "meminfo")
    if mem_raw:
        mem_kv: Dict[str, int] = {}
        for line in mem_raw.splitlines():
            if ":" not in line:
                continue
            k, rest = line.split(":", 1)
            tokens = rest.strip().split()
            if tokens and tokens[0].isdigit():
                mem_kv[k] = int(tokens[0])  # in kB
        total_kb = mem_kv.get("MemTotal")
        avail_kb = mem_kv.get("MemAvailable")
        if avail_kb is None and "MemFree" in mem_kv:
            avail_kb = mem_kv["MemFree"] + mem_kv.get("Buffers", 0) + mem_kv.get("Cached", 0)
        if total_kb and total_kb > 0 and avail_kb is not None:
            used_kb = max(0, total_kb - avail_kb)
            ram_total_mb = round(total_kb / 1024.0, 1)
            ram_used_mb = round(used_kb / 1024.0, 1)
            ram_percent = round((used_kb / total_kb) * 100.0, 1)

    # Uptime
    uptime_formatted: Optional[str] = None
    uptime_raw = _read_text(proc_path / "uptime")
    if uptime_raw:
        try:
            uptime_secs = float(uptime_raw.split()[0])
            uptime_formatted = _format_uptime(uptime_secs)
        except (ValueError, IndexError):
            uptime_formatted = None

    temp_c = _read_temperature(sys_roots)
    fan_info = _read_fan_status(sys_roots)

    return {
        "available": ram_total_mb is not None or temp_c is not None,
        "cpu_percent": cpu_percent,
        "cpu_cores": os.cpu_count() or 1,
        "load_1m": load_1m,
        "ram_used_mb": ram_used_mb,
        "ram_total_mb": ram_total_mb,
        "ram_percent": ram_percent,
        "temperature_c": temp_c,
        "uptime_formatted": uptime_formatted,
        **fan_info,
    }


def compute_container_usage(
    stats: Dict[str, Any],
) -> Tuple[float, Optional[float], Optional[float], Optional[float]]:
    """Compute (cpu_percent, mem_mb, mem_limit_mb, mem_percent) from Docker stats JSON."""
    cpu_stats = stats.get("cpu_stats") or {}
    precpu_stats = stats.get("precpu_stats") or {}
    cpu_usage = cpu_stats.get("cpu_usage") or {}
    precpu_usage = precpu_stats.get("cpu_usage") or {}

    cpu_delta = (cpu_usage.get("total_usage") or 0) - (precpu_usage.get("total_usage") or 0)
    system_delta = (cpu_stats.get("system_cpu_usage") or 0) - (
        precpu_stats.get("system_cpu_usage") or 0
    )
    online_cpus = (
        cpu_stats.get("online_cpus")
        or len(cpu_usage.get("percpu_usage") or [])
        or 1
    )
    cpu_percent = (
        round((cpu_delta / system_delta) * online_cpus * 100.0, 2)
        if system_delta > 0 and cpu_delta >= 0
        else 0.0
    )

    mem_stats = stats.get("memory_stats") or {}
    raw_usage = mem_stats.get("usage")
    if raw_usage is None:
        return cpu_percent, None, None, None

    detailed = mem_stats.get("stats") or {}
    cache = detailed.get("inactive_file") or detailed.get("cache") or 0
    used_bytes = max(0, raw_usage - cache)
    limit_bytes = mem_stats.get("limit") or 0

    mem_mb = round(used_bytes / (1024 * 1024), 1)
    mem_limit_mb = round(limit_bytes / (1024 * 1024), 1) if limit_bytes > 0 else None
    mem_percent = round((used_bytes / limit_bytes) * 100.0, 2) if limit_bytes > 0 else None
    return cpu_percent, mem_mb, mem_limit_mb, mem_percent


def _docker_get_json(socket_path: str, path: str, timeout: float = 5.0) -> Any:
    conn = _UnixSocketHTTPConnection(socket_path, timeout=timeout)
    try:
        conn.request("GET", path)
        resp = conn.getresponse()
        body = resp.read().decode("utf-8", errors="ignore")
        if resp.status >= 400:
            raise RuntimeError(f"Docker socket HTTP {resp.status}: {body[:200]}")
        return json.loads(body)
    finally:
        conn.close()


def fetch_docker_container_stats(
    socket_path: str = "/var/run/docker.sock",
) -> List[Dict[str, Any]]:
    """Query local Docker Engine socket for per-container CPU and RAM usage."""
    if not hasattr(socket, "AF_UNIX") or not Path(socket_path).exists():
        return []

    try:
        containers = _docker_get_json(socket_path, "/containers/json", timeout=4.0)
        if not isinstance(containers, list):
            return []

        def _inspect_one(c: Dict[str, Any]) -> Dict[str, Any]:
            cid = str(c.get("Id") or "")
            names = c.get("Names") or []
            name = str(names[0]).lstrip("/") if names else cid[:12]
            stats = _docker_get_json(
                socket_path, f"/containers/{cid}/stats?stream=false", timeout=5.0
            )
            cpu_pct, mem_mb, mem_limit_mb, mem_pct = compute_container_usage(stats)
            return {
                "container_id": cid[:12],
                "name": name,
                "image": c.get("Image") or "",
                "state": c.get("State") or "running",
                "status": c.get("Status") or "",
                "cpu_percent": cpu_pct,
                "memory_mb": mem_mb,
                "memory_limit_mb": mem_limit_mb,
                "memory_percent": mem_pct,
            }

        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(_inspect_one, containers))
        results.sort(
            key=lambda x: (x.get("memory_mb") or 0.0, x.get("cpu_percent") or 0.0),
            reverse=True,
        )
        return results
    except Exception:
        return []
