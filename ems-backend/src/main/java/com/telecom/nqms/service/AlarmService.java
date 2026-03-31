package com.telecom.nqms.service;

import com.telecom.nqms.model.Alarm;
import com.telecom.nqms.model.Route;
import com.telecom.nqms.repository.AlarmRepository;
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
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlarmService {
    
    private final AlarmRepository alarmRepository;
    private final RouteRepository routeRepository;
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
                    .acknowledged(false)
                    .resolved(false)
                    .escalated(false)
                    .escalationLevel(0)
                    .build());
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
            
            if (alarm.getLifecycle() != null && alarm.getLifecycle().getResolved()) {
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
            alarm.getLifecycle().setResolvedBy(resolvedBy);
            alarm.getLifecycle().setResolutionNotes(resolutionNotes);
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
        return alarmRepository.findByRouteId(routeId);
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

    @Scheduled(fixedRate = 60000)
    @Transactional
    public void autoResolveStaleAlarms() {
        Instant cutoff = Instant.now().minus(10, ChronoUnit.MINUTES);

        List<Alarm> staleActiveAlarms = alarmRepository.findAllActiveAlarms().stream()
                .filter(a -> a.getLifecycle() != null && a.getLifecycle().getCreatedAt() != null)
                .filter(a -> a.getLifecycle().getCreatedAt().isBefore(cutoff))
                .toList();

        for (Alarm alarm : staleActiveAlarms) {
            if (alarm.getLifecycle() == null) {
                continue;
            }

            alarm.getLifecycle().setResolved(true);
            alarm.getLifecycle().setResolvedAt(Instant.now());
            alarm.getLifecycle().setResolvedBy("system-auto");
            alarm.getLifecycle().setResolutionNotes("Auto-resolved after stabilization window");
            alarm.setStatus(Alarm.AlarmStatus.RESOLVED);

            Alarm updated = alarmRepository.save(alarm);
            updateRouteAlarmCount(updated.getRouteId());
            updateRouteStatusFromAlarm(updated);
            sendAlarmNotification(updated);
        }

        if (!staleActiveAlarms.isEmpty()) {
            log.info("Auto-resolved {} stale alarms", staleActiveAlarms.size());
        }
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
}
