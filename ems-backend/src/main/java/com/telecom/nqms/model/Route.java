package com.telecom.nqms.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "routes")
@CompoundIndexes({
    @CompoundIndex(name = "rtu_status_idx", def = "{'rtu_id': 1, 'status': 1}"),
    @CompoundIndex(name = "region_priority_idx", def = "{'region': 1, 'priority': 1}")
})
public class Route {
    
    @Id
    private String id;
    
    @Indexed(name = "routeId", unique = true)
    private String routeId;
    
    private String routeName;
    
    @Indexed
    private String rtuId;
    
    @Indexed
    private String region;
    
    @Indexed
    private RouteStatus status;
    
    private Priority priority;
    
    private FiberSpec fiberSpec;
    
    private Topology topology;
    
    private Baseline baseline;
    
    private CurrentCondition currentCondition;
    
    private Maintenance maintenance;
    
    private Sla sla;
    
    @CreatedDate
    private Instant createdAt;
    
    @LastModifiedDate
    private Instant updatedAt;
    
    // Nested classes
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FiberSpec {
        private String type;
        private Integer coreDiameterUm;
        private Double lengthKm;
        private Double expectedAttenuationDbPerKm;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Topology {
        private String startPoint;
        private String endPoint;
        private List<IntermediatePoint> intermediatePoints;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class IntermediatePoint {
        private String name;
        private Double distanceKm;
        private String type;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Baseline {
        private Double totalLossDb;
        private Integer spliceCount;
        private Integer connectorCount;
        private Instant measuredAt;
        private String traceSignature;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CurrentCondition {
        private Instant lastTestTime;
        private Double totalLossDb;
        private Double attenuationDb;
        private Double lossDeviationDb;
        private Integer eventCount;
        private Integer activeAlarms;
        private String routeStatus;
        private String testMode;
        private Integer pulseWidthNs;
        private Double dynamicRangeDb;
        private Integer wavelengthNm;
        private String testResult;
        private Double faultDistanceKm;
        private String eventReferenceFile;
        private String measurementReferenceFile;
        private Double averagePowerDb;
        private Double powerVariationDb;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Maintenance {
        private LocalDate lastMaintenanceDate;
        private LocalDate nextScheduledMaintenance;
        private List<String> maintenanceHistory;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Sla {
        private Double availabilityTarget;
        private Integer mttrTargetHours;
        private Integer mtbfHours;
    }
    
    // Enums
    public enum RouteStatus {
        NORMAL, DEGRADATION, BREAK, UNKNOWN, MAINTENANCE,
        ACTIVE, INACTIVE, DEGRADED, BROKEN
    }
    
    public enum Priority {
        LOW, MEDIUM, HIGH, CRITICAL
    }
}
