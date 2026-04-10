import httpx
import asyncio
import logging
from datetime import timezone
from typing import Optional
from models import Alarm, OTDRTestReport, Kpi
from config import settings

logger = logging.getLogger(__name__)


class EMSClient:
    """Client for communicating with EMS (Element Management System)."""
    
    def __init__(self):
        self.ems_url = settings.ems_url
        self.timeout = settings.ems_connection_timeout
        self.internal_api_key = settings.ems_internal_api_key
        self.max_retries = 3
        self.retry_delay = 2  # seconds

    def _auth_headers(self) -> dict:
        return {"X-Internal-Api-Key": self.internal_api_key}
    
    async def send_alarm(self, alarm: Alarm) -> bool:
        """
        Send alarm to EMS with retry logic.
        
        Args:
            alarm: Alarm object to send
        
        Returns:
            True if successfully sent, False otherwise
        """
        endpoint = f"{self.ems_url}/api/alarms"
        
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    # Convert alarm to dict and exclude trace_data if too large
                    alarm_dict = alarm.model_dump(mode='json')
                    
                    # Send POST request
                    response = await client.post(endpoint, json=alarm_dict, headers=self._auth_headers())
                    
                    if response.status_code in [200, 201]:
                        logger.info(
                            f"Alarm {alarm.alarm_id} sent successfully to EMS "
                            f"(attempt {attempt + 1}/{self.max_retries})"
                        )
                        return True
                    else:
                        logger.warning(
                            f"EMS returned status {response.status_code} "
                            f"for alarm {alarm.alarm_id}"
                        )
            
            except httpx.ConnectError:
                logger.error(
                    f"Failed to connect to EMS at {endpoint} "
                    f"(attempt {attempt + 1}/{self.max_retries})"
                )
            except httpx.TimeoutException:
                logger.error(
                    f"Timeout connecting to EMS "
                    f"(attempt {attempt + 1}/{self.max_retries})"
                )
            except Exception as e:
                logger.error(
                    f"Error sending alarm to EMS: {str(e)} "
                    f"(attempt {attempt + 1}/{self.max_retries})"
                )
            
            # Wait before retry (except on last attempt)
            if attempt < self.max_retries - 1:
                await asyncio.sleep(self.retry_delay)
        
        logger.error(f"Failed to send alarm {alarm.alarm_id} after {self.max_retries} attempts")
        return False
    
    async def check_connection(self) -> bool:
        """
        Check if EMS is reachable.
        
        Returns:
            True if EMS is accessible, False otherwise
        """
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                health_paths = [
                    "/actuator/health",
                    "/api/health",
                    "/health"
                ]

                for path in health_paths:
                    try:
                        response = await client.get(f"{self.ems_url}{path}")
                        if response.status_code == 200:
                            return True
                    except Exception:
                        continue

                return False
        except Exception as e:
            logger.debug(f"EMS health check failed: {str(e)}")
            return False
    
    async def send_heartbeat(self, rtu_status: dict) -> bool:
        """
        Send RTU heartbeat to EMS.
        
        Args:
            rtu_status: Dictionary with RTU status information
        
        Returns:
            True if successfully sent, False otherwise
        """
        try:
            endpoint = f"{self.ems_url}/api/rtu/heartbeat"
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.post(endpoint, json=rtu_status, headers=self._auth_headers())
                return response.status_code in [200, 201]
        except Exception as e:
            logger.debug(f"Heartbeat send failed: {str(e)}")
            return False

    async def send_test_report(self, report: OTDRTestReport) -> bool:
        """
        Send normalized OTDR test report to EMS.
        """
        endpoint = f"{self.ems_url}/api/routes/telemetry"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                measured_at_utc = report.measured_at
                if measured_at_utc.tzinfo is None:
                    measured_at_utc = measured_at_utc.replace(tzinfo=timezone.utc)
                measured_at_iso = measured_at_utc.isoformat().replace("+00:00", "Z")

                payload = {
                    "routeId": report.route_id,
                    "rtuId": report.rtu_id,
                    "testMode": report.test_mode,
                    "pulseWidthNs": report.pulse_width_ns,
                    "dynamicRangeDb": report.dynamic_range_db,
                    "wavelengthNm": report.wavelength_nm,
                    "testResult": report.test_result,
                    "totalLossDb": report.total_loss_db,
                    "eventCount": report.event_count,
                    "faultDistanceKm": report.fault_distance_km,
                    "status": report.status,
                    "measuredAt": measured_at_iso,
                    "eventReferenceFile": report.event_reference_file,
                    "measurementReferenceFile": report.measurement_reference_file,
                    "averagePowerDb": report.average_power_db,
                    "powerVariationDb": report.power_variation_db,
                }
                
                # Add RTU health metrics if available
                if report.rtu_health:
                    payload["rtuHealth"] = {
                        "temperatureC": report.rtu_health.temperature_c,
                        "cpuUsagePercent": report.rtu_health.cpu_usage_percent,
                        "memoryUsagePercent": report.rtu_health.memory_usage_percent,
                        "powerSupplyStatus": report.rtu_health.power_supply_status,
                    }
                response = await client.post(endpoint, json=payload, headers=self._auth_headers())
                if response.status_code not in [200, 201]:
                    logger.warning(
                        f"Telemetry rejected by EMS with status {response.status_code}: {response.text}"
                    )
                return response.status_code in [200, 201]
        except Exception as e:
            logger.debug(f"Failed to send test report: {str(e)}")
            return False
    
    async def send_kpi(self, kpi: Kpi) -> bool:
        """
        Send KPI to EMS.
        
        Args:
            kpi: KPI object to send
        
        Returns:
            True if successfully sent, False otherwise
        """
        endpoint = f"{self.ems_url}/api/kpis"
        
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    kpi_dict = kpi.model_dump(mode='json')
                    response = await client.post(endpoint, json=kpi_dict, headers=self._auth_headers())
                    
                    if response.status_code in [200, 201]:
                        logger.info(
                            f"KPI {kpi.kpi_id} sent successfully to EMS "
                            f"(attempt {attempt + 1}/{self.max_retries})"
                        )
                        return True
                    else:
                        logger.warning(
                            f"EMS returned status {response.status_code} "
                            f"for KPI {kpi.kpi_id}"
                        )
            
            except httpx.ConnectError:
                logger.error(
                    f"Failed to connect to EMS at {endpoint} "
                    f"(attempt {attempt + 1}/{self.max_retries})"
                )
            except httpx.TimeoutException:
                logger.error(
                    f"Timeout connecting to EMS "
                    f"(attempt {attempt + 1}/{self.max_retries})"
                )
            except Exception as e:
                logger.error(
                    f"Error sending KPI to EMS: {str(e)} "
                    f"(attempt {attempt + 1}/{self.max_retries})"
                )
            
            if attempt < self.max_retries - 1:
                await asyncio.sleep(self.retry_delay)
        
        logger.error(f"Failed to send KPI {kpi.kpi_id} after {self.max_retries} attempts")
        return False

    async def get_active_alarms_by_route(self, route_id: str) -> list[dict]:
        """Fetch active alarms for a route from EMS backend."""
        endpoint = f"{self.ems_url}/api/alarms/route/{route_id}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(endpoint, headers=self._auth_headers())
                if response.status_code != 200:
                    logger.warning(
                        "Failed to fetch route alarms from EMS for %s (status=%s)",
                        route_id,
                        response.status_code,
                    )
                    return []

                alarms = response.json() or []
                return [
                    a for a in alarms
                    if str(a.get("status", "")).upper() in {"ACTIVE", "ACKNOWLEDGED"}
                ]
        except Exception as e:
            logger.error("Error fetching active alarms for route %s: %s", route_id, str(e))
            return []

    async def resolve_alarm(self, alarm_id: str, resolved_by: str, notes: str) -> bool:
        """Resolve one alarm in EMS backend."""
        endpoint = f"{self.ems_url}/api/alarms/{alarm_id}/resolve"
        payload = {
            "resolvedBy": resolved_by,
            "resolutionNotes": notes,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(endpoint, json=payload, headers=self._auth_headers())
                return response.status_code in [200, 201]
        except Exception as e:
            logger.error("Error resolving alarm %s: %s", alarm_id, str(e))
            return False

    async def resolve_active_alarms_for_route(self, route_id: str, resolved_by: str, notes: str) -> int:
        """Resolve all active alarms for a route. Returns number of resolved alarms."""
        alarms = await self.get_active_alarms_by_route(route_id)
        resolved_count = 0

        for alarm in alarms:
            alarm_id = alarm.get("alarmId") or alarm.get("alarm_id") or alarm.get("id")
            if not alarm_id:
                continue

            if await self.resolve_alarm(alarm_id, resolved_by, notes):
                resolved_count += 1

        return resolved_count
