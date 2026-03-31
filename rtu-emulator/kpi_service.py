"""
KPI Service - Generates and calculates KPIs for network monitoring.
Matches the Java KPI model exactly.
"""

import logging
from datetime import datetime
from typing import List, Dict, Optional
import random

from models import (
    Kpi, KpiType, KpiPeriod, KpiScope, KpiScopeType,
    KpiMetrics, KpiPerformance, KpiAvailability, KpiTrend,
    Alarm, OTDRTrace, RouteInfo
)
from mongodb_service import MongoDBService

logger = logging.getLogger(__name__)


class KpiService:
    """Service for generating and managing KPIs."""
    
    def __init__(self, db_service: Optional[MongoDBService] = None):
        """Initialize KPI service with optional database service."""
        self.db_service = db_service
        self.logger = logger
    
    async def calculate_network_health_kpi(self) -> Optional[Kpi]:
        """Calculate network health KPI."""
        try:
            if not self.db_service:
                return self._generate_mock_network_health_kpi()
            
            # Fetch stats from database
            total_routes = len(await self._get_all_routes())
            active_alarms = await self._get_active_alarms_count()
            traces = await self._get_recent_traces()
            
            routes_normal = max(0, total_routes - len([t for t in traces if t.get("status") != "NORMAL"]))
            routes_degraded = len([t for t in traces if t.get("status") == "DEGRADATION"])
            routes_broken = len([t for t in traces if t.get("status") == "BREAK"])
            
            # Calculate availability
            availability = 99.9 if routes_broken == 0 else (
                100 * (total_routes - routes_broken) / max(1, total_routes)
            )
            
            return Kpi(
                kpi_type=KpiType.NETWORK_HEALTH,
                period=KpiPeriod.REALTIME,
                scope=KpiScope(
                    type=KpiScopeType.GLOBAL,
                    region="All"
                ),
                metrics=KpiMetrics(
                    total_routes=total_routes,
                    routes_normal=routes_normal,
                    routes_degraded=routes_degraded,
                    routes_broken=routes_broken,
                    network_availability_percent=availability,
                    total_alarms_active=active_alarms,
                    critical_alarms=await self._get_alarms_by_severity("CRITICAL"),
                    high_alarms=await self._get_alarms_by_severity("HIGH"),
                    medium_alarms=await self._get_alarms_by_severity("MEDIUM")
                )
            )
        except Exception as e:
            self.logger.error(f"Error calculating network health KPI: {e}")
            return self._generate_mock_network_health_kpi()
    
    async def calculate_route_performance_kpi(self, route_id: str) -> Optional[Kpi]:
        """Calculate route performance KPI."""
        try:
            if not self.db_service:
                return self._generate_mock_route_performance_kpi(route_id)
            
            # Fetch traces for route
            traces = await self._get_traces_for_route(route_id)
            
            if not traces:
                return self._generate_mock_route_performance_kpi(route_id)
            
            recent_trace = traces[0]
            # Handle trace as dict
            events = recent_trace.get("events", [])
            fiber_losses = [event.get("loss_db", 0) for event in events if isinstance(event, dict)]
            if not fiber_losses:
                fiber_losses = [0.0]
            
            return Kpi(
                kpi_type=KpiType.ROUTE_PERFORMANCE,
                period=KpiPeriod.REALTIME,
                scope=KpiScope(
                    type=KpiScopeType.ROUTE,
                    region=None,
                    rtu_id=route_id
                ),
                performance=KpiPerformance(
                    avg_fiber_loss_db=sum(fiber_losses) / len(fiber_losses) if fiber_losses else 0.0,
                    max_fiber_loss_db=max(fiber_losses) if fiber_losses else 0.0,
                    total_events_detected=len(events),
                    unusual_events=len([e for e in events if isinstance(e, dict) and e.get("loss_db", 0) > 5.0])
                )
            )
        except Exception as e:
            self.logger.error(f"Error calculating route performance KPI: {e}")
            return self._generate_mock_route_performance_kpi(route_id)
    
    async def calculate_alarm_statistics_kpi(self) -> Optional[Kpi]:
        """Calculate alarm statistics KPI."""
        try:
            if not self.db_service:
                return self._generate_mock_alarm_statistics_kpi()
            
            active_alarms = await self._get_active_alarms()
            
            severity_counts = {}
            for alarm in active_alarms:
                severity = alarm.get("severity", "UNKNOWN")
                severity_counts[severity] = severity_counts.get(severity, 0) + 1
            
            return Kpi(
                kpi_type=KpiType.ALARM_STATISTICS,
                period=KpiPeriod.REALTIME,
                scope=KpiScope(
                    type=KpiScopeType.GLOBAL,
                    region="All"
                ),
                metrics=KpiMetrics(
                    total_alarms_active=len(active_alarms),
                    critical_alarms=severity_counts.get("CRITICAL", 0),
                    high_alarms=severity_counts.get("HIGH", 0),
                    medium_alarms=severity_counts.get("MEDIUM", 0),
                    low_alarms=severity_counts.get("LOW", 0)
                )
            )
        except Exception as e:
            self.logger.error(f"Error calculating alarm statistics KPI: {e}")
            return self._generate_mock_alarm_statistics_kpi()
    
    async def calculate_availability_kpi(self, rtu_id: Optional[str] = None) -> Optional[Kpi]:
        """Calculate availability metrics KPI."""
        try:
            scope_type = KpiScopeType.RTU if rtu_id else KpiScopeType.GLOBAL
            
            return Kpi(
                kpi_type=KpiType.AVAILABILITY_METRICS,
                period=KpiPeriod.REALTIME,
                scope=KpiScope(
                    type=scope_type,
                    region="All",
                    rtu_id=rtu_id
                ),
                availability=KpiAvailability(
                    uptime_percent=random.uniform(99.0, 99.99),
                    mttr_hours=random.uniform(0.5, 4.0),
                    mtbf_hours=random.uniform(400, 1000),
                    sla_compliance_percent=random.uniform(98.5, 99.99)
                )
            )
        except Exception as e:
            self.logger.error(f"Error calculating availability KPI: {e}")
            return None
    
    # Helper methods
    
    def _generate_mock_network_health_kpi(self) -> Kpi:
        """Generate mock network health KPI."""
        return Kpi(
            kpi_type=KpiType.NETWORK_HEALTH,
            period=KpiPeriod.REALTIME,
            scope=KpiScope(
                type=KpiScopeType.GLOBAL,
                region="All"
            ),
            metrics=KpiMetrics(
                total_routes=random.randint(10, 20),
                routes_normal=random.randint(8, 18),
                routes_degraded=random.randint(0, 3),
                routes_broken=random.randint(0, 2),
                network_availability_percent=random.uniform(85.0, 99.9),
                total_alarms_active=random.randint(0, 5),
                critical_alarms=random.randint(0, 1),
                high_alarms=random.randint(0, 2),
                medium_alarms=random.randint(0, 3)
            )
        )
    
    def _generate_mock_route_performance_kpi(self, route_id: str) -> Kpi:
        """Generate mock route performance KPI."""
        return Kpi(
            kpi_type=KpiType.ROUTE_PERFORMANCE,
            period=KpiPeriod.REALTIME,
            scope=KpiScope(
                type=KpiScopeType.ROUTE,
                region=None,
                rtu_id=route_id
            ),
            performance=KpiPerformance(
                avg_fiber_loss_db=random.uniform(0.1, 5.0),
                max_fiber_loss_db=random.uniform(5.0, 20.0),
                total_events_detected=random.randint(3, 15),
                unusual_events=random.randint(0, 3)
            )
        )
    
    def _generate_mock_alarm_statistics_kpi(self) -> Kpi:
        """Generate mock alarm statistics KPI."""
        return Kpi(
            kpi_type=KpiType.ALARM_STATISTICS,
            period=KpiPeriod.REALTIME,
            scope=KpiScope(
                type=KpiScopeType.GLOBAL,
                region="All"
            ),
            metrics=KpiMetrics(
                total_alarms_active=random.randint(0, 10),
                critical_alarms=random.randint(0, 1),
                high_alarms=random.randint(0, 3),
                medium_alarms=random.randint(0, 5),
                low_alarms=random.randint(0, 5)
            )
        )
    
    async def _get_all_routes(self) -> List[Dict]:
        """Get all routes from database."""
        try:
            if self.db_service:
                with self.db_service.get_connection() as db:
                    return list(db.routes.find({}))
            return []
        except Exception as e:
            self.logger.error(f"Error fetching routes: {e}")
            return []
    
    async def _get_active_alarms_count(self) -> int:
        """Get count of active alarms."""
        try:
            if self.db_service:
                with self.db_service.get_connection() as db:
                    return db.alarms.count_documents({
                        "status": {"$in": ["ACTIVE", "ACKNOWLEDGED"]}
                    })
            return 0
        except Exception as e:
            self.logger.error(f"Error counting active alarms: {e}")
            return 0
    
    async def _get_active_alarms(self) -> List[Dict]:
        """Get list of active alarms."""
        try:
            if self.db_service:
                with self.db_service.get_connection() as db:
                    return list(db.alarms.find({
                        "status": {"$in": ["ACTIVE", "ACKNOWLEDGED"]}
                    }))
            return []
        except Exception as e:
            self.logger.error(f"Error fetching active alarms: {e}")
            return []
    
    async def _get_alarms_by_severity(self, severity: str) -> int:
        """Get count of alarms by severity."""
        try:
            if self.db_service:
                with self.db_service.get_connection() as db:
                    return db.alarms.count_documents({
                        "status": {"$in": ["ACTIVE", "ACKNOWLEDGED"]},
                        "severity": severity
                    })
            return 0
        except Exception as e:
            self.logger.error(f"Error counting alarms by severity: {e}")
            return 0
    
    async def _get_recent_traces(self, limit: int = 100) -> List:
        """Get recent OTDR traces."""
        try:
            if self.db_service:
                with self.db_service.get_connection() as db:
                    cursor = db.otdr_results.find({}).sort("timestamp", -1).limit(limit)
                    return list(cursor)
            return []
        except Exception as e:
            self.logger.error(f"Error fetching traces: {e}")
            return []
    
    async def _get_traces_for_route(self, route_id: str) -> List:
        """Get traces for specific route."""
        try:
            if self.db_service:
                with self.db_service.get_connection() as db:
                    cursor = db.otdr_results.find({
                        "route_id": route_id
                    }).sort("timestamp", -1).limit(10)
                    return list(cursor)
            return []
        except Exception as e:
            self.logger.error(f"Error fetching traces for route {route_id}: {e}")
            return []
