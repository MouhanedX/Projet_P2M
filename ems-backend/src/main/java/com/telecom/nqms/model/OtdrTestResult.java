package com.telecom.nqms.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "otdr_tests")
public class OtdrTestResult {

    @Id
    private String id;

    @Indexed
    private String routeId;

    @Indexed
    private String rtuId;

    private String testMode;

    private Integer pulseWidthNs;

    private Double dynamicRangeDb;

    private Integer wavelengthNm;

    private String testResult;

    private Double totalLossDb;

    private Integer eventCount;

    private Double faultDistanceKm;

    private String status;

    private String eventReferenceFile;

    private String measurementReferenceFile;

    private Double averagePowerDb;

    private Double powerVariationDb;

    private Instant measuredAt;

    @CreatedDate
    private Instant createdAt;
}
