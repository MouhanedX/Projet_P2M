from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime
import logging
from typing import List, Dict
from pydantic import BaseModel

from models import RTUStatus, RouteInfo, OTDRTrace, Alarm
from monitor_service import MonitorService
from otdr_simulator import OTDRSimulator
from mongodb_service import MongoDBService
from config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global monitor services - one per RTU
monitor_services: Dict[str, MonitorService] = {}
db_service = None


class FaultInjectionRequest(BaseModel):
    faultType: str = "break"
    repairDurationSeconds: int | None = None
    attenuationDb: float | None = None
    generateAlarm: bool = True
    sendTestReport: bool = True


class OtdrConfigUpdateRequest(BaseModel):
    mode: str | None = None
    periodSeconds: int | None = None


async def initialize_rtu_monitors():
    """Initialize monitor services for all RTUs from database."""
    global monitor_services

    monitor_services.clear()
    
    logger.info("Initializing RTU Emulator from database...")
    
    if settings.use_database_rtu:
        # Fetch all RTUs from database
        try:
            rtus = db_service.fetch_all_rtus()
            
            if not rtus:
                logger.warning("No RTUs found in database, using fallback RTU from config")
                rtus = [{"rtuId": settings.rtu_id, "name": settings.rtu_name}]
            
            for rtu in rtus:
                rtu_id = (
                    rtu.get("rtuId")
                    or rtu.get("rtu_id")
                    or rtu.get("id")
                    or (str(rtu.get("_id")) if rtu.get("_id") is not None else None)
                )

                if rtu_id is None:
                    logger.warning(f"Skipping RTU with missing identifier: {rtu}")
                    continue

                rtu_id = str(rtu_id).strip()
                if not rtu_id:
                    logger.warning(f"Skipping RTU with blank identifier: {rtu}")
                    continue

                if rtu_id in monitor_services:
                    logger.warning(f"Duplicate RTU identifier '{rtu_id}' found in database, skipping duplicate entry")
                    continue

                logger.info(f"Initializing monitor for RTU: {rtu_id}")
                monitor_services[rtu_id] = MonitorService(rtu_id)

            if not monitor_services:
                logger.warning("Database returned RTUs but none were valid, using fallback RTU from config")
                monitor_services[settings.rtu_id] = MonitorService(settings.rtu_id)
        
        except Exception as e:
            logger.error(f"Error fetching RTUs from database: {e}")
            logger.warning("Falling back to config-based RTU")
            monitor_services[settings.rtu_id] = MonitorService(settings.rtu_id)
    else:
        # Use single RTU from config
        monitor_services[settings.rtu_id] = MonitorService(settings.rtu_id)
    
    logger.info(f"Initialized {len(monitor_services)} RTU monitor(s)")


