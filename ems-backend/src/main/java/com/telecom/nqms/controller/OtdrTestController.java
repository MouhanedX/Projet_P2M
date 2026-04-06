package com.telecom.nqms.controller;

import com.telecom.nqms.model.OtdrTestResult;
import com.telecom.nqms.repository.OtdrTestResultRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/otdr-tests")
@RequiredArgsConstructor
@Tag(name = "OTDR Tests", description = "OTDR telemetry and recent test results")
public class OtdrTestController {

    private final OtdrTestResultRepository testResultRepository;

    @GetMapping("/recent")
    @Operation(summary = "Get recent OTDR test results")
    public ResponseEntity<List<OtdrTestResult>> getRecentTests(
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String routeId) {

        int safeLimit = Math.max(1, Math.min(limit, 100));
        PageRequest pageable = PageRequest.of(0, safeLimit);

        if (routeId != null && !routeId.isBlank()) {
            return ResponseEntity.ok(testResultRepository.findByRouteIdOrderByMeasuredAtDesc(routeId, pageable));
        }

        return ResponseEntity.ok(testResultRepository.findByOrderByMeasuredAtDesc(pageable));
    }
}
