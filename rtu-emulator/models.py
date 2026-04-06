from datetime import datetime
from typing import List, Optional
from enum import Enum
from pydantic import BaseModel, Field
import uuid


class EventType(str, Enum):
    """Types of fiber events."""
    SPLICE = "splice"
    CONNECTOR = "connector"
    BREAK = "break"
    REFLECTION = "reflection"
    BEND = "bend"


class TraceStatus(str, Enum):
    """Overall status of fiber trace."""
    NORMAL = "NORMAL"
    DEGRADATION = "DEGRADATION"
    BREAK = "BREAK"
    UNKNOWN = "UNKNOWN"


class OTDREvent(BaseModel):
    """Represents a single event in OTDR trace."""
    type: EventType
    distance_km: float = Field(..., description="Distance from RTU in kilometers")
    loss_db: float = Field(..., description="Loss at this event in dB")
    reflection_db: Optional[float] = Field(None, description="Reflection loss if applicable")
    
    class Config:
        json_schema_extra = {
            "example": {
                "type": "splice",
                "distance_km": 5.3,
                "loss_db": 0.12,
                "reflection_db": None
            }
        }


class OTDRTrace(BaseModel):
    """Complete OTDR measurement trace."""
    trace_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    route_id: str
    rtu_id: str
    timestamp: datetime = Field(default_factory=datetime.now)
    fiber_length_km: float
    total_loss_db: float
    events: List[OTDREvent] = []
    status: TraceStatus
    measurement_duration_ms: int = Field(default=1000)
    event_reference_file: Optional[str] = None
    measurement_reference_file: Optional[str] = None
    average_power_db: Optional[float] = None
    power_variation_db: Optional[float] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "trace_id": "550e8400-e29b-41d4-a716-446655440000",
                "route_id": "OR_1",
                "rtu_id": "RTU_01",
                "timestamp": "2026-02-17T10:30:00",
                "fiber_length_km": 25.5,
                "total_loss_db": 5.8,
                "events": [
                    {"type": "splice", "distance_km": 5.3, "loss_db": 0.12},
                    {"type": "connector", "distance_km": 12.7, "loss_db": 0.35},
                    {"type": "break", "distance_km": 20.1, "loss_db": 18.5}
                ],
                "status": "BREAK",
                "measurement_duration_ms": 1000
            }
        }


class AlarmType(str, Enum):
    """Types of alarms that can be raised."""
    FIBER_FAULT = "FIBER_FAULT"
    FIBER_BREAK = "FIBER_BREAK"
    DEGRADATION = "DEGRADATION"
    RTU_AVAILABILITY = "RTU_AVAILABILITY"
    HIGH_EVENT_LOSS = "HIGH_EVENT_LOSS"


