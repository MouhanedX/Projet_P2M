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

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "rtus")
public class Rtu {
    
    @Id
    private String id;
    
    @Indexed(unique = true)
    private String rtuId;
    
    private String rtuName;
    
    private Location location;
    
    @Indexed
    private RtuStatus status;
    
    private Boolean isMonitoring;
    
    private Capabilities capabilities;
    
    private Health health;
    
    private Configuration configuration;
    
    private Statistics statistics;
    
    @CreatedDate
    private Instant createdAt;
    
    @LastModifiedDate
    private Instant updatedAt;
    
    // Nested classes
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Location {
        private String name;
        private Coordinates coordinates;
        private String region;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Coordinates {
        private Double latitude;
        private Double longitude;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Capabilities {
        private Integer maxFiberLengthKm;
        private Integer[] wavelengths;
        private Integer dynamicRangeDb;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Health {
        private Double cpuUsage;
        private Double memoryUsage;
        private Instant lastHeartbeat;
        private Integer uptimeHours;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Configuration {
        private Integer monitoringInterval;
        private Double alarmThresholdDegradation;
        private Double alarmThresholdBreak;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Statistics {
        private Long totalTestsPerformed;
        private Integer alarmsGeneratedToday;
        private Integer alarmsGeneratedWeek;
        private Integer alarmsGeneratedMonth;
    }
    
    public enum RtuStatus {
        ONLINE, OFFLINE, MAINTENANCE, ERROR,
        ACTIVE, INACTIVE
    }
}