async def start_all_monitoring():
    """Start monitoring for all RTUs."""
    if settings.auto_start:
        logger.info("Auto-starting monitoring for all RTUs")
        for rtu_id, service in monitor_services.items():
            try:
                await service.start_monitoring()
                logger.info(f"Started monitoring for RTU: {rtu_id}")
            except Exception as e:
                logger.error(f"Failed to start monitoring for RTU {rtu_id}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    global db_service
    
    # Startup
    db_service = MongoDBService(settings.mongodb_uri)
    await initialize_rtu_monitors()
    await start_all_monitoring()
    
    yield
    
    # Shutdown
    logger.info("Shutting down RTU Emulator")
    for rtu_id, service in monitor_services.items():
        if service.is_running:
            await service.stop_monitoring()
            logger.info(f"Stopped monitoring for RTU: {rtu_id}")


# Create FastAPI application
app = FastAPI(
    title="NQMS Fiber RTU Emulator",
    description="Remote Test Unit emulator for fiber optic network monitoring",
    version="2.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "NQMS Fiber RTU Emulator",
        "version": "2.0.0",
        "active_rtus": len(monitor_services),
        "rtu_ids": list(monitor_services.keys()),
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "active_rtus": len(monitor_services),
        "rtu_ids": list(monitor_services.keys())
    }


@app.get("/api/rtus")
async def list_all_rtus():
    """Get status of all RTUs."""
    if not monitor_services:
        raise HTTPException(status_code=503, detail="No RTU services initialized")
    
    rtu_statuses = []
    for rtu_id, service in monitor_services.items():
        status_data = service.get_status()
        ems_connected = await service.ems_client.check_connection()
        
        rtu_statuses.append({
            "rtu_id": rtu_id,
            "is_monitoring": status_data["is_monitoring"],
            "routes_count": len(service.routes),
            "active_alarms": status_data["alarms_sent_today"],
            "ems_connected": ems_connected,
            "temperature_c": status_data.get("temperature_c", 35.0)
        })
    
    return rtu_statuses


@app.get("/api/rtu/{rtu_id}/status", response_model=RTUStatus)
async def get_rtu_status(rtu_id: str):
    """Get current status for a specific RTU."""
    if rtu_id not in monitor_services:
        raise HTTPException(
            status_code=404,
            detail=f"RTU {rtu_id} not found. Available RTUs: {list(monitor_services.keys())}"
        )
    
    monitor_service = monitor_services[rtu_id]
    status_data = monitor_service.get_status()
    ems_connected = await monitor_service.ems_client.check_connection()
    
    return RTUStatus(
        rtu_id=rtu_id,
        rtu_name=status_data.get("rtu_name", rtu_id),
        location=status_data.get("location", "Unknown"),
        is_monitoring=status_data["is_monitoring"],
        routes=status_data["routes"],
        alarms_sent_today=status_data["alarms_sent_today"],
        ems_connected=ems_connected,
        power_supply=status_data.get("power_supply", "Normal"),
        temperature_c=status_data.get("temperature_c", 35.0),
        temperature_state=status_data.get("temperature_state", "OK"),
        communication="Connected" if ems_connected else "Disconnected",
        otdr_availability=status_data.get("otdr_availability", "Ready")
    )


@app.post("/api/rtu/{rtu_id}/start")
async def start_rtu_monitoring(rtu_id: str):
    """Start periodic monitoring for a specific RTU."""
    if rtu_id not in monitor_services:
        raise HTTPException(status_code=404, detail=f"RTU {rtu_id} not found")
    
    monitor_service = monitor_services[rtu_id]
    
    if monitor_service.is_running:
        raise HTTPException(status_code=400, detail=f"Monitoring already running for RTU {rtu_id}")
    
    await monitor_service.start_monitoring()
    
    return {
        "message": f"Monitoring started for RTU {rtu_id}",
        "interval_seconds": settings.monitoring_interval,
        "routes": list(monitor_service.routes.keys())
    }


@app.post("/api/rtu/{rtu_id}/stop")
async def stop_rtu_monitoring(rtu_id: str):
    """Stop periodic monitoring for a specific RTU."""
    if rtu_id not in monitor_services:
        raise HTTPException(status_code=404, detail=f"RTU {rtu_id} not found")
    
    monitor_service = monitor_services[rtu_id]
    
    if not monitor_service.is_running:
        raise HTTPException(status_code=400, detail=f"Monitoring not running for RTU {rtu_id}")
    
    await monitor_service.stop_monitoring()
    
    return {"message": f"Monitoring stopped for RTU {rtu_id}"}


@app.post("/api/rtu/{rtu_id}/test/{route_id}")
async def test_route(rtu_id: str, route_id: str):
    """
    Trigger on-demand test for a specific route in an RTU.
    """
    if rtu_id not in monitor_services:
        raise HTTPException(status_code=404, detail=f"RTU {rtu_id} not found")
    
    monitor_service = monitor_services[rtu_id]
    
    if route_id not in monitor_service.routes:
        raise HTTPException(
            status_code=404,
            detail=f"Route {route_id} not found. Available routes: {list(monitor_service.routes.keys())}"
        )
    
    logger.info(f"On-demand test requested for RTU {rtu_id}, route {route_id}")
    report = await monitor_service.test_route(route_id, "Manual", None, False)
    
    return {
        "message": f"Test completed for route {route_id}",
        "rtu_id": rtu_id,
        "route_id": route_id,
        "event_reference_file": report.event_reference_file,
        "measurement_reference_file": report.measurement_reference_file,
        "average_power_db": report.average_power_db,
        "power_variation_db": report.power_variation_db,
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/rtu/{rtu_id}/otdr-config")
async def get_rtu_otdr_config(rtu_id: str):
    """Get OTDR test mode and period configuration for a specific RTU."""
    if rtu_id not in monitor_services:
        raise HTTPException(status_code=404, detail=f"RTU {rtu_id} not found")

    monitor_service = monitor_services[rtu_id]
    config = monitor_service.get_test_config()
    config["rtu_id"] = rtu_id
    config["is_monitoring"] = monitor_service.is_running
    return config


@app.put("/api/rtu/{rtu_id}/otdr-config")
async def update_rtu_otdr_config(rtu_id: str, request: OtdrConfigUpdateRequest):
    """Update OTDR test mode (auto/manual) and period for a specific RTU."""
    if rtu_id not in monitor_services:
        raise HTTPException(status_code=404, detail=f"RTU {rtu_id} not found")

    monitor_service = monitor_services[rtu_id]
    updated = monitor_service.update_test_config(
        mode=request.mode,
        period_seconds=request.periodSeconds,
    )

    if updated.get("mode") == "auto" and not monitor_service.is_running:
        await monitor_service.start_monitoring()

    updated["rtu_id"] = rtu_id
    updated["is_monitoring"] = monitor_service.is_running
    return updated


@app.get("/api/rtu/{rtu_id}/routes")
async def get_rtu_routes(rtu_id: str):
    """Get all routes for a specific RTU."""
    if rtu_id not in monitor_services:
        raise HTTPException(status_code=404, detail=f"RTU {rtu_id} not found")
    
    monitor_service = monitor_services[rtu_id]
    return list(monitor_service.routes.values())


@app.get("/api/rtu/{rtu_id}/routes/{route_id}")
async def get_rtu_route(rtu_id: str, route_id: str):
    """Get information about a specific route in an RTU."""
    if rtu_id not in monitor_services:
        raise HTTPException(status_code=404, detail=f"RTU {rtu_id} not found")
    
    monitor_service = monitor_services[rtu_id]
    
    try:
        return monitor_service.get_route_info(route_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/rtu/{rtu_id}/routes/{route_id}/trace-reference")
async def get_route_trace_reference(rtu_id: str, route_id: str, maxPoints: int = 1200):
    """Get sampled reference trace points (distance-power) from route trace.dat file."""
    if rtu_id not in monitor_services:
        raise HTTPException(status_code=404, detail=f"RTU {rtu_id} not found")

    monitor_service = monitor_services[rtu_id]

    if route_id not in monitor_service.routes:
        raise HTTPException(
            status_code=404,
            detail=f"Route {route_id} not found in RTU {rtu_id}. Available routes: {list(monitor_service.routes.keys())}"
        )

    safe_max_points = max(100, min(maxPoints, 5000))

    try:
        profile = monitor_service.get_route_reference_profile(route_id, max_points=safe_max_points)
        return {
            "rtu_id": rtu_id,
            **profile,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to read trace reference for {route_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to read route trace reference")


@app.get("/api/rtu/{rtu_id}/routes/{route_id}/reference-pdf")
async def download_route_reference_pdf(rtu_id: str, route_id: str):
    """Download the reference PDF for a route when available."""
    if rtu_id not in monitor_services:
        raise HTTPException(status_code=404, detail=f"RTU {rtu_id} not found")

    monitor_service = monitor_services[rtu_id]

    if route_id not in monitor_service.routes:
        raise HTTPException(
            status_code=404,
            detail=f"Route {route_id} not found in RTU {rtu_id}. Available routes: {list(monitor_service.routes.keys())}"
        )

    try:
        pdf_file = monitor_service.get_route_reference_pdf_file(route_id)
        if pdf_file is None:
            raise HTTPException(status_code=404, detail=f"Reference PDF not found for route {route_id}")

        return FileResponse(
            path=str(pdf_file),
            media_type="application/pdf",
            filename=pdf_file.name,
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to serve reference PDF for {route_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to download route reference PDF")


@app.post("/api/rtu/{rtu_id}/routes/{route_id}/fault")
async def inject_route_fault(rtu_id: str, route_id: str, request: FaultInjectionRequest):
    """Inject a manual fault on a route and raise an alarm immediately."""
    if rtu_id not in monitor_services:
        raise HTTPException(status_code=404, detail=f"RTU {rtu_id} not found")

    monitor_service = monitor_services[rtu_id]

    if route_id not in monitor_service.routes:
        raise HTTPException(
            status_code=404,
            detail=f"Route {route_id} not found in RTU {rtu_id}. Available routes: {list(monitor_service.routes.keys())}"
        )

    try:
        result = await monitor_service.trigger_manual_fault(
            route_id,
            request.faultType,
            request.repairDurationSeconds,
            request.attenuationDb,
            request.generateAlarm,
            request.sendTestReport,
        )
        return {
            "message": f"Manual fault injected for route {route_id}",
            "rtu_id": rtu_id,
            "route_id": route_id,
            "fault_type": result["fault_type"],
            "status": result["status"],
            "duration_seconds": result.get("duration_seconds"),
            "expires_at": result.get("expires_at"),
            "attenuation_db": result.get("attenuation_db"),
            "timestamp": datetime.now().isoformat(),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to inject fault for {route_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to inject route fault")


@app.post("/api/rtu/{rtu_id}/routes/{route_id}/resolve")
async def resolve_route_fault(rtu_id: str, route_id: str):
    """Resolve a manual fault and clear active alarms for the route."""
    if rtu_id not in monitor_services:
        raise HTTPException(status_code=404, detail=f"RTU {rtu_id} not found")

    monitor_service = monitor_services[rtu_id]

    if route_id not in monitor_service.routes:
        raise HTTPException(
            status_code=404,
            detail=f"Route {route_id} not found in RTU {rtu_id}. Available routes: {list(monitor_service.routes.keys())}"
        )

    try:
        result = await monitor_service.resolve_manual_fault(route_id)
        return {
            "message": f"Manual fault resolved for route {route_id}",
            "rtu_id": rtu_id,
            "route_id": route_id,
            "resolved_alarms": result["resolved_alarms"],
            "status": result["status"],
            "timestamp": datetime.now().isoformat(),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to resolve fault for {route_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to resolve route fault")


@app.get("/api/config")
async def get_config():
    """Get RTU Emulator configuration."""
    return {
        "use_database_rtu": settings.use_database_rtu,
        "active_rtus": len(monitor_services),
        "rtu_ids": list(monitor_services.keys()),
        "ems_url": settings.ems_url,
        "monitoring_interval": settings.monitoring_interval,
        "otdr_test_defaults": {
            "mode": settings.otdr_test_mode,
            "period_seconds": settings.otdr_test_period_seconds,
            "reference_dir": settings.routes_reference_dir,
            "power_variation_min_db": settings.power_variation_min_db,
            "power_variation_max_db": settings.power_variation_max_db,
        },
        "thresholds": {
            "degradation_db": settings.alarm_threshold_degradation,
            "break_db": settings.alarm_threshold_break,
            "event_loss_db": settings.event_loss_threshold
        },
        "otdr_parameters": {
            "fiber_attenuation_db_per_km": settings.fiber_attenuation,
            "min_fiber_length_km": settings.min_fiber_length,
            "max_fiber_length_km": settings.max_fiber_length
        }
    }


@app.get("/api/kpis")
async def get_latest_kpis():
    """Get latest KPIs from database."""
    try:
        if not db_service:
            raise HTTPException(status_code=503, detail="Database service not initialized")
        
        # Fetch latest KPIs
        with db_service.get_connection() as db:
            kpis = list(db.kpis.find({}).sort("timestamp", -1).limit(50) or [])
        return {"kpis": kpis, "count": len(kpis)}
    except Exception as e:
        logger.error(f"Error retrieving KPIs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/rtu/{rtu_id}/kpis")
async def get_rtu_kpis(rtu_id: str):
    """Get KPIs for a specific RTU."""
    try:
        if not db_service:
            raise HTTPException(status_code=503, detail="Database service not initialized")
        
        if rtu_id not in monitor_services:
            raise HTTPException(status_code=404, detail=f"RTU {rtu_id} not found")
        
        # Fetch RTU-specific KPIs
        with db_service.get_connection() as db:
            kpis = list(db.kpis.find({
                "$or": [
                    {"scope.rtu_id": rtu_id},
                    {"scope.type": "GLOBAL"}
                ]
            }).sort("timestamp", -1).limit(50) or [])
        
        return {"rtu_id": rtu_id, "kpis": kpis, "count": len(kpis)}
    except Exception as e:
        logger.error(f"Error retrieving KPIs for RTU {rtu_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/routes/{route_id}/kpis")
async def get_route_kpis(route_id: str):
    """Get KPIs for a specific route."""
    try:
        if not db_service:
            raise HTTPException(status_code=503, detail="Database service not initialized")
        
        # Fetch route-specific KPIs
        with db_service.get_connection() as db:
            kpis = list(db.kpis.find({
                "scope.rtu_id": route_id,
                "kpi_type": "ROUTE_PERFORMANCE"
            }).sort("timestamp", -1).limit(50) or [])
        
        return {"route_id": route_id, "kpis": kpis, "count": len(kpis)}
    except Exception as e:
        logger.error(f"Error retrieving KPIs for route {route_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
