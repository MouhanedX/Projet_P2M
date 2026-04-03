#!/usr/bin/env python3
"""
Complete database seeding script for MongoDB Atlas
Extracts all RTUs and Routes from standalone-rtu-map/app.js 
and seeds them into MongoDB with correct schema matching Java models
"""

import os
import sys
import json
from datetime import datetime
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

# MongoDB Atlas connection string
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb+srv://Mouhaned_P2M:P2M2026@cluster1.dhwsaii.mongodb.net/nqms?retryWrites=true&w=majority')
DB_NAME = 'nqms'

# RTUs extracted from standalone-rtu-map/app.js - MATCHING Rtu.java MODEL
RTUS_DATA = [
    {
        "rtuId": "RTU_TN_01",
        "rtuName": "Tunis RTU",
        "location": {
            "name": "Tunis RTU",
            "region": "Tunis",
            "coordinates": {
                "latitude": 36.892388340093454,
                "longitude": 10.208442785262585
            }
        },
        "status": "ACTIVE",
        "isMonitoring": True,
        "capabilities": {
            "maxFiberLengthKm": 100,
            "wavelengths": [1310, 1550],
            "dynamicRangeDb": 40
        },
        "health": {
            "operationalStatus": "HEALTHY",
            "temperature": 35.5,
            "powerSupply": "Normal"
        },
        "configuration": {
            "monitoringInterval": 60,
            "autoStart": True
        },
        "statistics": {
            "totalAlarms": 0,
            "activeAlarms": 0
        },
        "createdAt": datetime.utcnow()
    },
    {
        "rtuId": "RTU_TN_02",
        "rtuName": "Kef RTU",
        "location": {
            "name": "Kef RTU",
            "region": "Kef",
            "coordinates": {
                "latitude": 36.16453974514943,
                "longitude": 8.703746814430998
            }
        },
        "status": "ACTIVE",
        "isMonitoring": True,
        "capabilities": {
            "maxFiberLengthKm": 100,
            "wavelengths": [1310, 1550],
            "dynamicRangeDb": 40
        },
        "health": {
            "operationalStatus": "HEALTHY",
            "temperature": 35.5,
            "powerSupply": "Normal"
        },
        "configuration": {
            "monitoringInterval": 60,
            "autoStart": True
        },
        "statistics": {
            "totalAlarms": 0,
            "activeAlarms": 0
        },
        "createdAt": datetime.utcnow()
    },
    {
        "rtuId": "RTU_TN_03",
        "rtuName": "Sidi Bouzid RTU",
        "location": {
            "name": "Sidi Bouzid RTU",
            "region": "Sidi Bouzid",
            "coordinates": {
                "latitude": 35.037454686321325,
                "longitude": 9.486028916209502
            }
        },
        "status": "ACTIVE",
        "isMonitoring": True,
        "capabilities": {
            "maxFiberLengthKm": 100,
            "wavelengths": [1310, 1550],
            "dynamicRangeDb": 40
        },
        "health": {
            "operationalStatus": "HEALTHY",
            "temperature": 35.5,
            "powerSupply": "Normal"
        },
        "configuration": {
            "monitoringInterval": 60,
            "autoStart": True
        },
        "statistics": {
            "totalAlarms": 0,
            "activeAlarms": 0
        },
        "createdAt": datetime.utcnow()
    },
    {
        "rtuId": "RTU_TN_04",
        "rtuName": "Kairouan RTU",
        "location": {
            "name": "Kairouan RTU",
            "region": "Kairouan",
            "coordinates": {
                "latitude": 35.680625546171335,
                "longitude": 10.09540541901131
            }
        },
        "status": "ACTIVE",
        "isMonitoring": True,
        "capabilities": {
            "maxFiberLengthKm": 100,
            "wavelengths": [1310, 1550],
            "dynamicRangeDb": 40
        },
        "health": {
            "operationalStatus": "HEALTHY",
            "temperature": 35.5,
            "powerSupply": "Normal"
        },
        "configuration": {
            "monitoringInterval": 60,
            "autoStart": True
        },
        "statistics": {
            "totalAlarms": 0,
            "activeAlarms": 0
        },
        "createdAt": datetime.utcnow()
    },
    {
        "rtuId": "RTU_TN_05",
        "rtuName": "Gafsa RTU",
        "location": {
            "name": "Gafsa RTU",
            "region": "Gafsa",
            "coordinates": {
                "latitude": 34.428625020010145,
                "longitude": 8.7898838248927
            }
        },
        "status": "ACTIVE",
        "isMonitoring": True,
        "capabilities": {
            "maxFiberLengthKm": 100,
            "wavelengths": [1310, 1550],
            "dynamicRangeDb": 40
        },
        "health": {
            "operationalStatus": "HEALTHY",
            "temperature": 35.5,
            "powerSupply": "Normal"
        },
        "configuration": {
            "monitoringInterval": 60,
            "autoStart": True
        },
        "statistics": {
            "totalAlarms": 0,
            "activeAlarms": 0
        },
        "createdAt": datetime.utcnow()
    }
]

