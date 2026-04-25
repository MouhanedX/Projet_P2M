package com.telecom.nqms.service;

import com.telecom.nqms.model.Alarm;
import com.telecom.nqms.model.OtdrTestResult;
import com.telecom.nqms.model.Route;
import com.telecom.nqms.repository.AlarmRepository;
import com.telecom.nqms.repository.OtdrTestResultRepository;
import com.telecom.nqms.repository.RouteRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.*;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlarmService {
    
    private final AlarmRepository alarmRepository;
    private final RouteRepository routeRepository;
    private final OtdrTestResultRepository otdrTestResultRepository;
    private final SimpMessagingTemplate messagingTemplate;
    
    /**
     * Create new alarm from RTU
     */
    @Transactional
    public Alarm createAlarm(Alarm alarm) {
        log.info("Creating new alarm: {} for route: {}", alarm.getAlarmType(), alarm.getRouteId());
        
        // Ensure alarm has UUID
        if (alarm.getAlarmId() == null || alarm.getAlarmId().isEmpty()) {
            alarm.setAlarmId(UUID.randomUUID().toString());
        }
        
        // Initialize lifecycle
        if (alarm.getLifecycle() == null) {
            alarm.setLifecycle(Alarm.Lifecycle.builder()
                    .createdAt(Instant.now())
                    .assignedToTechnician(false)
                    .acknowledged(false)
                    .resolved(false)
                    .escalated(false)
                    .escalationLevel(0)
                    .build());
        } else {
            if (alarm.getLifecycle().getCreatedAt() == null) {
                alarm.getLifecycle().setCreatedAt(Instant.now());
            }
            if (alarm.getLifecycle().getAssignedToTechnician() == null) {
                alarm.getLifecycle().setAssignedToTechnician(false);
            }
            if (alarm.getLifecycle().getAcknowledged() == null) {
                alarm.getLifecycle().setAcknowledged(false);
            }
            if (alarm.getLifecycle().getResolved() == null) {
                alarm.getLifecycle().setResolved(false);
            }
            if (alarm.getLifecycle().getEscalated() == null) {
                alarm.getLifecycle().setEscalated(false);
            }
            if (alarm.getLifecycle().getEscalationLevel() == null) {
                alarm.getLifecycle().setEscalationLevel(0);
            }
        }
        
        // Set default status
        if (alarm.getStatus() == null) {
            alarm.setStatus(Alarm.AlarmStatus.ACTIVE);
        }
        
        // Save alarm
        Alarm savedAlarm = alarmRepository.save(alarm);
        
        // Update route alarm count
        updateRouteAlarmCount(alarm.getRouteId());
        updateRouteStatusFromAlarm(savedAlarm);
        
        // Send real-time notification via WebSocket
        sendAlarmNotification(savedAlarm);
        
        log.info("Alarm created successfully: {}", savedAlarm.getAlarmId());
        return savedAlarm;
    }

        /**
         * Create a manual alarm from the test interface.
         */
        @Transactional
        public Alarm createManualAlarm(ManualAlarmRequest request) {
        String routeId = requireValue(request.getRouteId(), "routeId");
        String rtuId = requireValue(request.getRtuId(), "rtuId");

        boolean assignedToTechnician = Boolean.TRUE.equals(request.getAssignToTechnician());
        long repairDurationSeconds = request.getRepairDurationSeconds() != null
            ? request.getRepairDurationSeconds()
            : 0L;

        if (assignedToTechnician && repairDurationSeconds <= 0) {
            throw new RuntimeException("repairDurationSeconds must be greater than 0 when assignToTechnician is enabled");
        }

        Instant startTime = request.getAlarmStartTime() != null ? request.getAlarmStartTime() : Instant.now();
        String normalizedFaultType = normalizeFaultType(request.getFaultType());

        Alarm.AlarmType alarmType = mapAlarmType(normalizedFaultType);
        Alarm.AlarmSeverity severity = request.getSeverity() != null
            ? request.getSeverity()
            : mapSeverity(normalizedFaultType);

        Alarm.AlarmDetails details = Alarm.AlarmDetails.builder()
            .eventLocationKm(request.getFaultLocationKm())
            .faultLocationDescription(request.getFaultLocationDescription())
            .faultCause(request.getFaultCause())
            .attenuationDb(request.getAttenuationDb())
            .totalLossDb(request.getAttenuationDb())
            .eventType(normalizedFaultType)
            .build();

        Alarm.Lifecycle lifecycle = Alarm.Lifecycle.builder()
            .createdAt(startTime)
            .assignedToTechnician(assignedToTechnician)
            .assignedAt(assignedToTechnician ? startTime : null)
            .assignedBy(assignedToTechnician ? defaultIfBlank(request.getTechnicianName(), "field-technician") : null)
            .repairDurationSeconds(assignedToTechnician ? repairDurationSeconds : null)
            .autoResolveAt(null)
            .acknowledged(false)
            .resolved(false)
            .escalated(false)
            .escalationLevel(0)
            .build();

        Alarm alarm = Alarm.builder()
            .alarmId(UUID.randomUUID().toString())
            .rtuId(rtuId)
            .routeId(routeId)
            .alarmType(alarmType)
            .severity(severity)
            .status(Alarm.AlarmStatus.ACTIVE)
            .description(buildManualAlarmDescription(request, normalizedFaultType))
            .details(details)
            .impact(Alarm.ImpactInfo.builder()
                .serviceImpact(alarmType == Alarm.AlarmType.FIBER_BREAK
                    ? Alarm.ServiceImpact.MAJOR
                    : Alarm.ServiceImpact.MINOR)
                .estimatedAffectedUsers(0)
                .affectedServices(List.of("fiber-route"))
                .build())
            .lifecycle(lifecycle)
            .tags(List.of("MANUAL", "OTDR", "ROUTE:" + routeId))
            .build();

        Alarm created = createAlarm(alarm);
        saveManualOtdrResult(created, request, startTime, normalizedFaultType);
        return created;
        }

    /**
     * Acknowledge an alarm and start the auto-repair countdown from now.
     */
    @Transactional
    public Alarm acknowledgeAlarm(String alarmId, String acknowledgedBy) {
        Alarm alarm = getAlarmById(alarmId);

        if (alarm.getLifecycle() == null) {
            alarm.setLifecycle(Alarm.Lifecycle.builder()
                    .createdAt(Instant.now())
                    .assignedToTechnician(false)
                    .acknowledged(false)
                    .resolved(false)
                    .escalated(false)
                    .escalationLevel(0)
                    .build());
        }

        if (Boolean.TRUE.equals(alarm.getLifecycle().getResolved())) {
            throw new RuntimeException("Cannot acknowledge a resolved alarm");
        }

        if (Boolean.TRUE.equals(alarm.getLifecycle().getAcknowledged())) {
            return alarm;
        }

        Instant now = Instant.now();
        alarm.getLifecycle().setAcknowledged(true);
        alarm.getLifecycle().setAcknowledgedAt(now);
        alarm.getLifecycle().setAcknowledgedBy(defaultIfBlank(acknowledgedBy, "operator"));

        Long repairDurationSeconds = alarm.getLifecycle().getRepairDurationSeconds();
        if (Boolean.TRUE.equals(alarm.getLifecycle().getAssignedToTechnician())
                && repairDurationSeconds != null
                && repairDurationSeconds > 0) {
            alarm.getLifecycle().setAutoResolveAt(now.plusSeconds(repairDurationSeconds));
        }

        Alarm updated = alarmRepository.save(alarm);
        sendAlarmNotification(updated);

        log.info("Alarm acknowledged: {} by {}", alarmId, acknowledgedBy);
        return updated;
    }
    
    /**
     * Get alarm by ID
     */
    public Alarm getAlarmById(String alarmId) {
        return alarmRepository.findByAlarmId(alarmId)
                .or(() -> alarmRepository.findById(alarmId))
                .orElseThrow(() -> new RuntimeException("Alarm not found: " + alarmId));
    }
    
    /**
     * Get all active alarms
     */
    public List<Alarm> getActiveAlarms() {
        return alarmRepository.findAllActiveAlarms();
    }
    
    /**
     * Get alarms with pagination
     */
    public Page<Alarm> getAlarms(Alarm.AlarmStatus status, Alarm.AlarmSeverity severity, 
                                  int page, int size, String sortBy) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, sortBy));
        
        if (status != null && severity != null) {
            return alarmRepository.findByStatusAndSeverity(status, severity, pageable);
        } else if (status != null) {
            return alarmRepository.findByStatus(status, pageable);
        } else if (severity != null) {
            return alarmRepository.findBySeverity(severity, pageable);
        } else {
            return alarmRepository.findAll(pageable);
        }
    }
    
    /**
     * Resolve alarm
     */
    @Transactional
    public Alarm resolveAlarm(String alarmId, String resolvedBy, String resolutionNotes) {
        try {
            Alarm alarm = getAlarmById(alarmId);
            
            if (alarm.getLifecycle() != null && Boolean.TRUE.equals(alarm.getLifecycle().getResolved())) {
                throw new RuntimeException("Alarm already resolved");
            }
            
            // Initialize lifecycle if null
            if (alarm.getLifecycle() == null) {
                alarm.setLifecycle(Alarm.Lifecycle.builder()
                        .createdAt(Instant.now())
                        .build());
            }
            
            alarm.getLifecycle().setResolved(true);
            alarm.getLifecycle().setResolvedAt(Instant.now());
            alarm.getLifecycle().setResolvedBy(defaultIfBlank(resolvedBy, "system"));
            alarm.getLifecycle().setResolutionNotes(defaultIfBlank(resolutionNotes, "Resolved manually"));
            alarm.setStatus(Alarm.AlarmStatus.RESOLVED);
            
            Alarm updated = alarmRepository.save(alarm);
            
            // Update route alarm count (wrapped in try-catch to not break main flow)
            try {
                updateRouteAlarmCount(alarm.getRouteId());
                updateRouteStatusFromAlarm(updated);
            } catch (Exception e) {
                log.warn("Failed to update route status after resolve: {}", e.getMessage());
            }
            
            sendAlarmNotification(updated);
            
            log.info("Alarm resolved: {} by {}", alarmId, resolvedBy);
            return updated;
        } catch (Exception e) {
            log.error("Error resolving alarm {}: {}", alarmId, e.getMessage(), e);
            throw e;
        }
    }
    
    /**
     * Get alarms for specific route
     */
    public List<Alarm> getAlarmsByRoute(String routeId) {
        return alarmRepository.findByRouteIdOrderByLifecycleCreatedAtDesc(routeId);
    }
    
    /**
     * Get alarms for specific RTU
     */
    public List<Alarm> getAlarmsByRtu(String rtuId) {
        return alarmRepository.findByRtuId(rtuId);
    }
    
    /**
     * Get alarm statistics
     */
    public AlarmStatistics getAlarmStatistics() {
        long total = alarmRepository.count();
        long active = alarmRepository.countByStatus(Alarm.AlarmStatus.ACTIVE);
        long resolved = alarmRepository.countByStatus(Alarm.AlarmStatus.RESOLVED);
        
        long critical = alarmRepository.countByStatusAndSeverity(Alarm.AlarmStatus.ACTIVE, Alarm.AlarmSeverity.CRITICAL);
        long high = alarmRepository.countByStatusAndSeverity(Alarm.AlarmStatus.ACTIVE, Alarm.AlarmSeverity.HIGH);
        long medium = alarmRepository.countByStatusAndSeverity(Alarm.AlarmStatus.ACTIVE, Alarm.AlarmSeverity.MEDIUM);
        long low = alarmRepository.countByStatusAndSeverity(Alarm.AlarmStatus.ACTIVE, Alarm.AlarmSeverity.LOW);
        
        // Get today's alarms
        Instant startOfDay = Instant.now().truncatedTo(ChronoUnit.DAYS);
        long todayCount = alarmRepository.countAlarmsCreatedAfter(startOfDay);
        
        return AlarmStatistics.builder()
                .totalAlarms(total)
                .activeAlarms(active)
                .resolvedAlarms(resolved)
                .criticalAlarms(critical)
                .highAlarms(high)
                .mediumAlarms(medium)
                .lowAlarms(low)
                .alarmsToday(todayCount)
                .build();
    }
    
    /**
     * Update route alarm count
     */
    private void updateRouteAlarmCount(String routeId) {
        if (routeId == null || routeId.isBlank()) {
            return;
        }

        routeRepository.findByRouteId(routeId).ifPresent(route -> {
            List<Alarm> activeAlarms = alarmRepository.findByCreatedAtBetweenAndStatus(
                    Instant.now().minus(30, ChronoUnit.DAYS),
                    Instant.now(),
                    Alarm.AlarmStatus.ACTIVE
            ).stream()
             .filter(a -> routeId.equals(a.getRouteId()))
             .toList();

            if (route.getCurrentCondition() == null) {
                route.setCurrentCondition(Route.CurrentCondition.builder().build());
            }

            route.getCurrentCondition().setActiveAlarms(activeAlarms.size());
            route.getCurrentCondition().setLastTestTime(Instant.now());
            routeRepository.save(route);
        });
    }

    private void updateRouteStatusFromAlarm(Alarm alarm) {
        if (alarm.getRouteId() == null || alarm.getRouteId().isBlank()) {
            return;
        }

        routeRepository.findByRouteId(alarm.getRouteId()).ifPresent(route -> {
            List<Alarm> routeActiveAlarms = alarmRepository.findAllActiveAlarms().stream()
                    .filter(a -> route.getRouteId().equals(a.getRouteId()))
                    .toList();

            if (routeActiveAlarms.isEmpty()) {
                route.setStatus(Route.RouteStatus.NORMAL);
            } else {
                boolean hasBreak = routeActiveAlarms.stream().anyMatch(a ->
                        a.getSeverity() == Alarm.AlarmSeverity.CRITICAL ||
                                a.getAlarmType() == Alarm.AlarmType.FIBER_BREAK);
                route.setStatus(hasBreak ? Route.RouteStatus.BREAK : Route.RouteStatus.DEGRADATION);
            }

            if (route.getCurrentCondition() == null) {
                route.setCurrentCondition(Route.CurrentCondition.builder().build());
            }

            route.getCurrentCondition().setLastTestTime(Instant.now());
            routeRepository.save(route);
        });
    }

    @Scheduled(fixedDelay = 250)
    @Transactional
    public void autoResolveAssignedAlarms() {
        Instant now = Instant.now();
        List<Alarm> dueAlarms = alarmRepository.findDueAutoResolvableAlarms(now);

        for (Alarm alarm : dueAlarms) {
            if (alarm.getLifecycle() == null) {
                continue;
            }

            if (Boolean.TRUE.equals(alarm.getLifecycle().getResolved())) {
                continue;
            }

            alarm.getLifecycle().setResolved(true);
            alarm.getLifecycle().setResolvedAt(now);
            alarm.getLifecycle().setResolvedBy(defaultIfBlank(alarm.getLifecycle().getAssignedBy(), "system-timer"));
            alarm.getLifecycle().setResolutionNotes("Resolved automatically after assigned repair duration");
            alarm.setStatus(Alarm.AlarmStatus.RESOLVED);

            Alarm updated = alarmRepository.save(alarm);
            updateRouteAlarmCount(updated.getRouteId());
            updateRouteStatusFromAlarm(updated);
            sendAlarmNotification(updated);
        }

        if (!dueAlarms.isEmpty()) {
            log.info("Auto-resolved {} technician-assigned alarms", dueAlarms.size());
        }
    }

    private void saveManualOtdrResult(Alarm alarm, ManualAlarmRequest request, Instant measuredAt, String faultType) {
        String status = switch (faultType) {
            case "break" -> "BREAK";
            case "degradation", "high_loss_splice" -> "DEGRADATION";
            default -> "UNKNOWN";
        };

        Double attenuationDb = request.getAttenuationDb();
        Integer routeWavelengthNm = routeRepository.findByRouteId(alarm.getRouteId())
                .map(Route::getCurrentCondition)
                .map(Route.CurrentCondition::getWavelengthNm)
                .orElse(1550);
        Double baselinePowerBudgetDb = routeRepository.findByRouteId(alarm.getRouteId())
                .map(Route::getCurrentCondition)
                .map(Route.CurrentCondition::getAveragePowerDb)
                .orElse(null);

        Double powerBudgetDb = null;
        if (baselinePowerBudgetDb != null && attenuationDb != null) {
            powerBudgetDb = baselinePowerBudgetDb + attenuationDb;
        } else if (baselinePowerBudgetDb != null) {
            powerBudgetDb = baselinePowerBudgetDb;
        } else if (attenuationDb != null) {
            powerBudgetDb = attenuationDb;
        }

        OtdrTestResult result = OtdrTestResult.builder()
                .routeId(alarm.getRouteId())
                .rtuId(alarm.getRtuId())
                .testMode("ManualAlarm")
                .pulseWidthNs(1000)
                .dynamicRangeDb(40.0)
                .wavelengthNm(routeWavelengthNm)
                .testResult("Fail")
                .totalLossDb(powerBudgetDb)
                .eventCount(1)
                .faultDistanceKm(request.getFaultLocationKm())
                .status(status)
                .averagePowerDb(powerBudgetDb)
                .powerVariationDb(attenuationDb)
                .measuredAt(measuredAt)
                .build();

        otdrTestResultRepository.save(result);
    }

    private String normalizeFaultType(String faultType) {
        String value = defaultIfBlank(faultType, "break").toLowerCase(Locale.ROOT);
        return switch (value) {
            case "break", "fiber_break" -> "break";
            case "degradation", "degrade" -> "degradation";
            case "high_loss_splice", "high_loss" -> "high_loss_splice";
            default -> "break";
        };
    }

    private Alarm.AlarmType mapAlarmType(String normalizedFaultType) {
        return switch (normalizedFaultType) {
            case "break" -> Alarm.AlarmType.FIBER_BREAK;
            case "degradation" -> Alarm.AlarmType.DEGRADATION;
            case "high_loss_splice" -> Alarm.AlarmType.HIGH_EVENT_LOSS;
            default -> Alarm.AlarmType.FIBER_FAULT;
        };
    }

    private Alarm.AlarmSeverity mapSeverity(String normalizedFaultType) {
        return switch (normalizedFaultType) {
            case "break" -> Alarm.AlarmSeverity.CRITICAL;
            case "high_loss_splice" -> Alarm.AlarmSeverity.HIGH;
            case "degradation" -> Alarm.AlarmSeverity.MEDIUM;
            default -> Alarm.AlarmSeverity.HIGH;
        };
    }

    private String buildManualAlarmDescription(ManualAlarmRequest request, String normalizedFaultType) {
        if (request.getDescription() != null && !request.getDescription().isBlank()) {
            return request.getDescription();
        }

        String cause = defaultIfBlank(request.getFaultCause(), "unknown cause");
        String location = request.getFaultLocationDescription();
        String locationPart = (location != null && !location.isBlank())
                ? location
                : (request.getFaultLocationKm() != null ? request.getFaultLocationKm() + " km" : "unknown location");
        String attenuation = request.getAttenuationDb() != null
                ? String.format(Locale.US, "%.2f dB", request.getAttenuationDb())
                : "N/A";

        return String.format(
                Locale.US,
                "Manual %s alarm on route %s (cause: %s, location: %s, attenuation: %s)",
                normalizedFaultType.toUpperCase(Locale.ROOT),
                request.getRouteId(),
                cause,
                locationPart,
                attenuation
        );
    }

    private String defaultIfBlank(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value;
    }

    private String requireValue(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new RuntimeException(fieldName + " is required");
        }
        return value;
    }
    
    /**
     * Send alarm notification via WebSocket
     */
    private void sendAlarmNotification(Alarm alarm) {
        try {
            messagingTemplate.convertAndSend("/topic/alarms", alarm);
            log.debug("Sent alarm notification via WebSocket: {}", alarm.getAlarmId());
        } catch (Exception e) {
            log.error("Failed to send WebSocket notification", e);
        }
    }
    
    /**
     * Alarm statistics DTO
     */
    @lombok.Data
    @lombok.Builder
    public static class AlarmStatistics {
        private Long totalAlarms;
        private Long activeAlarms;
        private Long resolvedAlarms;
        private Long criticalAlarms;
        private Long highAlarms;
        private Long mediumAlarms;
        private Long lowAlarms;
        private Long alarmsToday;
    }

    @lombok.Data
    public static class ManualAlarmRequest {
        private String rtuId;
        private String routeId;
        private String faultType;
        private String faultCause;
        private Double faultLocationKm;
        private String faultLocationDescription;
        private Double attenuationDb;
        private String description;
        private Boolean assignToTechnician;
        private String technicianName;
        private Long repairDurationSeconds;
        private Alarm.AlarmSeverity severity;
        private Instant alarmStartTime;
    }
}
