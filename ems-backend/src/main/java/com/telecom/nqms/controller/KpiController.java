package com.telecom.nqms.controller;

import com.telecom.nqms.model.Kpi;
import com.telecom.nqms.service.KpiCalculationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/kpis")
@RequiredArgsConstructor
@Tag(name = "KPIs", description = "Key Performance Indicators APIs")
public class KpiController {
    
    private final KpiCalculationService kpiCalculationService;
    
    @GetMapping("/latest/{kpiType}")
    @Operation(summary = "Get latest KPI by type")
    public ResponseEntity<Kpi> getLatestKpi(@PathVariable Kpi.KpiType kpiType) {
        Kpi kpi = kpiCalculationService.getLatestKpi(kpiType);
        return kpi != null ? ResponseEntity.ok(kpi) : ResponseEntity.notFound().build();
    }
    
    @GetMapping("/network-health")
    @Operation(summary = "Get current network health KPI")
    public ResponseEntity<Kpi> getNetworkHealth() {
        Kpi kpi = kpiCalculationService.calculateNetworkHealthKpi();
        return ResponseEntity.ok(kpi);
    }
    
    @GetMapping("/history")
    @Operation(summary = "Get KPI history")
    public ResponseEntity<List<Kpi>> getKpiHistory(
            @RequestParam Kpi.KpiType kpiType,
            @RequestParam(defaultValue = "REALTIME") Kpi.Period period,
            @RequestParam(defaultValue = "24") int hours) {
        
        List<Kpi> kpis = kpiCalculationService.getKpiHistory(kpiType, period, hours);
        return ResponseEntity.ok(kpis);
    }
    
    @PostMapping("/calculate")
    @Operation(summary = "Trigger manual KPI calculation")
    public ResponseEntity<String> triggerCalculation() {
        kpiCalculationService.calculateAndStoreKpis();
        return ResponseEntity.ok("KPI calculation triggered");
    }
}
