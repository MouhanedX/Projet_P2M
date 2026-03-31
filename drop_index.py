#!/usr/bin/env python3
"""Drop problematic indexes from MongoDB collections."""

import pymongo
import sys

try:
    client = pymongo.MongoClient(
        "mongodb+srv://Mouhaned_P2M:P2M2026@cluster1.dhwsaii.mongodb.net/nqms?retryWrites=true&w=majority",
        serverSelectionTimeoutMS=5000
    )
    
    # Test connection
    client.admin.command('ping')
    print("✓ Connected to MongoDB")
    
    db = client['nqms']
    
    # Collections to fix
    collections_to_fix = {
        'routes': ['routeId_1', 'rtuId_1', 'region_1', 'status_1', 'rtu_status_idx', 'region_priority_idx'],
        'alarms': ['alarmId', 'alarmId_1', 'rtuId_1', 'rtuId', 'routeId_1', 'routeId', 'severity_1', 'status_1', 'rtu_created_idx', 'route_status_idx', 'severity_status_created_idx']
    }
    
    for collection_name, index_names in collections_to_fix.items():
        collection = db[collection_name]
        print(f"\n--- Processing '{collection_name}' collection ---")
        
        # List current indexes
        current_indexes = {idx['name'] for idx in collection.list_indexes()}
        print(f"Current indexes: {sorted(current_indexes)}")
        
        # Drop specified indexes
        for index_name in index_names:
            if index_name in current_indexes:
                try:
                    collection.drop_index(index_name)
                    print(f"  ✓ Dropped '{index_name}'")
                except pymongo.errors.OperationFailure as e:
                    print(f"  ✗ Error dropping '{index_name}': {e}")
            else:
                print(f"  - Skipped '{index_name}' (not found)")
        
        # List indexes after cleanup
        remaining = {idx['name'] for idx in collection.list_indexes()}
        print(f"Remaining indexes: {sorted(remaining)}")
    
    client.close()
    print("\n✓ Done")
    sys.exit(0)

except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
