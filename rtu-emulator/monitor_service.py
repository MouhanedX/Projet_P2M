import asyncio
import random
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Optional
from models import RouteInfo, TraceStatus, OTDRTestReport
from otdr_simulator import OTDRSimulator
from alarm_service import AlarmService
from ems_client import EMSClient
from mongodb_service import MongoDBService
from kpi_service import KpiService
from config import settings

logger = logging.getLogger(__name__)


@dataclass
class ManualFaultState:
    fault_type: str
    locked_failure_power_db: Optional[float] = None
    attenuation_db: Optional[float] = None


class MonitorService:
    """Service for periodic fiber monitoring."""
    
    def __init__(self, rtu_id: str):
        self.rtu_id = rtu_id
        self.otdr = OTDRSimulator(rtu_id)
        self.alarm_service = AlarmService(rtu_id)
        self.ems_client = EMSClient()
        self.db_service = MongoDBService(settings.mongodb_uri)
        self.kpi_service = KpiService(self.db_service)
        
        self.is_running = False
        self.routes: Dict[str, RouteInfo] = {}
        self.monitoring_task = None
        self.alarms_sent_today = 0
        self.temperature_c = 34.5
        self.power_supply = "Normal"
        self.otdr_availability = "Ready"
        self.test_mode = self._normalize_test_mode(settings.otdr_test_mode)
        self.test_period_seconds = max(30, int(settings.otdr_test_period_seconds))
        self.next_auto_test_at = None
        self.next_kpi_at = None
        self.manual_faults: Dict[str, ManualFaultState] = {}
        self.last_normal_power_db: Dict[str, float] = {}
        self.route_wavelength_nm: Dict[str, int] = {}
        
        # Initialize routes
        self._initialize_routes()
    
    def _initialize_routes(self):
        """Initialize route information from database or configuration."""
        def extract_distance_km(route_data: dict) -> float:
            # Support both legacy and current route schemas.
            direct = route_data.get("distanceKm")
            if isinstance(direct, (int, float)):
                return float(direct)

            fiber_spec = route_data.get("fiberSpec") or {}
            fiber_length = fiber_spec.get("lengthKm")
            if isinstance(fiber_length, (int, float)):
                return float(fiber_length)

            return 25.0

        def extract_wavelength_nm(route_data: dict) -> int:
            direct_wavelength = route_data.get("wavelengthNm")
            if isinstance(direct_wavelength, (int, float)):
                return int(direct_wavelength)

            current_condition = route_data.get("currentCondition") or route_data.get("current_condition") or {}
            condition_wavelength = current_condition.get("wavelengthNm") or current_condition.get("wavelength_nm")
            if isinstance(condition_wavelength, (int, float)):
                return int(condition_wavelength)

            return 1550

        if settings.use_database_rtu:
            # Fetch routes from MongoDB for this RTU
            logger.info(f"Fetching routes from database for RTU {self.rtu_id}")
            db_routes = self.db_service.fetch_routes_for_rtu(self.rtu_id)
            
            for route_data in db_routes:
                route_id = (
                    route_data.get("routeId")
                    or route_data.get("route_id")
                    or route_data.get("id")
                    or (str(route_data.get("_id")) if route_data.get("_id") is not None else None)
                )

                if route_id is None:
                    logger.warning(f"Skipping route with missing identifier for RTU {self.rtu_id}: {route_data}")
                    continue

                route_id = str(route_id).strip()
                if not route_id:
                    logger.warning(f"Skipping route with blank identifier for RTU {self.rtu_id}: {route_data}")
                    continue

                distance_km = extract_distance_km(route_data)
                wavelength_nm = extract_wavelength_nm(route_data)
                
                self.routes[route_id] = RouteInfo(
                    route_id=route_id,
                    region=route_data.get("region", route_data.get("routeName", f"Route {route_id}")),
                    fiber_length_km=distance_km,
                    splice_count=random.randint(3, 8),  # Simulate splice count
                    current_status=TraceStatus.UNKNOWN,
                    active_alarms=0
                )
                self.route_wavelength_nm[route_id] = wavelength_nm
                logger.info(f"Added route {route_id} ({distance_km} km) for RTU {self.rtu_id}")
        else:
            # Use legacy configuration-based routes
            configured_routes = settings.get_routes_list()
            
            for route_id in configured_routes:
                config = OTDRSimulator.get_route_config(route_id)
                if config:
                    self.routes[route_id] = RouteInfo(
                        route_id=route_id,
                        region=config["region"],
                        fiber_length_km=config["length_km"],
                        splice_count=config["splice_count"],
                        current_status=TraceStatus.UNKNOWN,
                        active_alarms=0
                    )
                    self.route_wavelength_nm[route_id] = 1550
        
        logger.info(f"Initialized {len(self.routes)} routes for monitoring on RTU {self.rtu_id}")
    
    async def start_monitoring(self):
        """Start the periodic monitoring process."""
        if self.is_running:
            logger.warning("Monitoring already running")
            return
        
        self.is_running = True
        logger.info(f"Starting monitoring with interval {settings.monitoring_interval}s")

        now = datetime.now()
        self.next_auto_test_at = now + timedelta(seconds=self.test_period_seconds)
        self.next_kpi_at = now + timedelta(seconds=max(60, settings.monitoring_interval * 5))
        
        # Create background task
        self.monitoring_task = asyncio.create_task(self._monitoring_loop())
    
    async def stop_monitoring(self):
        """Stop the monitoring process."""
        if not self.is_running:
            logger.warning("Monitoring not running")
            return
        
        self.is_running = False
        
        if self.monitoring_task:
            self.monitoring_task.cancel()
            try:
                await self.monitoring_task
            except asyncio.CancelledError:
                pass
        
        logger.info("Monitoring stopped")
    
    async def _monitoring_loop(self):
        """Main monitoring loop."""
        while self.is_running:
            try:
                now = datetime.now()

                if self.test_mode == "auto" and self.next_auto_test_at and now >= self.next_auto_test_at:
                    await self.test_all_routes()
                    self.next_auto_test_at = datetime.now() + timedelta(seconds=self.test_period_seconds)

                if self.next_kpi_at and now >= self.next_kpi_at:
                    await self._generate_and_send_kpis()
                    self.next_kpi_at = datetime.now() + timedelta(seconds=max(60, settings.monitoring_interval * 5))

                await asyncio.sleep(1)
            
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in monitoring loop: {str(e)}")
                await asyncio.sleep(10)  # Brief pause before retry
    
    async def test_all_routes(self):
        """Test all configured routes."""
        logger.info("Starting periodic test of all routes")
        
        for route_id in self.routes.keys():
            try:
                # Periodic checks update telemetry/KPIs only.
                # Alarm generation is now controlled manually from the test interface.
                await self.test_route(route_id, test_mode="AutoPeriodic", generate_alarm=False)
                # Small delay between tests
                await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"Error testing route {route_id}: {str(e)}")
    
    async def test_route(
        self,
        route_id: str,
        test_mode: str = "Auto",
        forced_fault: str | None = None,
        generate_alarm: bool = True,
        send_test_report: bool = True,
    ) -> OTDRTestReport:
        """
        Test a specific route and generate alarms if needed.
        
        Args:
            route_id: ID of the route to test
        """
        if route_id not in self.routes:
            raise ValueError(f"Unknown route: {route_id}")
        
        logger.info(f"Testing route {route_id}")

        manual_fault_state = await self._get_active_manual_fault_state(route_id)
        
        # Fault source precedence:
        # 1) explicit forced fault for this call
        # 2) persistent manual fault set by test interface
        # 3) automatic random generation (if enabled)
        if forced_fault is not None:
            fault_scenario = self._normalize_fault_type(forced_fault)
        elif manual_fault_state:
            fault_scenario = manual_fault_state.fault_type
        elif settings.auto_fault_generation:
            fault_scenario = self._select_fault_scenario()
        else:
            fault_scenario = "normal"

        inject_fault = fault_scenario != "normal"
        fixed_fault_power_db = None
        fault_power_penalty_db = None
        if inject_fault and manual_fault_state and fault_scenario == "break":
            if manual_fault_state.locked_failure_power_db is not None:
                fixed_fault_power_db = manual_fault_state.locked_failure_power_db
            elif manual_fault_state.attenuation_db is not None:
                baseline_power = self.last_normal_power_db.get(route_id)
                if baseline_power is not None:
                    fixed_fault_power_db = round(
                        max(0.0, baseline_power - manual_fault_state.attenuation_db),
                        3,
                    )

        if inject_fault and manual_fault_state and manual_fault_state.attenuation_db is not None:
            fault_power_penalty_db = manual_fault_state.attenuation_db
        
        # Generate OTDR trace
        route_info = self.routes[route_id]
        trace = self.otdr.generate_trace(
            route_id=route_id,
            inject_fault=inject_fault,
            fault_type=fault_scenario,
            distance_km=route_info.fiber_length_km,
            fixed_fault_power_db=fixed_fault_power_db,
            fault_power_penalty_db=fault_power_penalty_db,
        )

        if (
            inject_fault
            and manual_fault_state
            and fault_scenario == "break"
            and manual_fault_state.locked_failure_power_db is None
            and trace.status == TraceStatus.BREAK
            and trace.average_power_db is not None
        ):
            # Persist the first failed-power value so subsequent tests reuse it.
            manual_fault_state.locked_failure_power_db = trace.average_power_db
        
        # Update route info
        route_info = self.routes[route_id]
        route_info.last_test_time = datetime.now()
        route_info.current_status = trace.status
        if trace.status == TraceStatus.NORMAL and trace.average_power_db is not None:
            self.last_normal_power_db[route_id] = trace.average_power_db
        
        logger.info(
            f"Route {route_id} test complete: "
            f"status={trace.status.value}, "
            f"loss={trace.total_loss_db} dB, "
            f"events={len(trace.events)}"
        )

        self._simulate_rtu_health()

        fault_distance_km = None
        if trace.events:
            fault_distance_km = max(trace.events, key=lambda e: e.loss_db).distance_km

        report_power_variation_db = trace.power_variation_db
        if inject_fault and manual_fault_state and manual_fault_state.attenuation_db is not None:
            report_power_variation_db = round(manual_fault_state.attenuation_db, 3)

        test_report = OTDRTestReport(
            route_id=route_id,
            rtu_id=self.rtu_id,
            test_mode=test_mode,
            pulse_width_ns=random.choice([100, 300, 1000, 3000]),
            dynamic_range_db=round(random.uniform(28.0, 40.0), 2),
            wavelength_nm=self.route_wavelength_nm.get(route_id, 1550),
            test_result="Pass" if trace.status == TraceStatus.NORMAL else "Fail",
            total_loss_db=trace.total_loss_db,
            event_count=len(trace.events),
            fault_distance_km=fault_distance_km,
            status=trace.status.value,
            measured_at=datetime.now(),
            event_reference_file=trace.event_reference_file,
            measurement_reference_file=trace.measurement_reference_file,
            average_power_db=trace.average_power_db,
            power_variation_db=report_power_variation_db,
            rtu_health=trace.rtu_health,
        )

        if send_test_report:
            await self.ems_client.send_test_report(test_report)
        
        if generate_alarm:
            # Analyze trace and generate alarm if needed
            alarm = self.alarm_service.analyze_trace(trace)

            if alarm:
                logger.warning(
                    f"Alarm generated for route {route_id}: "
                    f"{alarm.alarm_type.value} ({alarm.severity.value})"
                )

                # Send alarm to EMS
                success = await self.ems_client.send_alarm(alarm)

                if success:
                    self.alarms_sent_today += 1
                    route_info.active_alarms += 1
                    logger.info(f"Alarm {alarm.alarm_id} sent to EMS successfully")
                else:
                    logger.error(f"Failed to send alarm {alarm.alarm_id} to EMS")

            else:
                # No alarm, clear active alarms if route is normal
                if trace.status == TraceStatus.NORMAL:
                    route_info.active_alarms = 0
        elif trace.status == TraceStatus.NORMAL:
            route_info.active_alarms = 0

        return test_report

    async def trigger_manual_fault(
        self,
        route_id: str,
        fault_type: str = "break",
        duration_seconds: Optional[int] = None,
        attenuation_db: Optional[float] = None,
        generate_alarm: bool = True,
        send_test_report: bool = True,
    ) -> dict:
        """Inject a persistent fault on a route and raise one alarm immediately."""
        if route_id not in self.routes:
            raise ValueError(f"Unknown route: {route_id}")

        normalized_attenuation = None
        if attenuation_db is not None:
            if attenuation_db <= 0:
                raise ValueError("attenuationDb must be greater than 0")
            normalized_attenuation = float(attenuation_db)

        normalized_fault = self._normalize_fault_type(fault_type)
        normalized_duration = max(1, int(duration_seconds)) if duration_seconds is not None else None

        self.manual_faults[route_id] = ManualFaultState(
            fault_type=normalized_fault,
            locked_failure_power_db=None,
            attenuation_db=normalized_attenuation,
        )

        await self.test_route(
            route_id,
            test_mode="ManualFaultInjection",
            forced_fault=normalized_fault,
            generate_alarm=generate_alarm,
            send_test_report=send_test_report,
        )

        return {
            "route_id": route_id,
            "fault_type": normalized_fault,
            "status": self.routes[route_id].current_status.value,
            "duration_seconds": normalized_duration,
            "expires_at": None,
            "attenuation_db": normalized_attenuation,
        }

    async def resolve_manual_fault(self, route_id: str) -> dict:
        """Resolve a manually injected fault and clear active alarms for that route."""
        if route_id not in self.routes:
            raise ValueError(f"Unknown route: {route_id}")

        self.manual_faults.pop(route_id, None)

        resolved_count = await self.ems_client.resolve_active_alarms_for_route(
            route_id,
            resolved_by="test-interface",
            notes="Resolved from manual test interface",
        )

        await self.test_route(
            route_id,
            test_mode="ManualFaultResolution",
            forced_fault="normal",
            generate_alarm=False,
        )

        self.routes[route_id].current_status = TraceStatus.NORMAL
        self.routes[route_id].active_alarms = 0

        return {
            "route_id": route_id,
            "resolved_alarms": resolved_count,
            "status": self.routes[route_id].current_status.value,
        }

    async def _get_active_manual_fault_state(self, route_id: str) -> Optional[ManualFaultState]:
        state = self.manual_faults.get(route_id)
        if state is None:
            return None

        try:
            active_route_alarms = await self.ems_client.get_active_alarms_by_route(route_id)
        except Exception as e:
            # Keep existing fault active when EMS is temporarily unreachable.
            logger.warning("Failed to verify active alarms for route %s: %s", route_id, e)
            return state

        if not active_route_alarms:
            self.manual_faults.pop(route_id, None)

            if route_id in self.routes:
                self.routes[route_id].current_status = TraceStatus.NORMAL
                self.routes[route_id].active_alarms = 0

            return None

        return state

    def _normalize_fault_type(self, fault_type: str) -> str:
        value = (fault_type or "break").strip().lower()
        aliases = {
            "break": "break",
            "fiber_break": "break",
            "degradation": "degradation",
            "degrade": "degradation",
            "high_loss": "high_loss_splice",
            "high_loss_splice": "high_loss_splice",
            "normal": "normal",
        }
        return aliases.get(value, "break")

    def _normalize_test_mode(self, mode: str) -> str:
        value = (mode or "manual").strip().lower()
        return "auto" if value == "auto" else "manual"

    def get_test_config(self) -> dict:
        return {
            "mode": self.test_mode,
            "period_seconds": self.test_period_seconds,
            "next_auto_test_at": self.next_auto_test_at.isoformat() if self.next_auto_test_at else None,
        }

    def update_test_config(self, mode: str | None = None, period_seconds: int | None = None) -> dict:
        if mode is not None:
            self.test_mode = self._normalize_test_mode(mode)

        if period_seconds is not None:
            self.test_period_seconds = max(30, int(period_seconds))

        self.next_auto_test_at = datetime.now() + timedelta(seconds=self.test_period_seconds)
        return self.get_test_config()
    
    def _select_fault_scenario(self) -> str:
        """
        Randomly select a fault scenario for simulation - increased fault injection for alarms every minute.
        
        Returns:
            Scenario type: 'normal', 'degradation', 'break', 'high_loss_splice'
        """
        if not settings.auto_fault_generation:
            return "normal"

        # Probability distribution (increased to ensure alarms every minute)
        # 40% normal, 30% degradation, 18% break, 12% high loss splice
        rand = random.random()
        
        if rand < 0.40:
            return "normal"
        elif rand < 0.70:
            return "degradation"
        elif rand < 0.88:
            return "break"
        else:
            return "high_loss_splice"

    def _simulate_rtu_health(self):
        temp_delta = random.uniform(-0.4, 0.9)
        self.temperature_c = max(24.0, min(65.0, self.temperature_c + temp_delta))

        if random.random() < 0.01:
            self.power_supply = "Failure"
        elif random.random() < 0.20:
            self.power_supply = "Normal"

        if random.random() < 0.04:
            self.otdr_availability = "Busy"
        elif random.random() < 0.02:
            self.otdr_availability = "Fault"
        else:
            self.otdr_availability = "Ready"
    
    def get_status(self) -> dict:
        """Get current monitoring status."""
        temperature_state = "High" if self.temperature_c >= 55 else "OK"
        return {
            "is_monitoring": self.is_running,
            "routes": [route.model_dump() for route in self.routes.values()],
            "alarms_sent_today": self.alarms_sent_today,
            "manual_fault_routes": list(self.manual_faults.keys()),
            "power_supply": self.power_supply,
            "temperature_c": round(self.temperature_c, 2),
            "temperature_state": temperature_state,
            "otdr_availability": self.otdr_availability,
            "test_mode": self.test_mode,
            "test_period_seconds": self.test_period_seconds,
            "next_auto_test_at": self.next_auto_test_at.isoformat() if self.next_auto_test_at else None,
        }
    
    def get_route_info(self, route_id: str) -> RouteInfo:
        """Get information for a specific route."""
        if route_id not in self.routes:
            raise ValueError(f"Unknown route: {route_id}")
        return self.routes[route_id]

    def get_route_reference_profile(self, route_id: str, max_points: int = 1200) -> dict:
        """Return reference trace profile (distance-power points) for a route."""
        if route_id not in self.routes:
            raise ValueError(f"Unknown route: {route_id}")

        return self.otdr.get_reference_trace_profile(route_id, max_points=max_points)
    
    async def _generate_and_send_kpis(self):
        """Generate and send KPIs to EMS."""
        try:
            logger.info("Generating KPIs...")
            
            # Generate network health KPI
            network_kpi = await self.kpi_service.calculate_network_health_kpi()
            if network_kpi:
                # Store in local database
                self.db_service.insert_kpi(network_kpi.model_dump(mode='json'))
                # Send to EMS
                success = await self.ems_client.send_kpi(network_kpi)
                if success:
                    logger.info(f"Network health KPI {network_kpi.kpi_id} sent to EMS")
                else:
                    logger.warning(f"Failed to send network health KPI {network_kpi.kpi_id}")
            
            # Generate and send route-specific KPIs
            for route_id in list(self.routes.keys()):
                try:
                    route_kpi = await self.kpi_service.calculate_route_performance_kpi(route_id)
                    if route_kpi:
                        # Store in local database
                        self.db_service.insert_kpi(route_kpi.model_dump(mode='json'))
                        # Send to EMS
                        success = await self.ems_client.send_kpi(route_kpi)
                        if success:
                            logger.debug(f"Route KPI {route_kpi.kpi_id} for {route_id} sent to EMS")
                        else:
                            logger.warning(f"Failed to send route KPI {route_kpi.kpi_id}")
                except Exception as e:
                    logger.error(f"Error generating KPI for route {route_id}: {e}")
            
            # Generate alarm statistics KPI
            alarm_kpi = await self.kpi_service.calculate_alarm_statistics_kpi()
            if alarm_kpi:
                # Store in local database
                self.db_service.insert_kpi(alarm_kpi.model_dump(mode='json'))
                # Send to EMS
                success = await self.ems_client.send_kpi(alarm_kpi)
                if success:
                    logger.info(f"Alarm statistics KPI {alarm_kpi.kpi_id} sent to EMS")
                else:
                    logger.warning(f"Failed to send alarm statistics KPI {alarm_kpi.kpi_id}")
            
            # Generate availability KPI
            availability_kpi = await self.kpi_service.calculate_availability_kpi(self.rtu_id)
            if availability_kpi:
                # Store in local database
                self.db_service.insert_kpi(availability_kpi.model_dump(mode='json'))
                # Send to EMS
                success = await self.ems_client.send_kpi(availability_kpi)
                if success:
                    logger.info(f"Availability KPI {availability_kpi.kpi_id} sent to EMS")
                else:
                    logger.warning(f"Failed to send availability KPI {availability_kpi.kpi_id}")
        
        except Exception as e:
            logger.error(f"Error generating and sending KPIs: {e}")
