package com.telecom.nqms.controller;

import com.telecom.nqms.model.OtdrTestResult;
import com.telecom.nqms.model.Route;
import com.telecom.nqms.repository.OtdrTestResultRepository;
import com.telecom.nqms.repository.RouteRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/routes")
@RequiredArgsConstructor
@Tag(name = "Routes", description = "Fiber route management APIs")
public class RouteController {

    private final RouteRepository routeRepository;
    private final OtdrTestResultRepository testResultRepository;

    @GetMapping
    @Operation(summary = "Get all routes")
    public ResponseEntity<List<Route>> getAllRoutes() {
        return ResponseEntity.ok(routeRepository.findAll());
    }

    @GetMapping("/{routeId}")
    @Operation(summary = "Get route by routeId")
    public ResponseEntity<Route> getRoute(@PathVariable String routeId) {
        return routeRepository.findByRouteId(routeId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/rtu/{rtuId}")
    @Operation(summary = "Get routes by RTU")
    public ResponseEntity<List<Route>> getRoutesByRtu(@PathVariable String rtuId) {
        return ResponseEntity.ok(routeRepository.findByRtuId(rtuId));
    }

    @PostMapping("/telemetry")
    @Operation(summary = "Ingest OTDR telemetry for route update + test history")
    public ResponseEntity<Route> ingestTelemetry(@RequestBody RouteTelemetryRequest request) {
        if (request.routeId == null || request.routeId.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        Route route = routeRepository.findByRouteId(request.routeId)
                .orElseGet(() -> Route.builder()
                        .routeId(request.routeId)
                        .routeName(request.routeId)
                        .rtuId(request.rtuId)
                        .region("Unknown")
                        .status(Route.RouteStatus.UNKNOWN)
                        .currentCondition(Route.CurrentCondition.builder().build())
                        .build());

        if (route.getCurrentCondition() == null) {
            route.setCurrentCondition(Route.CurrentCondition.builder().build());
        }

        Route.CurrentCondition condition = route.getCurrentCondition();
        condition.setLastTestTime(request.measuredAt != null ? request.measuredAt : Instant.now());
        condition.setTotalLossDb(request.totalLossDb);
        condition.setAttenuationDb(request.totalLossDb);
        condition.setEventCount(request.eventCount);
        condition.setTestMode(request.testMode);
        condition.setPulseWidthNs(request.pulseWidthNs);
        condition.setDynamicRangeDb(request.dynamicRangeDb);
        condition.setWavelengthNm(request.wavelengthNm);
        condition.setTestResult(request.testResult);
        condition.setFaultDistanceKm(request.faultDistanceKm);
        condition.setEventReferenceFile(request.eventReferenceFile);
        condition.setMeasurementReferenceFile(request.measurementReferenceFile);
        condition.setAveragePowerDb(request.averagePowerDb);
        condition.setPowerVariationDb(request.powerVariationDb);
        condition.setRouteStatus("NORMAL".equalsIgnoreCase(request.status) ? "Active" : "Inactive");

        if ("BREAK".equalsIgnoreCase(request.status)) {
            route.setStatus(Route.RouteStatus.BREAK);
        } else if ("DEGRADATION".equalsIgnoreCase(request.status)) {
            route.setStatus(Route.RouteStatus.DEGRADATION);
        } else if ("NORMAL".equalsIgnoreCase(request.status)) {
            route.setStatus(Route.RouteStatus.NORMAL);
        }

        Route savedRoute = routeRepository.save(route);

        OtdrTestResult result = OtdrTestResult.builder()
                .routeId(request.routeId)
                .rtuId(request.rtuId)
                .testMode(request.testMode)
                .pulseWidthNs(request.pulseWidthNs)
                .dynamicRangeDb(request.dynamicRangeDb)
                .wavelengthNm(request.wavelengthNm)
                .testResult(request.testResult)
                .totalLossDb(request.totalLossDb)
                .eventCount(request.eventCount)
                .faultDistanceKm(request.faultDistanceKm)
                .status(request.status)
                .eventReferenceFile(request.eventReferenceFile)
                .measurementReferenceFile(request.measurementReferenceFile)
                .averagePowerDb(request.averagePowerDb)
                .powerVariationDb(request.powerVariationDb)
                .measuredAt(request.measuredAt != null ? request.measuredAt : Instant.now())
                .build();
        testResultRepository.save(result);

        return ResponseEntity.ok(savedRoute);
    }

    @Data
    public static class RouteTelemetryRequest {
        private String routeId;
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
        private Instant measuredAt;
        private String eventReferenceFile;
        private String measurementReferenceFile;
        private Double averagePowerDb;
        private Double powerVariationDb;
    }
}
