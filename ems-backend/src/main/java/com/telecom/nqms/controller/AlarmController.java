package com.telecom.nqms.controller;

import com.telecom.nqms.model.Alarm;
import com.telecom.nqms.service.AlarmService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/alarms")
@RequiredArgsConstructor
@Tag(name = "Alarms", description = "Alarm management APIs")
public class AlarmController {
    
    private final AlarmService alarmService;
    
    @PostMapping
    @Operation(summary = "Create new alarm", description = "Create a new alarm reported by RTU")
    public ResponseEntity<Alarm> createAlarm(@Valid @RequestBody Alarm alarm) {
        log.info("Received alarm: {} for route {}", alarm.getAlarmType(), alarm.getRouteId());
        Alarm created = alarmService.createAlarm(alarm);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PostMapping("/manual")
    @Operation(summary = "Create manual alarm", description = "Create a manual OTDR alarm assigned to a technician with optional timed auto-resolution")
    public ResponseEntity<Alarm> createManualAlarm(@RequestBody AlarmService.ManualAlarmRequest request) {
        Alarm created = alarmService.createManualAlarm(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
    
    @GetMapping("/{alarmId}")
    @Operation(summary = "Get alarm by ID")
    public ResponseEntity<Alarm> getAlarm(@PathVariable String alarmId) {
        Alarm alarm = alarmService.getAlarmById(alarmId);
        return ResponseEntity.ok(alarm);
    }
    
    @GetMapping
    @Operation(summary = "Get alarms with pagination and filters")
    public ResponseEntity<Page<Alarm>> getAlarms(
            @RequestParam(required = false) Alarm.AlarmStatus status,
            @RequestParam(required = false) Alarm.AlarmSeverity severity,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "lifecycle.createdAt") String sortBy) {
        
        Page<Alarm> alarms = alarmService.getAlarms(status, severity, page, size, sortBy);
        return ResponseEntity.ok(alarms);
    }
    
    @GetMapping("/active")
    @Operation(summary = "Get all active alarms")
    public ResponseEntity<List<Alarm>> getActiveAlarms() {
        List<Alarm> alarms = alarmService.getActiveAlarms();
        return ResponseEntity.ok(alarms);
    }
    
    @GetMapping("/route/{routeId}")
    @Operation(summary = "Get alarms for specific route")
    public ResponseEntity<List<Alarm>> getAlarmsByRoute(@PathVariable String routeId) {
        List<Alarm> alarms = alarmService.getAlarmsByRoute(routeId);
        return ResponseEntity.ok(alarms);
    }
    
    @GetMapping("/rtu/{rtuId}")
    @Operation(summary = "Get alarms for specific RTU")
    public ResponseEntity<List<Alarm>> getAlarmsByRtu(@PathVariable String rtuId) {
        List<Alarm> alarms = alarmService.getAlarmsByRtu(rtuId);
        return ResponseEntity.ok(alarms);
    }
    
    @PostMapping("/{alarmId}/resolve")
    @Operation(summary = "Resolve an alarm")
    public ResponseEntity<Alarm> resolveAlarm(
            @PathVariable String alarmId,
            @RequestBody Map<String, String> request) {
        
        String resolvedBy = request.getOrDefault("resolvedBy", "system");
        String notes = request.getOrDefault("resolutionNotes", "");
        
        Alarm alarm = alarmService.resolveAlarm(alarmId,resolvedBy, notes);
        return ResponseEntity.ok(alarm);
    }
    
    @GetMapping("/statistics")
    @Operation(summary = "Get alarm statistics")
    public ResponseEntity<AlarmService.AlarmStatistics> getStatistics() {
        return ResponseEntity.ok(alarmService.getAlarmStatistics());
    }
}
