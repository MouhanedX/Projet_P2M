#!/usr/bin/env python3
"""Clean up documents with null IDs from MongoDB."""

import pymongo

try:
    client = pymongo.MongoClient(
        "mongodb+srv://Mouhaned_P2M:P2M2026@cluster1.dhwsaii.mongodb.net/nqms?retryWrites=true&w=majority",
        serverSelectionTimeoutMS=5000
    )
    
    db = client['nqms']
    
    # Clean alarms collection
    alarms = db['alarms']
    result = alarms.delete_many({
        '$or': [
            {'alarmId': None},
            {'alarmId': {'$exists': False}},
            {'alarm_id': None},
            {'alarm_id': {'$exists': False}}
        ]
    })
    print(f'✓ Deleted {result.deleted_count} documents with null/missing alarmId from alarms collection')
    
    # Clean kpis collection
    kpis = db['kpis']
    result2 = kpis.delete_many({
        '$or': [
            {'kpi_id': None},
            {'kpi_id': {'$exists': False}}
        ]
    })
    print(f'✓ Deleted {result2.deleted_count} documents with null/missing kpi_id from kpis collection')
    
    client.close()
    print('✓ Done')

except Exception as e:
    print(f'✗ Error: {e}')
    import traceback
    traceback.print_exc()
