#!/usr/bin/env python3
"""Drop all problematic indexes from all collections."""

import pymongo

try:
    client = pymongo.MongoClient(
        "mongodb+srv://Mouhaned_P2M:P2M2026@cluster1.dhwsaii.mongodb.net/nqms?retryWrites=true&w=majority",
        serverSelectionTimeoutMS=5000
    )
    
    db = client['nqms']
    
    # List all collections
    collections = db.list_collection_names()
    print(f"Found {len(collections)} collections: {collections}\n")
    
    # For each collection, drop all indexes except _id_
    for coll_name in collections:
        if coll_name.startswith('system.'):
            continue
            
        coll = db[coll_name]
        indexes = list(coll.list_indexes())
        
        print(f"  {coll_name}:")
        for idx in indexes:
            idx_name = idx['name']
            if idx_name != '_id_':
                try:
                    coll.drop_index(idx_name)
                    print(f"    ✓ Dropped {idx_name}")
                except pymongo.errors.OperationFailure as e:
                    print(f"    - Skipped {idx_name}: {str(e)[:50]}")
        
        remaining = [idx['name'] for idx in coll.list_indexes()]
        print(f"    Remaining: {remaining}\n")
    
    client.close()
    print('✓ Done')

except Exception as e:
    print(f'✗ Error: {e}')
    import traceback
    traceback.print_exc()
