package com.telecom.nqms.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import com.fasterxml.jackson.annotation.JsonAlias;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;

import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "alarms")
@CompoundIndexes({
    @CompoundIndex(name = "rtu_created_idx", def = "{'rtu_id': 1, 'lifecycle.created_at': -1}"),
    @CompoundIndex(name = "route_status_idx", def = "{'route_id': 1, 'status': 1}"),
    @CompoundIndex(name = "severity_status_created_idx", def = "{'severity': 1, 'status': 1, 'lifecycle.created_at': -1}")
})
public class Alarm {
    
    @Id
    private String id;
    
    @Indexed(unique = true)
    @JsonAlias("alarm_id")
    private String alarmId;
    
    @Indexed
    @JsonAlias("rtu_id")
    private String rtuId;
    
    @Indexed
    @JsonAlias("route_id")
    private String routeId;
    
    @JsonAlias("alarm_type")
    private AlarmType alarmType;
    
    @Indexed
    private AlarmSeverity severity;
    
    @Indexed
    private AlarmStatus status;
    
    private String description;
    
    private AlarmDetails details;
    
    @JsonAlias("trace_data")
    private TraceData traceData;
    
    private ImpactInfo impact;
    
    private Lifecycle lifecycle;
    
    private NotificationInfo notifications;
    
    private List<String> tags;
    
    @LastModifiedDate
    private Instant updatedAt;
    
    // Nested classes
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AlarmDetails {
        @JsonAlias("total_loss_db")
        private Double totalLossDb;
        @JsonAlias("event_location_km")
        private Double eventLocationKm;
        @JsonAlias("fault_location_description")
        private String faultLocationDescription;
        @JsonAlias("fault_cause")
        private String faultCause;
        @JsonAlias("attenuation_db")
        private Double attenuationDb;
        @JsonAlias("event_type")
        private String eventType;
        @JsonAlias("deviation_from_baseline_db")
        private Double deviationFromBaselineDb;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TraceData {
        @JsonAlias("trace_id")
        private String traceId;
        @JsonAlias("fiber_length_km")
        private Double fiberLengthKm;
        @JsonAlias("measurement_duration_ms")
        private Integer measurementDurationMs;
        private List<OtdrEvent> events;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OtdrEvent {
        private String type;
        @JsonAlias("distance_km")
        private Double distanceKm;
        @JsonAlias("loss_db")
        private Double lossDb;
        @JsonAlias("reflection_db")
        private Double reflectionDb;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ImpactInfo {
        @JsonAlias("affected_services")
        private List<String> affectedServices;
        @JsonAlias("estimated_affected_users")
        private Integer estimatedAffectedUsers;
        @JsonAlias("service_impact")
        private ServiceImpact serviceImpact;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Lifecycle {
        @CreatedDate
        @JsonAlias("created_at")
        private Instant createdAt;
        @JsonAlias("assigned_to_technician")
        private Boolean assignedToTechnician;
        @JsonAlias("assigned_at")
        private Instant assignedAt;
        @JsonAlias("assigned_by")
        private String assignedBy;
        @JsonAlias("repair_duration_seconds")
        private Long repairDurationSeconds;
        @JsonAlias("auto_resolve_at")
        private Instant autoResolveAt;
        private Boolean acknowledged;
        @JsonAlias("acknowledged_at")
        private Instant acknowledgedAt;
        @JsonAlias("acknowledged_by")
        private String acknowledgedBy;
        private Boolean resolved;
        @JsonAlias("resolved_at")
        private Instant resolvedAt;
        @JsonAlias("resolved_by")
        private String resolvedBy;
        @JsonAlias("resolution_notes")
        private String resolutionNotes;
        private Boolean escalated;
        @JsonAlias("escalation_level")
        private Integer escalationLevel;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NotificationInfo {
        @JsonAlias("email_sent")
        private Boolean emailSent;
        @JsonAlias("sms_sent")
        private Boolean smsSent;
        @JsonAlias("webhook_sent")
        private Boolean webhookSent;
        @JsonAlias("notification_attempts")
        private Integer notificationAttempts;
    }
    
    // Enums
    public enum AlarmType {
        FIBER_FAULT, 
        FIBER_BREAK, 
        DEGRADATION, 
        RTU_AVAILABILITY, 
        HIGH_EVENT_LOSS
    }
    
    public enum AlarmSeverity {
        LOW, MEDIUM, HIGH, CRITICAL
    }
    
    public enum AlarmStatus {
        ACTIVE, 
        ACKNOWLEDGED, 
        RESOLVED, 
        CLEARED, 
        SUPPRESSED
    }
    
    public enum ServiceImpact {
        NONE, 
        MINOR, 
        MODERATE, 
        MAJOR, 
        FULL_OUTAGE
    }
}
