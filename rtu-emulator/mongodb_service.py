"""MongoDB service for fetching RTUs and Routes from database."""

import logging
from typing import List, Dict, Optional
from pymongo import MongoClient
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class MongoDBService:
    """Service to interact with MongoDB for RTUs and Routes."""
    
    def __init__(self, mongodb_uri: str = "mongodb://localhost:27017/nqms"):
        self.mongodb_uri = mongodb_uri
        self.db_name = "nqms"
        self.rtu_collection = "rtus"
        self.route_collection = "routes"
        self._client = None
    
    @contextmanager
    def get_connection(self):
        """Get MongoDB connection context manager."""
        try:
            client = MongoClient(self.mongodb_uri, serverSelectionTimeoutMS=5000)
            client.server_info()  # Test connection
            yield client[self.db_name]
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise
        finally:
            if client:
                client.close()
    
    def fetch_all_rtus(self) -> List[Dict]:
        """Fetch all RTUs from database."""
        try:
            with self.get_connection() as db:
                rtus = list(db[self.rtu_collection].find({"status": "ACTIVE"}))
                logger.info(f"Fetched {len(rtus)} active RTUs from database")
                return rtus
        except Exception as e:
            logger.error(f"Error fetching RTUs: {e}")
            return []
    
    def fetch_rtu_by_id(self, rtu_id: str) -> Optional[Dict]:
        """Fetch a specific RTU by ID."""
        try:
            with self.get_connection() as db:
                rtu = db[self.rtu_collection].find_one({"rtuId": rtu_id})
                if rtu:
                    logger.info(f"Fetched RTU: {rtu_id}")
                return rtu
        except Exception as e:
            logger.error(f"Error fetching RTU {rtu_id}: {e}")
            return None
    
    def fetch_routes_for_rtu(self, rtu_id: str) -> List[Dict]:
        """Fetch all routes assigned to a specific RTU."""
        try:
            with self.get_connection() as db:
                routes = list(db[self.route_collection].find(
                    {"rtuId": rtu_id, "status": "ACTIVE"}
                ))
                logger.info(f"Fetched {len(routes)} routes for RTU {rtu_id}")
                return routes
        except Exception as e:
            logger.error(f"Error fetching routes for RTU {rtu_id}: {e}")
            return []
    
    def fetch_route_by_id(self, route_id: str) -> Optional[Dict]:
        """Fetch a specific route by ID."""
        try:
            with self.get_connection() as db:
                route = db[self.route_collection].find_one({"routeId": route_id})
                if route:
                    logger.info(f"Fetched Route: {route_id}")
                return route
        except Exception as e:
            logger.error(f"Error fetching route {route_id}: {e}")
            return None
    
    def fetch_all_routes(self) -> List[Dict]:
        """Fetch all active routes from database."""
        try:
            with self.get_connection() as db:
                routes = list(db[self.route_collection].find({"status": "ACTIVE"}))
                logger.info(f"Fetched {len(routes)} active routes from database")
                return routes
        except Exception as e:
            logger.error(f"Error fetching routes: {e}")
            return []
    
    def insert_alarm(self, alarm_dict: Dict) -> bool:
        """Insert an alarm into the alarms collection."""
        try:
            with self.get_connection() as db:
                alarm_collection = db["alarms"]
                
                # Ensure alarmId is unique
                result = alarm_collection.insert_one(alarm_dict)
                
                logger.info(f"Alarm inserted successfully: {alarm_dict.get('alarmId')}")
                return True
        except Exception as e:
            logger.error(f"Error inserting alarm: {e}")
            return False
    
    def insert_kpi(self, kpi_dict: Dict) -> bool:
        """Insert a KPI into the kpis collection."""
        try:
            with self.get_connection() as db:
                kpi_collection = db["kpis"]
                result = kpi_collection.insert_one(kpi_dict)
                
                logger.info(f"KPI inserted successfully: {kpi_dict.get('kpi_id')}")
                return True
        except Exception as e:
            logger.error(f"Error inserting KPI: {e}")
            return False