# Routes extracted from standalone-rtu-map/app.js - MATCHING Route.java MODEL
ROUTES_DATA = [
    {
        "routeId": "RTU_TN_01_R1",
        "routeName": "Route_1774204296494",
        "rtuId": "RTU_TN_01",
        "region": "Tunis",
        "status": "ACTIVE",
        "priority": "HIGH",
        "fiberSpec": {
            "type": "Single Mode",
            "coreDiameterUm": 10.4,
            "lengthKm": 34.0,
            "expectedAttenuationDbPerKm": 0.2
        },
        "topology": {
            "startPoint": "RTU_TN_01",
            "endPoint": "Route_1774204296494",
            "intermediatePoints": [
                {"name": "Point_1", "distanceKm": 8.5, "type": "SPLICE"},
                {"name": "Point_2", "distanceKm": 17.0, "type": "CONNECTOR"},
                {"name": "Point_3", "distanceKm": 25.5, "type": "SPLICE"}
            ]
        },
        "baseline": {
            "totalLossDb": 6.8,
            "eventCount": 8,
            "maxEventLossDb": 1.2
        },
        "currentCondition": {
            "totalLossDb": 6.8,
            "status": "NORMAL",
            "lastTestedAt": datetime.utcnow()
        },
        "maintenance": {
            "lastMaintenanceDate": datetime.utcnow(),
            "nextScheduledDate": datetime.utcnow()
        },
        "sla": {
            "targetAvailabilityPercent": 99.9,
            "maxAcceptableLossDb": 8.0
        },
        "createdAt": datetime.utcnow()
    },
    {
        "routeId": "RTU_TN_01_R2",
        "routeName": "Route_1774204456490",
        "rtuId": "RTU_TN_01",
        "region": "Tunis",
        "status": "ACTIVE",
        "priority": "HIGH",
        "fiberSpec": {
            "type": "Single Mode",
            "coreDiameterUm": 10.4,
            "lengthKm": 14.0,
            "expectedAttenuationDbPerKm": 0.2
        },
        "topology": {
            "startPoint": "RTU_TN_01",
            "endPoint": "Route_1774204456490",
            "intermediatePoints": []
        },
        "baseline": {
            "totalLossDb": 2.8,
            "eventCount": 3,
            "maxEventLossDb": 0.8
        },
        "currentCondition": {
            "totalLossDb": 2.8,
            "status": "NORMAL",
            "lastTestedAt": datetime.utcnow()
        },
        "maintenance": {
            "lastMaintenanceDate": datetime.utcnow(),
            "nextScheduledDate": datetime.utcnow()
        },
        "sla": {
            "targetAvailabilityPercent": 99.9,
            "maxAcceptableLossDb": 4.0
        },
        "createdAt": datetime.utcnow()
    },
    {
        "routeId": "RTU_TN_01_R3",
        "routeName": "Route_1774204360105",
        "rtuId": "RTU_TN_01",
        "region": "Tunis",
        "status": "ACTIVE",
        "priority": "MEDIUM",
        "fiberSpec": {
            "type": "Single Mode",
            "coreDiameterUm": 10.4,
            "lengthKm": 11.0,
            "expectedAttenuationDbPerKm": 0.2
        },
        "topology": {
            "startPoint": "RTU_TN_01",
            "endPoint": "Route_1774204360105",
            "intermediatePoints": []
        },
        "baseline": {
            "totalLossDb": 2.2,
            "eventCount": 2,
            "maxEventLossDb": 0.6
        },
        "currentCondition": {
            "totalLossDb": 2.2,
            "status": "NORMAL",
            "lastTestedAt": datetime.utcnow()
        },
        "maintenance": {
            "lastMaintenanceDate": datetime.utcnow(),
            "nextScheduledDate": datetime.utcnow()
        },
        "sla": {
            "targetAvailabilityPercent": 99.9,
            "maxAcceptableLossDb": 3.5
        },
        "createdAt": datetime.utcnow()
    },
    {
        "routeId": "RTU_TN_02_R1",
        "routeName": "Route_1774203193124",
        "rtuId": "RTU_TN_02",
        "region": "Kef",
        "status": "ACTIVE",
        "priority": "HIGH",
        "fiberSpec": {
            "type": "Single Mode",
            "coreDiameterUm": 10.4,
            "lengthKm": 15.0,
            "expectedAttenuationDbPerKm": 0.2
        },
        "topology": {
            "startPoint": "RTU_TN_02",
            "endPoint": "Route_1774203193124",
            "intermediatePoints": []
        },
        "baseline": {
            "totalLossDb": 3.0,
            "eventCount": 4,
            "maxEventLossDb": 0.8
        },
        "currentCondition": {
            "totalLossDb": 3.0,
            "status": "NORMAL",
            "lastTestedAt": datetime.utcnow()
        },
        "maintenance": {
            "lastMaintenanceDate": datetime.utcnow(),
            "nextScheduledDate": datetime.utcnow()
        },
        "sla": {
            "targetAvailabilityPercent": 99.9,
            "maxAcceptableLossDb": 4.5
        },
        "createdAt": datetime.utcnow()
    },
    {
        "routeId": "RTU_TN_02_R2",
        "routeName": "Route_1774202549425",
        "rtuId": "RTU_TN_02",
        "region": "Kef",
        "status": "ACTIVE",
        "priority": "HIGH",
        "fiberSpec": {
            "type": "Single Mode",
            "coreDiameterUm": 10.4,
            "lengthKm": 32.0,
            "expectedAttenuationDbPerKm": 0.2
        },
        "topology": {
            "startPoint": "RTU_TN_02",
            "endPoint": "Route_1774202549425",
            "intermediatePoints": []
        },
        "baseline": {
            "totalLossDb": 6.4,
            "eventCount": 7,
            "maxEventLossDb": 1.0
        },
        "currentCondition": {
            "totalLossDb": 6.4,
            "status": "NORMAL",
            "lastTestedAt": datetime.utcnow()
        },
        "maintenance": {
            "lastMaintenanceDate": datetime.utcnow(),
            "nextScheduledDate": datetime.utcnow()
        },
        "sla": {
            "targetAvailabilityPercent": 99.9,
            "maxAcceptableLossDb": 8.0
        },
        "createdAt": datetime.utcnow()
    },
    {
        "routeId": "RTU_TN_02_R3",
        "routeName": "Route_1774203245714",
        "rtuId": "RTU_TN_02",
        "region": "Kef",
        "status": "ACTIVE",
        "priority": "MEDIUM",
        "fiberSpec": {
            "type": "Single Mode",
            "coreDiameterUm": 10.4,
            "lengthKm": 65.0,
            "expectedAttenuationDbPerKm": 0.2
        },
        "topology": {
            "startPoint": "RTU_TN_02",
            "endPoint": "Route_1774203245714",
            "intermediatePoints": []
        },
        "baseline": {
            "totalLossDb": 13.0,
            "eventCount": 5,
            "maxEventLossDb": 2.0
        },
        "currentCondition": {
            "totalLossDb": 13.0,
            "status": "NORMAL",
            "lastTestedAt": datetime.utcnow()
        },
        "maintenance": {
            "lastMaintenanceDate": datetime.utcnow(),
            "nextScheduledDate": datetime.utcnow()
        },
        "sla": {
            "targetAvailabilityPercent": 99.5,
            "maxAcceptableLossDb": 15.0
        },
        "createdAt": datetime.utcnow()
    },
    {
        "routeId": "RTU_TN_03_R1",
        "routeName": "Route_1774203669254",
        "rtuId": "RTU_TN_03",
        "region": "Sidi Bouzid",
        "status": "ACTIVE",
        "priority": "HIGH",
        "fiberSpec": {
            "type": "Single Mode",
            "coreDiameterUm": 10.4,
            "lengthKm": 9.0,
            "expectedAttenuationDbPerKm": 0.2
        },
        "topology": {
            "startPoint": "RTU_TN_03",
            "endPoint": "Route_1774203669254",
            "intermediatePoints": []
        },
        "baseline": {
            "totalLossDb": 15.2,
            "eventCount": 6,
            "maxEventLossDb": 2.5
        },
        "currentCondition": {
            "totalLossDb": 15.2,
            "status": "NORMAL",
            "lastTestedAt": datetime.utcnow()
        },
        "maintenance": {
            "lastMaintenanceDate": datetime.utcnow(),
            "nextScheduledDate": datetime.utcnow()
        },
        "sla": {
            "targetAvailabilityPercent": 99.5,
            "maxAcceptableLossDb": 18.0
        },
        "createdAt": datetime.utcnow()
    },
    {
        "routeId": "RTU_TN_03_R2",
        "routeName": "Route_1774203549628",
        "rtuId": "RTU_TN_03",
        "region": "Sidi Bouzid",
        "status": "ACTIVE",
        "priority": "MEDIUM",
        "fiberSpec": {
            "type": "Single Mode",
            "coreDiameterUm": 10.4,
            "lengthKm": 5.0,
            "expectedAttenuationDbPerKm": 0.2
        },
        "topology": {
            "startPoint": "RTU_TN_03",
            "endPoint": "Route_1774203549628",
            "intermediatePoints": []
        },
        "baseline": {
            "totalLossDb": 5.8,
            "eventCount": 4,
            "maxEventLossDb": 1.2
        },
        "currentCondition": {
            "totalLossDb": 5.8,
            "status": "NORMAL",
            "lastTestedAt": datetime.utcnow()
        },
        "maintenance": {
            "lastMaintenanceDate": datetime.utcnow(),
            "nextScheduledDate": datetime.utcnow()
        },
        "sla": {
            "targetAvailabilityPercent": 99.9,
            "maxAcceptableLossDb": 7.5
        },
        "createdAt": datetime.utcnow()
    },
    {
        "routeId": "RTU_TN_03_R3",
        "routeName": "Route_1774203578126",
        "rtuId": "RTU_TN_03",
        "region": "Sidi Bouzid",
        "status": "ACTIVE",
        "priority": "HIGH",
        "fiberSpec": {
            "type": "Single Mode",
            "coreDiameterUm": 10.4,
            "lengthKm": 29.0,
            "expectedAttenuationDbPerKm": 0.2
        },
        "topology": {
            "startPoint": "RTU_TN_03",
            "endPoint": "Route_1774203578126",
            "intermediatePoints": []
        },
        "baseline": {
            "totalLossDb": 17.4,
            "eventCount": 7,
            "maxEventLossDb": 2.8
        },
        "currentCondition": {
            "totalLossDb": 17.4,
            "status": "NORMAL",
            "lastTestedAt": datetime.utcnow()
        },
        "maintenance": {
            "lastMaintenanceDate": datetime.utcnow(),
            "nextScheduledDate": datetime.utcnow()
        },
        "sla": {
            "targetAvailabilityPercent": 99.5,
            "maxAcceptableLossDb": 20.0
        },
        "createdAt": datetime.utcnow()
    },
    {
        "routeId": "RTU_TN_04_R1",
        "routeName": "Route_1774203307894",
        "rtuId": "RTU_TN_04",
        "region": "Kairouan",
        "status": "ACTIVE",
        "priority": "MEDIUM",
        "fiberSpec": {
            "type": "Single Mode",
            "coreDiameterUm": 10.4,
            "lengthKm": 19.0,
            "expectedAttenuationDbPerKm": 0.2
        },
        "topology": {
            "startPoint": "RTU_TN_04",
            "endPoint": "Route_1774203307894",
            "intermediatePoints": []
        },
        "baseline": {
            "totalLossDb": 3.8,
            "eventCount": 3,
            "maxEventLossDb": 0.9
        },
        "currentCondition": {
            "totalLossDb": 3.8,
            "status": "NORMAL",
            "lastTestedAt": datetime.utcnow()
        },
        "maintenance": {
            "lastMaintenanceDate": datetime.utcnow(),
            "nextScheduledDate": datetime.utcnow()
        },
        "sla": {
            "targetAvailabilityPercent": 99.9,
            "maxAcceptableLossDb": 5.0
        },
        "createdAt": datetime.utcnow()
    },
    {
        "routeId": "RTU_TN_04_R2",
        "routeName": "Route_1774203387450",
        "rtuId": "RTU_TN_04",
        "region": "Kairouan",
        "status": "ACTIVE",
        "priority": "HIGH",
        "fiberSpec": {
            "type": "Single Mode",
            "coreDiameterUm": 10.4,
            "lengthKm": 33.0,
            "expectedAttenuationDbPerKm": 0.2
        },
        "topology": {
            "startPoint": "RTU_TN_04",
            "endPoint": "Route_1774203387450",
            "intermediatePoints": []
        },
        "baseline": {
            "totalLossDb": 6.6,
            "eventCount": 5,
            "maxEventLossDb": 1.1
        },
        "currentCondition": {
            "totalLossDb": 6.6,
            "status": "NORMAL",
            "lastTestedAt": datetime.utcnow()
        },
        "maintenance": {
            "lastMaintenanceDate": datetime.utcnow(),
            "nextScheduledDate": datetime.utcnow()
        },
        "sla": {
            "targetAvailabilityPercent": 99.9,
            "maxAcceptableLossDb": 8.5
        },
        "createdAt": datetime.utcnow()
    },
    {
        "routeId": "RTU_TN_04_R3",
        "routeName": "Route_1774203492192",
        "rtuId": "RTU_TN_04",
        "region": "Kairouan",
        "status": "ACTIVE",
        "priority": "MEDIUM",
        "fiberSpec": {
            "type": "Single Mode",
            "coreDiameterUm": 10.4,
            "lengthKm": 32.0,
            "expectedAttenuationDbPerKm": 0.2
        },
        "topology": {
            "startPoint": "RTU_TN_04",
            "endPoint": "Route_1774203492192",
            "intermediatePoints": []
        },
        "baseline": {
            "totalLossDb": 6.4,
            "eventCount": 4,
            "maxEventLossDb": 1.0
        },
        "currentCondition": {
            "totalLossDb": 6.4,
            "status": "NORMAL",
            "lastTestedAt": datetime.utcnow()
        },
        "maintenance": {
            "lastMaintenanceDate": datetime.utcnow(),
            "nextScheduledDate": datetime.utcnow()
        },
        "sla": {
            "targetAvailabilityPercent": 99.9,
            "maxAcceptableLossDb": 8.0
        },
        "createdAt": datetime.utcnow()
    },
    {
        "routeId": "RTU_TN_05_R1",
        "routeName": "Route_1774203747539",
        "rtuId": "RTU_TN_05",
        "region": "Gafsa",
        "status": "ACTIVE",
        "priority": "MEDIUM",
        "fiberSpec": {
            "type": "Single Mode",
            "coreDiameterUm": 10.4,
            "lengthKm": 18.0,
            "expectedAttenuationDbPerKm": 0.2
        },
        "topology": {
            "startPoint": "RTU_TN_05",
            "endPoint": "Route_1774203747539",
            "intermediatePoints": []
        },
        "baseline": {
            "totalLossDb": 3.6,
            "eventCount": 3,
            "maxEventLossDb": 0.8
        },
        "currentCondition": {
            "totalLossDb": 3.6,
            "status": "NORMAL",
            "lastTestedAt": datetime.utcnow()
        },
        "maintenance": {
            "lastMaintenanceDate": datetime.utcnow(),
            "nextScheduledDate": datetime.utcnow()
        },
        "sla": {
            "targetAvailabilityPercent": 99.9,
            "maxAcceptableLossDb": 4.8
        },
        "createdAt": datetime.utcnow()
    },
    {
        "routeId": "RTU_TN_05_R2",
        "routeName": "Route_1774203810867",
        "rtuId": "RTU_TN_05",
        "region": "Gafsa",
        "status": "ACTIVE",
        "priority": "LOW",
        "fiberSpec": {
            "type": "Single Mode",
            "coreDiameterUm": 10.4,
            "lengthKm": 5.0,
            "expectedAttenuationDbPerKm": 0.2
        },
        "topology": {
            "startPoint": "RTU_TN_05",
            "endPoint": "Route_1774203810867",
            "intermediatePoints": []
        },
        "baseline": {
            "totalLossDb": 1.0,
            "eventCount": 1,
            "maxEventLossDb": 0.3
        },
        "currentCondition": {
            "totalLossDb": 1.0,
            "status": "NORMAL",
            "lastTestedAt": datetime.utcnow()
        },
        "maintenance": {
            "lastMaintenanceDate": datetime.utcnow(),
            "nextScheduledDate": datetime.utcnow()
        },
        "sla": {
            "targetAvailabilityPercent": 99.8,
            "maxAcceptableLossDb": 1.5
        },
        "createdAt": datetime.utcnow()
    },
    {
        "routeId": "RTU_TN_05_R3",
        "routeName": "Route_1774203864615",
        "rtuId": "RTU_TN_05",
        "region": "Gafsa",
        "status": "ACTIVE",
        "priority": "MEDIUM",
        "fiberSpec": {
            "type": "Single Mode",
            "coreDiameterUm": 10.4,
            "lengthKm": 13.0,
            "expectedAttenuationDbPerKm": 0.2
        },
        "topology": {
            "startPoint": "RTU_TN_05",
            "endPoint": "Route_1774203864615",
            "intermediatePoints": []
        },
        "baseline": {
            "totalLossDb": 2.6,
            "eventCount": 2,
            "maxEventLossDb": 0.7
        },
        "currentCondition": {
            "totalLossDb": 2.6,
            "status": "NORMAL",
            "lastTestedAt": datetime.utcnow()
        },
        "maintenance": {
            "lastMaintenanceDate": datetime.utcnow(),
            "nextScheduledDate": datetime.utcnow()
        },
        "sla": {
            "targetAvailabilityPercent": 99.9,
            "maxAcceptableLossDb": 3.5
        },
        "createdAt": datetime.utcnow()
    }
]


