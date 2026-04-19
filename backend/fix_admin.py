#!/usr/bin/env python
"""Fix admin user role"""
from app.storage import Storage
from app.config import settings

# Connect and fix admin role
storage = Storage(settings.database_url)
storage.init()

# Get current admin user to retain password hash
user = storage.get_user('admin')
if user:
    password_hash = user.get('password_hash')
    # Upsert with admin role
    storage.upsert_user(
        username='admin',
        password_hash=password_hash,
        role='admin',
        display_name='Administrator',
        email=user.get('email')
    )
    print("✓ Admin role restored successfully")
    # Verify
    updated = storage.get_user('admin')
    print(f"  Username: {updated['username']}")
    print(f"  Role: {updated['role']}")
else:
    print("✗ Admin user not found")
