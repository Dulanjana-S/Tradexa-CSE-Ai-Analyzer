from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request

from ..config import settings
from ..storage import Storage


_storage = Storage(settings.database_url)
_storage.init()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _b64(x: bytes) -> str:
    return base64.b64encode(x).decode('ascii')


def hash_password(password: str, *, salt: Optional[bytes] = None) -> str:
    salt = salt or os.urandom(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 120_000)
    return f"pbkdf2_sha256$120000${_b64(salt)}${_b64(dk)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algo, iterations, salt_b64, hash_b64 = encoded.split('$', 3)
        if algo != 'pbkdf2_sha256':
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        actual = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def ensure_bootstrap_admin() -> None:
    username = settings.bootstrap_admin_username.strip().lower()
    password = settings.bootstrap_admin_password
    if not username or not password:
        return
    if _storage.get_user(username):
        return
    _storage.upsert_user(username=username, password_hash=hash_password(password), role='admin', display_name='Administrator', email=None)


SESSION_COOKIE = settings.session_cookie_name


def create_user(username: str, password: str, *, role: str = 'user', display_name: Optional[str] = None, email: Optional[str] = None) -> Dict[str, Any]:
    uname = username.strip().lower()
    if not uname or len(uname) < 3:
        raise HTTPException(status_code=400, detail='Username must be at least 3 characters')
    if len(password) < 6:
        raise HTTPException(status_code=400, detail='Password must be at least 6 characters')
    if _storage.get_user(uname):
        raise HTTPException(status_code=409, detail='User already exists')
    _storage.upsert_user(username=uname, password_hash=hash_password(password), role=role, display_name=display_name or uname, email=email)
    user = _storage.get_user(uname) or {}
    user.pop('password_hash', None)
    return user


def login(username: str, password: str) -> Dict[str, Any]:
    ensure_bootstrap_admin()
    uname = username.strip().lower()
    user = _storage.get_user(uname)
    if not user or not verify_password(password, str(user.get('password_hash') or '')):
        raise HTTPException(status_code=401, detail='Invalid username or password')
    expires = (_utc_now() + timedelta(days=settings.session_ttl_days)).isoformat(timespec='seconds')
    sid = _storage.create_session(uname, expires)
    _storage.touch_last_login(uname)
    safe = dict(user)
    safe.pop('password_hash', None)
    return {'session_id': sid, 'user': safe, 'expires_at': expires}


def logout(session_id: Optional[str]) -> None:
    if session_id:
        _storage.delete_session(session_id)


def current_user_from_request(request: Request) -> Optional[Dict[str, Any]]:
    ensure_bootstrap_admin()
    sid = request.cookies.get(SESSION_COOKIE)
    if not sid:
        return None
    sess = _storage.get_session(sid)
    if not sess:
        return None
    try:
        exp = datetime.fromisoformat(str(sess.get('expires_at')))
    except Exception:
        _storage.delete_session(sid)
        return None
    if exp < _utc_now():
        _storage.delete_session(sid)
        return None
    user = _storage.get_user(str(sess.get('username') or ''))
    if not user:
        _storage.delete_session(sid)
        return None
    user = dict(user)
    user.pop('password_hash', None)
    return user


def require_user(request: Request) -> Dict[str, Any]:
    user = current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail='Login required')
    return user


def require_admin(request: Request) -> Dict[str, Any]:
    user = require_user(request)
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin access required')
    return user


def list_users() -> list[Dict[str, Any]]:
    return _storage.list_users()


def set_role(username: str, role: str) -> None:
    if role not in {'user', 'admin'}:
        raise HTTPException(status_code=400, detail='Invalid role')
    _storage.set_user_role(username, role)



def update_profile(username: str, *, display_name: Optional[str] = None, email: Optional[str] = None) -> Dict[str, Any]:
    _storage.update_user_profile(username, display_name=display_name, email=email)
    user = _storage.get_user(username) or {}
    user.pop('password_hash', None)
    return user


def change_password(username: str, current_password: str, new_password: str) -> None:
    user = _storage.get_user(username)
    if not user or not verify_password(current_password, str(user.get('password_hash') or '')):
        raise HTTPException(status_code=401, detail='Current password is incorrect')
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail='New password must be at least 6 characters')
    _storage.set_user_password_hash(username, hash_password(new_password))
