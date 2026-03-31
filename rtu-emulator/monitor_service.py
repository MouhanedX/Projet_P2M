import asyncio
import random
import logging
from datetime import datetime
from typing import Dict, List
from models import RouteInfo, TraceStatus, OTDRTestReport
from otdr_simulator import OTDRSimulator
from alarm_service import AlarmService
from ems_client import EMSClient
from mongodb_service import MongoDBService
from kpi_service import KpiService
from config import settings

logger = logging.getLogger(__name__)


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
        self.kpi_send_counter = 0  # Track KPI sending frequency
        
        # Initialize routes
        self._initialize_routes()
    
    def _initialize_routes(self):
        """Initialize route information from database or configuration."""
        if settings.use_database_rtu:
            # Fetch routes from MongoDB for this RTU
            logger.info(f"Fetching routes from database for RTU {self.rtu_id}")
            db_routes = self.db_service.fetch_routes_for_rtu(self.rtu_id)
            
            for route_data in db_routes:
                route_id = route_data.get("routeId", route_data.get("id"))
                distance_km = route_data.get("distanceKm", 25)
                
                self.routes[route_id] = RouteInfo(
                    route_id=route_id,
                    region=route_data.get("name", f"Route {route_id}"),
                    fiber_length_km=distance_km,
                    splice_count=random.randint(3, 8),  # Simulate splice count
                    current_status=TraceStatus.UNKNOWN,
                    active_alarms=0
                )
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
        
        logger.info(f"Initialized {len(self.routes)} routes for monitoring on RTU {self.rtu_id}")
    
    async def start_monitoring(self):
        """Start the periodic monitoring process."""
        if self.is_running:
            logger.warning("Monitoring already running")
            return
        
        self.is_running = True
        logger.info(f"Starting monitoring with interval {settings.monitoring_interval}s")
        
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
                # Test all routes
                await self.test_all_routes()
                
                # Generate and send KPIs periodically (every 5th iteration)
                self.kpi_send_counter += 1
                if self.kpi_send_counter % 5 == 0:
                    await self._generate_and_send_kpis()
                
                # Wait for next interval
                await asyncio.sleep(settings.monitoring_interval)
            
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
                await self.test_route(route_id)
                # Small delay between tests
                await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"Error testing route {route_id}: {str(e)}")
    
    async def test_route(self, route_id: str, test_mode: str = "Auto"):
        """
        Test a specific route and generate alarms if needed.
        
        Args:
            route_id: ID of the route to test
        """
        if route_id not in self.routes:
            raise ValueError(f"Unknown route: {route_id}")
        
        logger.info(f"Testing route {route_id}")
        
        # Determine if we should inject a fault (for simulation)
        fault_scenario = self._select_fault_scenario()
        inject_fault = fault_scenario != "normal"
        
        # Generate OTDR trace
        route_info = self.routes[route_id]
        trace = self.otdr.generate_trace(
            route_id=route_id,
            inject_fault=inject_fault,
            fault_type=fault_scenario,
            distance_km=route_info.fiber_length_km
        )
        
        # Update route info
        route_info = self.routes[route_id]
        route_info.last_test_time = datetime.now()
        route_info.current_status = trace.status
        
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

        test_report = OTDRTestReport(
            route_id=route_id,
            rtu_id=self.rtu_id,
            test_mode=test_mode,
            pulse_width_ns=random.choice([100, 300, 1000, 3000]),
            dynamic_range_db=round(random.uniform(28.0, 40.0), 2),
            wavelength_nm=random.choice([1310, 1550, 1625]),
            test_result="Pass" if trace.status == TraceStatus.NORMAL else "Fail",
            total_loss_db=trace.total_loss_db,
            event_count=len(trace.events),
            fault_distance_km=fault_distance_km,
            status=trace.status.value,
            measured_at=datetime.now()
        )

        await self.ems_client.send_test_report(test_report)
        
        # Analyze trace and generate alarm if needed
        alarm = self.alarm_service.analyze_trace(trace)
        
        if alarm:
            logger.warning(
                f"Alarm generated for route {route_id}: "
                f"{alarm.alarm_type.value} ({alarm.severity.value})"
            )
            
            # Convert alarm to dict for storage
            alarm_dict = alarm.model_dump(mode='json')
            
            # Store alarm in MongoDB
            self.db_service.insert_alarm(alarm_dict)
            
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
    
    def _select_fault_scenario(self) -> str:
        """
        Randomly select a fault scenario for simulation - increased fault injection for alarms every minute.
        
        Returns:
            Scenario type: 'normal', 'degradation', 'break', 'high_loss_splice'
        """
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
            "power_supply": self.power_supply,
            "temperature_c": round(self.temperature_c, 2),
            "temperature_state": temperature_state,
            "otdr_availability": self.otdr_availability
        }
    
    def get_route_info(self, route_id: str) -> RouteInfo:
        """Get information for a specific route."""
        if route_id not in self.routes:
            raise ValueError(f"Unknown route: {route_id}")
        return self.routes[route_id]
    
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