class AlarmSeverity(str, Enum):
    """Severity levels for alarms."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AlarmStatus(str, Enum):
    """Status of an alarm."""
    ACTIVE = "ACTIVE"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"
    CLEARED = "CLEARED"
    SUPPRESSED = "SUPPRESSED"


class ServiceImpact(str, Enum):
    """Service impact level."""
    NONE = "NONE"
    MINOR = "MINOR"
    MODERATE = "MODERATE"
    MAJOR = "MAJOR"
    FULL_OUTAGE = "FULL_OUTAGE"


class KpiType(str, Enum):
    """Types of KPIs."""
    NETWORK_HEALTH = "NETWORK_HEALTH"
    ROUTE_PERFORMANCE = "ROUTE_PERFORMANCE"
    ALARM_STATISTICS = "ALARM_STATISTICS"
    RTU_PERFORMANCE = "RTU_PERFORMANCE"
    AVAILABILITY_METRICS = "AVAILABILITY_METRICS"


class KpiPeriod(str, Enum):
    """KPI periods."""
    REALTIME = "REALTIME"
    HOURLY = "HOURLY"
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"


class KpiScopeType(str, Enum):
    """KPI scope types."""
    GLOBAL = "GLOBAL"
    REGIONAL = "REGIONAL"
    RTU = "RTU"
    ROUTE = "ROUTE"


class KpiScope(BaseModel):
    """KPI scope information."""
    type: KpiScopeType
    region: Optional[str] = None
    rtu_id: Optional[str] = None


class KpiMetrics(BaseModel):
    """KPI metrics."""
    total_routes: int = 0
    routes_normal: int = 0
    routes_degraded: int = 0
    routes_broken: int = 0
    network_availability_percent: float = 99.9
    total_alarms_active: int = 0
    critical_alarms: int = 0
    high_alarms: int = 0
    medium_alarms: int = 0
    low_alarms: int = 0


class KpiPerformance(BaseModel):
    """KPI performance metrics."""
    avg_fiber_loss_db: float = 0.0
    max_fiber_loss_db: float = 0.0
    total_events_detected: int = 0
    unusual_events: int = 0


class KpiAvailability(BaseModel):
    """KPI availability metrics."""
    uptime_percent: float = 99.9
    mttr_hours: float = 1.0
    mtbf_hours: float = 720.0
    sla_compliance_percent: float = 99.9


class KpiTrend(BaseModel):
    """KPI trend information."""
    hour_over_hour_change_percent: float = 0.0
    day_over_day_change_percent: float = 0.0
    week_over_week_change_percent: float = 0.0


class Kpi(BaseModel):
    """Network KPI matching Java model exactly."""
    kpi_id: str = Field(default_factory=lambda: f"kpi-{str(uuid.uuid4())[:8]}")
    kpi_type: KpiType
    period: KpiPeriod
    timestamp: datetime = Field(default_factory=datetime.now)
    scope: Optional[KpiScope] = None
    metrics: Optional[KpiMetrics] = None
    performance: Optional[KpiPerformance] = None
    availability: Optional[KpiAvailability] = None
    trend: Optional[KpiTrend] = None
    calculated_at: datetime = Field(default_factory=datetime.now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "kpi_id": "kpi-12345678",
                "kpi_type": "NETWORK_HEALTH",
                "period": "REALTIME",
                "timestamp": "2026-03-30T19:31:00",
                "scope": {
                    "type": "GLOBAL",
                    "region": "All"
                },
                "metrics": {
                    "total_routes": 15,
                    "routes_normal": 12,
                    "routes_degraded": 2,
                    "routes_broken": 1,
                    "network_availability_percent": 93.3,
                    "total_alarms_active": 3,
                    "critical_alarms": 1,
                    "high_alarms": 2
                }
            }
        }
    
    def model_dump(self, **kwargs):
        """Override model_dump to ensure kpi_id is always set."""
        data = super().model_dump(**kwargs)
        # Ensure kpi_id is never None
        if not data.get('kpi_id'):
            data['kpi_id'] = f"kpi-{str(uuid.uuid4())[:8]}"
        return data


class AlarmDetails(BaseModel):
    """Detailed alarm information."""
    total_loss_db: Optional[float] = None
    event_location_km: Optional[float] = None
    event_type: Optional[str] = None
    deviation_from_baseline_db: Optional[float] = None


class OtdrEvent(BaseModel):
    """OTDR event details."""
    type: str
    distance_km: float
    loss_db: float
    reflection_db: Optional[float] = None


class TraceData(BaseModel):
    """Complete trace data."""
    trace_id: str
    fiber_length_km: float
    measurement_duration_ms: int
    events: List[OtdrEvent] = []


class ImpactInfo(BaseModel):
    """Impact information."""
    affected_services: List[str] = []
    estimated_affected_users: Optional[int] = None
    service_impact: ServiceImpact = ServiceImpact.NONE


class Lifecycle(BaseModel):
    """Alarm lifecycle information."""
    created_at: datetime = Field(default_factory=datetime.now)
    acknowledged: bool = False
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None
    resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolution_notes: Optional[str] = None
    escalated: bool = False
    escalation_level: Optional[int] = None


class NotificationInfo(BaseModel):
    """Notification delivery information."""
    email_sent: bool = False
    sms_sent: bool = False
    webhook_sent: bool = False
    notification_attempts: int = 0


class Alarm(BaseModel):
    """Alarm generated from OTDR analysis - matches Java model exactly."""
    alarm_id: str = Field(default_factory=lambda: f"alarm-{str(uuid.uuid4())[:8]}")
    rtu_id: str
    route_id: str
    alarm_type: AlarmType
    severity: AlarmSeverity
    status: AlarmStatus = AlarmStatus.ACTIVE
    description: str
    details: Optional[AlarmDetails] = None
    trace_data: Optional[TraceData] = None
    impact: Optional[ImpactInfo] = None
    lifecycle: Optional[Lifecycle] = None
    notifications: Optional[NotificationInfo] = None
    tags: List[str] = []
    updated_at: datetime = Field(default_factory=datetime.now)
    
    def model_dump(self, **kwargs):
        """Override model_dump to ensure alarm_id is always set."""
        data = super().model_dump(**kwargs)
        # Ensure alarm_id is never None
        if not data.get('alarm_id'):
            data['alarm_id'] = f"alarm-{str(uuid.uuid4())[:8]}"
        return data
    
    class Config:
        json_schema_extra = {
            "example": {
                "alarm_id": "alarm-12345678",
                "rtu_id": "RTU_TN_01",
                "route_id": "RTU_TN_01_R1",
                "alarm_type": "FIBER_BREAK",
                "severity": "CRITICAL",
                "status": "ACTIVE",
                "description": "Fiber break detected at 20.1 km with 18.5 dB loss",
                "details": {
                    "total_loss_db": 18.5,
                    "event_location_km": 20.1,
                    "event_type": "break",
                    "deviation_from_baseline_db": 12.0
                },
                "lifecycle": {
                    "created_at": "2026-02-17T10:30:00",
                    "acknowledged": False
                }
            }
        }


class RouteInfo(BaseModel):
    """Information about a monitored route."""
    route_id: str
    region: str
    fiber_length_km: float
    splice_count: int
    last_test_time: Optional[datetime] = None
    current_status: TraceStatus = TraceStatus.UNKNOWN
    active_alarms: int = 0


class OTDRTestReport(BaseModel):
    """Normalized OTDR test report sent to EMS for dashboard/history."""
    route_id: str
    rtu_id: str
    test_mode: str
    pulse_width_ns: int
    dynamic_range_db: float
    wavelength_nm: int
    test_result: str
    total_loss_db: float
    event_count: int
    fault_distance_km: Optional[float] = None
    status: str
    measured_at: datetime = Field(default_factory=datetime.now)
    event_reference_file: Optional[str] = None
    measurement_reference_file: Optional[str] = None
    average_power_db: Optional[float] = None
    power_variation_db: Optional[float] = None


class RTUStatus(BaseModel):
    """Current status of the RTU."""
    rtu_id: str
    rtu_name: str
    location: str
    is_monitoring: bool
    routes: List[RouteInfo]
    last_heartbeat: datetime = Field(default_factory=datetime.now)
    alarms_sent_today: int = 0
    ems_connected: bool = False
    power_supply: str = "Normal"
    temperature_c: float = 35.0
    temperature_state: str = "OK"
    communication: str = "Connected"
    otdr_availability: str = "Ready"
