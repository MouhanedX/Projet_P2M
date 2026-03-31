from typing import List, Optional
from datetime import datetime
from models import (
    OTDRTrace, Alarm, AlarmType, AlarmSeverity, AlarmStatus, EventType,
    AlarmDetails, TraceData, OtdrEvent, ImpactInfo, Lifecycle, 
    NotificationInfo, ServiceImpact
)
from config import settings
import logging

logger = logging.getLogger(__name__)


class AlarmService:
    """Service for analyzing OTDR traces and generating alarms matching Java model exactly."""
    
    def __init__(self, rtu_id: str):
        self.rtu_id = rtu_id
        # Track last alarm per route to avoid duplicates
        self.last_alarms = {}
    
    def analyze_trace(self, trace: OTDRTrace) -> Optional[Alarm]:
        """
        Analyze OTDR trace and generate alarm if needed.
        
        Args:
            trace: OTDR trace to analyze
        
        Returns:
            Alarm object if fault detected, None otherwise
        """
        alarms = []
        
        # Check for fiber break
        if self._has_break(trace):
            alarm = self._create_break_alarm(trace)
            alarms.append(alarm)
        
        # Check for degradation
        elif self._has_degradation(trace):
            alarm = self._create_degradation_alarm(trace)
            alarms.append(alarm)
        
        # Check for high event loss
        high_loss_events = self._check_high_loss_events(trace)
        if high_loss_events:
            alarm = self._create_event_loss_alarm(trace, high_loss_events)
            alarms.append(alarm)
        
        # Return highest severity alarm
        if alarms:
            # Sort by severity (CRITICAL > HIGH > MEDIUM > LOW)
            severity_order = {
                AlarmSeverity.CRITICAL: 4,
                AlarmSeverity.HIGH: 3,
                AlarmSeverity.MEDIUM: 2,
                AlarmSeverity.LOW: 1
            }
            alarms.sort(key=lambda a: severity_order[a.severity], reverse=True)
            
            # Check if this is a duplicate of the last alarm
            last_alarm_key = f"{trace.route_id}_{alarms[0].alarm_type}"
            if last_alarm_key in self.last_alarms:
                last_alarm_time = self.last_alarms[last_alarm_key]
                # Don't send duplicate if less than configured suppression window
                time_diff = (datetime.now() - last_alarm_time).total_seconds()
                if time_diff < settings.alarm_duplicate_suppression_seconds:
                    return None
            
            # Update last alarm timestamp
            self.last_alarms[last_alarm_key] = datetime.now()
            
            return alarms[0]
        
        # Clear alarm history if route is back to normal
        if trace.status.value == "NORMAL":
            keys_to_remove = [k for k in self.last_alarms.keys() 
                             if k.startswith(f"{trace.route_id}_")]
            for key in keys_to_remove:
                del self.last_alarms[key]
        
        return None
    
    def _has_break(self, trace: OTDRTrace) -> bool:
        """Check if trace indicates a fiber break."""
        # Check for break event
        for event in trace.events:
            if event.type == EventType.BREAK:
                return True
        
        # Check if total loss exceeds break threshold
        if trace.total_loss_db > settings.alarm_threshold_break:
            return True
        
        return False
    
    def _has_degradation(self, trace: OTDRTrace) -> bool:
        """Check if trace indicates fiber degradation."""
        if (trace.total_loss_db > settings.alarm_threshold_degradation and 
            trace.total_loss_db <= settings.alarm_threshold_break):
            return True
        return False
    
    def _check_high_loss_events(self, trace: OTDRTrace) -> List:
        """Check for individual events with high loss."""
        high_loss_events = []
        for event in trace.events:
            if event.type != EventType.BREAK and event.loss_db > settings.event_loss_threshold:
                high_loss_events.append(event)
        return high_loss_events
    
    def _create_break_alarm(self, trace: OTDRTrace) -> Alarm:
        """Create alarm for fiber break with complete Java model schema."""
        # Find break event if exists
        break_event = next((e for e in trace.events if e.type == EventType.BREAK), None)
        
        if break_event:
            description = (f"Fiber break detected at {break_event.distance_km} km "
                          f"with {break_event.loss_db} dB loss on route {trace.route_id}")
            event_location_km = break_event.distance_km
        else:
            description = (f"Excessive loss detected ({trace.total_loss_db} dB) "
                          f"indicating fiber break on route {trace.route_id}")
            event_location_km = None
        
        # Create trace data matching Java model
        trace_data = TraceData(
            trace_id=trace.trace_id,
            fiber_length_km=trace.fiber_length_km,
            measurement_duration_ms=trace.measurement_duration_ms,
            events=[
                OtdrEvent(
                    type=e.type.value,
                    distance_km=e.distance_km,
                    loss_db=e.loss_db,
                    reflection_db=e.reflection_db
                ) for e in trace.events
            ]
        )
        
        # Create alarm details matching Java model
        details = AlarmDetails(
            total_loss_db=trace.total_loss_db,
            event_location_km=event_location_km,
            event_type="break",
            deviation_from_baseline_db=trace.total_loss_db - 6.8  # Approximate baseline
        )
        
        # Create lifecycle matching Java model
        lifecycle = Lifecycle(
            created_at=datetime.now(),
            acknowledged=False,
            resolved=False,
            escalated=True,
            escalation_level=2
        )
        
        # Create impact info
        impact = ImpactInfo(
            affected_services=["Fiber Link"] if event_location_km else [],
            estimated_affected_users=100,
            service_impact=ServiceImpact.MAJOR
        )
        
        # Create notification info
        notifications = NotificationInfo(
            email_sent=False,
            sms_sent=False,
            webhook_sent=False,
            notification_attempts=0
        )
        
        return Alarm(
            rtu_id=self.rtu_id,
            route_id=trace.route_id,
            alarm_type=AlarmType.FIBER_BREAK,
            severity=AlarmSeverity.CRITICAL,
            status=AlarmStatus.ACTIVE,
            description=description,
            details=details,
            trace_data=trace_data,
            impact=impact,
            lifecycle=lifecycle,
            notifications=notifications,
            tags=["automated", "critical", "fiber-break"]
        )
    
    def _create_degradation_alarm(self, trace: OTDRTrace) -> Alarm:
        """Create alarm for fiber degradation with complete Java model schema."""
        description = (f"Fiber degradation detected on route {trace.route_id}. "
                      f"Total loss: {trace.total_loss_db} dB "
                      f"(threshold: {settings.alarm_threshold_degradation} dB)")
        
        # Create trace data
        trace_data = TraceData(
            trace_id=trace.trace_id,
            fiber_length_km=trace.fiber_length_km,
            measurement_duration_ms=trace.measurement_duration_ms,
            events=[
                OtdrEvent(
                    type=e.type.value,
                    distance_km=e.distance_km,
                    loss_db=e.loss_db,
                    reflection_db=e.reflection_db
                ) for e in trace.events
            ]
        )
        
        # Create alarm details
        details = AlarmDetails(
            total_loss_db=trace.total_loss_db,
            event_type="degradation",
            deviation_from_baseline_db=trace.total_loss_db - 5.0
        )
        
        # Create lifecycle
        lifecycle = Lifecycle(
            created_at=datetime.now(),
            acknowledged=False,
            resolved=False
        )
        
        # Create impact info
        impact = ImpactInfo(
            affected_services=["Fiber Link"],
            estimated_affected_users=50,
            service_impact=ServiceImpact.MODERATE
        )
        
        # Create notification info
        notifications = NotificationInfo(
            email_sent=False,
            sms_sent=False,
            webhook_sent=False
        )
        
        return Alarm(
            rtu_id=self.rtu_id,
            route_id=trace.route_id,
            alarm_type=AlarmType.DEGRADATION,
            severity=AlarmSeverity.MEDIUM,
            status=AlarmStatus.ACTIVE,
            description=description,
            details=details,
            trace_data=trace_data,
            impact=impact,
            lifecycle=lifecycle,
            notifications=notifications,
            tags=["automated", "degradation"]
        )
    
    def _create_event_loss_alarm(self, trace: OTDRTrace, events: List) -> Alarm:
        """Create alarm for high loss events with complete Java model schema."""
        event_descriptions = []
        max_event = max(events, key=lambda e: e.loss_db)
        
        for event in events:
            event_descriptions.append(
                f"{event.type.value} at {event.distance_km} km ({event.loss_db} dB)"
            )
        
        description = (f"High loss events detected on route {trace.route_id}: "
                      f"{', '.join(event_descriptions)}")
        
        # Create trace data
        trace_data = TraceData(
            trace_id=trace.trace_id,
            fiber_length_km=trace.fiber_length_km,
            measurement_duration_ms=trace.measurement_duration_ms,
            events=[
                OtdrEvent(
                    type=e.type.value,
                    distance_km=e.distance_km,
                    loss_db=e.loss_db,
                    reflection_db=e.reflection_db
                ) for e in trace.events
            ]
        )
        
        # Create alarm details
        details = AlarmDetails(
            total_loss_db=trace.total_loss_db,
            event_location_km=max_event.distance_km,
            event_type="high_loss_event",
            deviation_from_baseline_db=max_event.loss_db
        )
        
        # Create lifecycle
        lifecycle = Lifecycle(
            created_at=datetime.now(),
            acknowledged=False,
            resolved=False
        )
        
        # Create impact info
        impact = ImpactInfo(
            affected_services=["Fiber Segment"],
            estimated_affected_users=25,
            service_impact=ServiceImpact.MINOR
        )
        
        # Create notification info
        notifications = NotificationInfo(
            email_sent=False,
            sms_sent=False,
            webhook_sent=False
        )
        
        return Alarm(
            rtu_id=self.rtu_id,
            route_id=trace.route_id,
            alarm_type=AlarmType.HIGH_EVENT_LOSS,
            severity=AlarmSeverity.HIGH,
            status=AlarmStatus.ACTIVE,
            description=description,
            details=details,
            trace_data=trace_data,
            impact=impact,
            lifecycle=lifecycle,
            notifications=notifications,
            tags=["automated", "high-loss"]
        )
    
    def create_rtu_availability_alarm(self, reason: str) -> Alarm:
        """Create alarm for RTU availability with complete Java model schema."""
        lifecycle = Lifecycle(
            created_at=datetime.now(),
            acknowledged=False,
            resolved=False
        )
        
        notifications = NotificationInfo(
            email_sent=False,
            sms_sent=False,
            webhook_sent=False
        )
        
        impact = ImpactInfo(
            affected_services=["All Routes"],
            estimated_affected_users=1000,
            service_impact=ServiceImpact.FULL_OUTAGE
        )
        
        return Alarm(
            alarm_id=f"rtu-alarm-{self.rtu_id}",
            rtu_id=self.rtu_id,
            route_id="N/A",
            alarm_type=AlarmType.RTU_AVAILABILITY,
            severity=AlarmSeverity.HIGH,
            status=AlarmStatus.ACTIVE,
            description=f"RTU {self.rtu_id} availability issue: {reason}",
            lifecycle=lifecycle,
            notifications=notifications,
            impact=impact,
            tags=["rtu-availability", reason]
        )