def seed_database():
    """Connect to MongoDB Atlas and seed RTUs and Routes with CORRECT schema matching Java models"""
    try:
        print(f"\n{'='*60}")
        print("MongoDB Atlas Database Seeding")
        print("Seeding with CORRECT schema matching Rtu.java and Route.java models")
        print(f"{'='*60}")
        
        # Connect to MongoDB
        print("\n[1/4] Connecting to MongoDB Atlas...")
        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        client.server_info()  # Test connection
        db = client[DB_NAME]
        print("✓ Connected successfully")
        
        # Get collections
        rtus_collection = db['rtus']
        routes_collection = db['routes']
        
        # Clear existing data
        print("\n[2/4] Clearing existing data...")
        rtus_collection.delete_many({})
        routes_collection.delete_many({})
        print("✓ Cleared collections")
        
        # Create indexes
        print("\n[2.5/4] Creating indexes (dropping old ones first)...")
        try:
            rtus_collection.drop_indexes()
        except:
            pass
        try:
            routes_collection.drop_indexes()
        except:
            pass
        
        rtus_collection.create_index('rtuId', unique=True)
        rtus_collection.create_index('status')
        
        routes_collection.create_index('routeId', unique=True)
        routes_collection.create_index('rtuId')
        routes_collection.create_index('region')
        routes_collection.create_index('status')
        print("✓ Indexes created")
        
        # Insert RTUs with CORRECT nested schema matching Rtu.java
        print("\n[3/4] Inserting RTUs with correct Rtu.java schema...")
        try:
            result = rtus_collection.insert_many(RTUS_DATA)
            print(f"✓ Inserted {len(result.inserted_ids)} RTUs:")
            for rtu in RTUS_DATA:
                print(f"  - {rtu['rtuId']}: {rtu['rtuName']} (Region: {rtu['location']['region']})")
        except DuplicateKeyError as e:
            print(f"⚠ Duplicate key error: {e}")
        
        # Insert Routes with CORRECT nested schema matching Route.java
        print("\n[4/4] Inserting Routes with correct Route.java schema...")
        try:
            result = routes_collection.insert_many(ROUTES_DATA)
            print(f"✓ Inserted {len(result.inserted_ids)} Routes:")
            for route in ROUTES_DATA:
                print(f"  - {route['routeId']}: {route['routeName']} (RTU: {route['rtuId']}, {route['fiberSpec']['lengthKm']}km)")
        except DuplicateKeyError as e:
            print(f"⚠ Duplicate key error: {e}")
        
        # Verify data and validate schema compliance
        print("\n" + "="*60)
        print("VERIFICATION: Schema Compliance Check")
        print("="*60)
        
        rtu_count = rtus_collection.count_documents({})
        route_count = routes_collection.count_documents({})
        
        print(f"\n✓ Total RTUs in database: {rtu_count}")
        print(f"✓ Total Routes in database: {route_count}")
        
        # Sample RTU schema validation
        print("\n--- Sample RTU (Schema Validation) ---")
        sample_rtu = rtus_collection.find_one()
        if sample_rtu:
            errors = []
            
            # Check Rtu.java required fields
            if not sample_rtu.get('rtuId'): errors.append("❌ Missing rtuId")
            if not sample_rtu.get('rtuName'): errors.append("❌ Missing rtuName")
            if not sample_rtu.get('status'): errors.append("❌ Missing status")
            if not sample_rtu.get('isMonitoring') is not None: errors.append("❌ Missing isMonitoring")
            
            if 'location' in sample_rtu:
                loc = sample_rtu['location']
                if 'coordinates' in loc:
                    coords = loc['coordinates']
                    if 'latitude' not in coords: errors.append("❌ Missing location.coordinates.latitude")
                    if 'longitude' not in coords: errors.append("❌ Missing location.coordinates.longitude")
                else:
                    errors.append("❌ Missing location.coordinates")
                if 'region' not in loc: errors.append("❌ Missing location.region")
            else:
                errors.append("❌ Missing location object")
            
            if 'capabilities' not in sample_rtu:
                errors.append("❌ Missing capabilities object")
            if 'health' not in sample_rtu:
                errors.append("❌ Missing health object")
            
            if errors:
                for error in errors:
                    print(error)
            else:
                print("✅ RTU schema is CORRECT and matches Rtu.java")
                print(f"   ✓ rtuId: {sample_rtu['rtuId']}")
                print(f"   ✓ rtuName: {sample_rtu['rtuName']}")
                print(f"   ✓ location.name: {sample_rtu['location']['name']}")
                print(f"   ✓ location.region: {sample_rtu['location']['region']}")
                print(f"   ✓ location.coordinates.latitude: {sample_rtu['location']['coordinates']['latitude']}")
                print(f"   ✓ location.coordinates.longitude: {sample_rtu['location']['coordinates']['longitude']}")
                print(f"   ✓ status: {sample_rtu['status']}")
                print(f"   ✓ isMonitoring: {sample_rtu['isMonitoring']}")
                print(f"   ✓ capabilities.maxFiberLengthKm: {sample_rtu['capabilities']['maxFiberLengthKm']}")
        
        # Sample Route schema validation
        print("\n--- Sample Route (Schema Validation) ---")
        sample_route = routes_collection.find_one()
        if sample_route:
            errors = []
            
            # Check Route.java required fields
            if not sample_route.get('routeId'): errors.append("❌ Missing routeId")
            if not sample_route.get('routeName'): errors.append("❌ Missing routeName")
            if not sample_route.get('rtuId'): errors.append("❌ Missing rtuId")
            if not sample_route.get('region'): errors.append("❌ Missing region")
            if not sample_route.get('status'): errors.append("❌ Missing status")
            if 'fiberSpec' not in sample_route: errors.append("❌ Missing fiberSpec object")
            if 'topology' not in sample_route: errors.append("❌ Missing topology object")
            if 'priority' not in sample_route: errors.append("❌ Missing priority")
            if 'sla' not in sample_route: errors.append("❌ Missing sla object")
            
            if errors:
                for error in errors:
                    print(error)
            else:
                print("✅ Route schema is CORRECT and matches Route.java")
                print(f"   ✓ routeId: {sample_route['routeId']}")
                print(f"   ✓ routeName: {sample_route['routeName']}")
                print(f"   ✓ rtuId: {sample_route['rtuId']}")
                print(f"   ✓ region: {sample_route['region']}")
                print(f"   ✓ status: {sample_route['status']}")
                print(f"   ✓ priority: {sample_route['priority']}")
                print(f"   ✓ fiberSpec.lengthKm: {sample_route['fiberSpec']['lengthKm']}")
                print(f"   ✓ topology.startPoint: {sample_route['topology']['startPoint']}")
                print(f"   ✓ topology.endPoint: {sample_route['topology']['endPoint']}")
                print(f"   ✓ sla.targetAvailabilityPercent: {sample_route['sla']['targetAvailabilityPercent']}")
        
        # Show distribution by RTU
        print("\n✓ Routes per RTU:")
        for rtu_id in ["RTU_TN_01", "RTU_TN_02", "RTU_TN_03", "RTU_TN_04", "RTU_TN_05"]:
            count = routes_collection.count_documents({"rtuId": rtu_id})
            print(f"  - {rtu_id}: {count} routes")
        
        print(f"\n{'='*60}")
        print("✅ Database seeding completed successfully!")
        print("✅ All data matches Rtu.java and Route.java model schemas exactly!")
        print(f"{'='*60}\n")
        
        client.close()
        
    except Exception as e:
        print(f"\n❌ Error during seeding: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    seed_database()
