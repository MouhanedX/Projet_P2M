package com.telecom.nqms.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "kpis")
@CompoundIndexes({
    @CompoundIndex(name = "type_period_timestamp_idx", def = "{'kpi_type': 1, 'period': 1, 'timestamp': -1}"),
    @CompoundIndex(name = "scope_timestamp_idx", def = "{'scope.type': 1, 'scope.region': 1, 'timestamp': -1}")
})
public class Kpi {
    
    @Id
    private String id;
    
    @Indexed
    private KpiType kpiType;
    
    @Indexed
    private Period period;
    
    @Indexed
    private Instant timestamp;
    
    private Scope scope;
    
    private Metrics metrics;
    
    private Performance performance;
    
    private Availability availability;
    
    private Trend trend;
    
    private Instant calculatedAt;
    
    // Nested classes
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Scope {
        private ScopeType type;
        private String region;
        private String rtuId;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Metrics {
        private Integer totalRoutes;
        private Integer routesNormal;
        private Integer routesDegraded;
        private Integer routesBroken;
        private Double networkAvailabilityPercent;
        private Integer totalAlarmsActive;
        private Integer criticalAlarms;
        private Integer highAlarms;
        private Integer mediumAlarms;
        private Integer lowAlarms;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Performance {
        private Double avgFiberLossDb;
        private Double maxFiberLossDb;
        private Integer totalEventsDetected;
        private Integer unusualEvents;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Availability {
        private Double uptimePercent;
        private Double mttrHours;
        private Double mtbfHours;
        private Double slaCompliancePercent;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Trend {
        private Double hourOverHourChangePercent;
        private Double dayOverDayChangePercent;
        private Double weekOverWeekChangePercent;
    }
    
    // Enums
    public enum KpiType {
        NETWORK_HEALTH,
        ROUTE_PERFORMANCE,
        ALARM_STATISTICS,
        RTU_PERFORMANCE,
        AVAILABILITY_METRICS
    }
    
    public enum Period {
        REALTIME,
        HOURLY,
        DAILY,
        WEEKLY,
        MONTHLY
    }
    
    public enum ScopeType {
        GLOBAL,
        REGIONAL,
        RTU
    }
}
