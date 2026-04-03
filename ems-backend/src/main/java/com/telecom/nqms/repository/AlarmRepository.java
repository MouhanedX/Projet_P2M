package com.telecom.nqms.repository;

import com.telecom.nqms.model.Alarm;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface AlarmRepository extends MongoRepository<Alarm, String> {
    
    Optional<Alarm> findByAlarmId(String alarmId);
    
    List<Alarm> findByRtuId(String rtuId);
    
    List<Alarm> findByRouteId(String routeId);

    List<Alarm> findByRouteIdOrderByLifecycleCreatedAtDesc(String routeId);
    
    Page<Alarm> findByStatus(Alarm.AlarmStatus status, Pageable pageable);
    
    Page<Alarm> findBySeverity(Alarm.AlarmSeverity severity, Pageable pageable);
    
    Page<Alarm> findByStatusAndSeverity(Alarm.AlarmStatus status, Alarm.AlarmSeverity severity, Pageable pageable);
    
    @Query("{'lifecycle.createdAt': {$gte: ?0, $lte: ?1}, 'status': ?2}")
    List<Alarm> findByCreatedAtBetweenAndStatus(Instant start, Instant end, Alarm.AlarmStatus status);
    
    @Query("{'status': 'ACTIVE'}")
    List<Alarm> findAllActiveAlarms();
    
    @Query("{'status': 'ACTIVE', 'severity': {$in: ?0}}")
    List<Alarm> findActiveBySeverities(List<Alarm.AlarmSeverity> severities);
    
    @Query("{'lifecycle.acknowledged': false, 'status': 'ACTIVE'}")
    List<Alarm> findUnacknowledgedAlarms();
    
    Long countByStatus(Alarm.AlarmStatus status);
    
    Long countByStatusAndSeverity(Alarm.AlarmStatus status, Alarm.AlarmSeverity severity);
    
    @Query(value = "{'lifecycle.createdAt': {$gte: ?0}}", count = true)
    Long countAlarmsCreatedAfter(Instant since);

    @Query("{'status': 'RESOLVED', 'lifecycle.createdAt': {$gte: ?0}, 'lifecycle.resolvedAt': {$ne: null}}")
    List<Alarm> findResolvedSince(Instant since);

    @Query("{'lifecycle.createdAt': {$gte: ?0}}")
    List<Alarm> findCreatedSince(Instant since);

    @Query("{'status': 'ACTIVE', 'lifecycle.assignedToTechnician': true, 'lifecycle.autoResolveAt': {$lte: ?0}}")
    List<Alarm> findDueAutoResolvableAlarms(Instant now);
}
