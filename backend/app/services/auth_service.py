from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request

from ..config import settings
from ..storage import Storage


_storage = Storage(settings.database_url)
_storage.init()

ROLE_USER = "user"
ROLE_ADMIN = "admin"
ROLE_CO_ADMIN = "co_admin"
ALLOWED_ROLES = {ROLE_USER, ROLE_ADMIN, ROLE_CO_ADMIN}
STAFF_ROLES = {ROLE_ADMIN, ROLE_CO_ADMIN}
MANAGEABLE_ROLES = {ROLE_USER, ROLE_CO_ADMIN}


def normalize_role(role: Any) -> str:
    value = str(role or ROLE_USER).strip().lower()
    aliases = {
        "owner": ROLE_ADMIN,
        "coadmin": ROLE_CO_ADMIN,
        "co-admin": ROLE_CO_ADMIN,
        "super_admin": ROLE_ADMIN,
        "super-admin": ROLE_ADMIN,
    }
    value = aliases.get(value, value)
    if value not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    return value


def is_staff_role(role: Any) -> bool:
    return normalize_role(role) in STAFF_ROLES


def can_manage_roles(role: Any) -> bool:
    return normalize_role(role) == ROLE_ADMIN


def is_primary_admin_username(username: Any) -> bool:
    return str(username or '').strip().lower() == settings.bootstrap_admin_username.strip().lower()


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
    for user in _storage.list_users():
        uname = str(user.get('username') or '').strip().lower()
        role = normalize_role(user.get('role'))
        if uname == username:
            if role != ROLE_ADMIN:
                _storage.set_user_role(uname, ROLE_ADMIN)
        elif role == ROLE_ADMIN:
            _storage.set_user_role(uname, ROLE_CO_ADMIN)
    existing = _storage.get_user(username)
    if existing:
        if normalize_role(existing.get('role')) != ROLE_ADMIN:
            _storage.set_user_role(username, ROLE_ADMIN)
        if not verify_password(password, str(existing.get('password_hash') or '')):
            _storage.set_user_password_hash(username, hash_password(password))
        return
    _storage.upsert_user(username=username, password_hash=hash_password(password), role=ROLE_ADMIN, display_name='Administrator', email=None)


SESSION_COOKIE = settings.session_cookie_name


def create_user(username: str, password: str, *, role: str = ROLE_USER, display_name: Optional[str] = None, email: Optional[str] = None) -> Dict[str, Any]:
    uname = username.strip().lower()
    role = normalize_role(role)
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
    safe['role'] = normalize_role(safe.get('role'))
    safe.pop('password_hash', None)
    return {'session_id': sid, 'user': safe, 'expires_at': expires}


def logout(session_id: Optional[str]) -> None:
    if session_id:
        _storage.delete_session(session_id)


def _coerce_utc_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    try:
        if isinstance(value, datetime):
            dt = value
        else:
            raw = str(value).strip()
            if not raw:
                return None
            if raw.endswith('Z'):
                raw = raw[:-1] + '+00:00'
            dt = datetime.fromisoformat(raw)

        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def current_user_from_request(request: Request) -> Optional[Dict[str, Any]]:
    ensure_bootstrap_admin()
    sid = request.cookies.get(SESSION_COOKIE)
    if not sid:
        return None
    sess = _storage.get_session(sid)
    if not sess:
        return None

    exp = _coerce_utc_datetime(sess.get('expires_at'))
    if exp is None:
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
    user['role'] = normalize_role(user.get('role'))
    user.pop('password_hash', None)
    return user


def require_user(request: Request) -> Dict[str, Any]:
    user = current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail='Login required')
    return user


def require_admin(request: Request) -> Dict[str, Any]:
    user = require_user(request)
    if not is_staff_role(user.get('role')):
        raise HTTPException(status_code=403, detail='Admin access required')
    return user


def list_users() -> list[Dict[str, Any]]:
    users = _storage.list_users()
    for user in users:
        user['role'] = normalize_role(user.get('role'))
    return users


def set_role(actor_username: str, username: str, role: str) -> None:
    actor = _storage.get_user(actor_username)
    if not actor or not can_manage_roles(actor.get('role')) or not is_primary_admin_username(actor_username):
        raise HTTPException(status_code=403, detail='Only the main Admin account can change user roles')
    target_username = str(username or '').strip().lower()
    target = _storage.get_user(target_username)
    if not target:
        raise HTTPException(status_code=404, detail='User not found')
    if is_primary_admin_username(target_username):
        raise HTTPException(status_code=400, detail='The main Admin account cannot be changed from user management')
    desired_role = normalize_role(role)
    if desired_role not in MANAGEABLE_ROLES:
        raise HTTPException(status_code=400, detail='Only User or Co-Admin roles can be assigned here')
    _storage.set_user_role(target_username, desired_role)



def update_profile(username: str, *, display_name: Optional[str] = None, email: Optional[str] = None) -> Dict[str, Any]:
    _storage.update_user_profile(username, display_name=display_name, email=email)
    user = _storage.get_user(username) or {}
    user['role'] = normalize_role(user.get('role'))
    user.pop('password_hash', None)
    return user


def change_password(username: str, current_password: str, new_password: str) -> None:
    user = _storage.get_user(username)
    if not user or not verify_password(current_password, str(user.get('password_hash') or '')):
        raise HTTPException(status_code=401, detail='Current password is incorrect')
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail='New password must be at least 6 characters')
    _storage.set_user_password_hash(username, hash_password(new_password))


def _send_reset_email(email: str, reset_link: str) -> bool:
    if not settings.smtp_host:
        return False
    msg = EmailMessage()
    msg['Subject'] = 'TradexaLK password reset'
    msg['From'] = settings.smtp_from_email
    msg['To'] = email
    msg.set_content(
        'Use the link below to reset your password. This link will expire soon.\n\n'
        f'{reset_link}\n\n'
        'If you did not request this, you can ignore this email.'
    )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
        if settings.smtp_use_tls:
            server.starttls()
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(msg)
    return True

def send_welcome_email(email: str, display_name: str) -> bool:
    if not settings.smtp_host or not email:
        return False
    msg = EmailMessage()
    msg['Subject'] = 'Welcome to TradexaLK'
    msg['From'] = settings.smtp_from_email
    msg['To'] = email
    msg.set_content(
        f"Hello {display_name},\n\n"
        "Welcome to TradexaLK! Your account has been successfully created.\n\n"
        "You can now log in and start using our professional AI analytics platform.\n\n"
        "Best regards,\n"
        "The TradexaLK Team"
    )
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(msg)
        return True
    except Exception:
        return False


def send_contact_email(name: str, email: str, subject: str, message: str) -> bool:
    if not settings.smtp_host:
        return False
    msg = EmailMessage()
    msg['Subject'] = f'Contact Form: {subject}'
    msg['From'] = settings.smtp_from_email
    msg['To'] = settings.smtp_from_email  # Send to the admin/support email
    msg['Reply-To'] = email
    msg.set_content(
        f"You have received a new message from the contact form:\n\n"
        f"Name: {name}\n"
        f"Email: {email}\n"
        f"Subject: {subject}\n\n"
        f"Message:\n{message}"
    )
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(msg)
        return True
    except Exception:
        return False


def start_password_reset(user: Dict[str, Any]) -> Dict[str, Any]:
    username = str(user.get('username') or '').lower()
    email = str(user.get('email') or '').strip()
    if not username or not email:
        return {'sent': False, 'reason': 'Account does not have an email address'}
    token = secrets.token_urlsafe(32)
    expires_at = (_utc_now() + timedelta(minutes=settings.password_reset_ttl_minutes)).isoformat(timespec='seconds')
    _storage.create_password_reset_token(username, token, expires_at)
    reset_link = f"{settings.frontend_public_url.rstrip('/')}/reset-password?token={token}"
    sent = False
    try:
        sent = _send_reset_email(email, reset_link)
    except Exception:
        sent = False
    result = {'sent': sent, 'expires_at': expires_at}
    if not sent:
        result['preview_reset_link'] = reset_link
    return result


def complete_password_reset(token: str, new_password: str) -> Dict[str, Any]:
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail='New password must be at least 6 characters')
    row = _storage.consume_password_reset_token(token)
    if not row:
        raise HTTPException(status_code=400, detail='Password reset link is invalid or expired')
    username = str(row.get('username') or '').lower()
    if not username:
        raise HTTPException(status_code=400, detail='Password reset link is invalid')
    _storage.set_user_password_hash(username, hash_password(new_password))
    user = _storage.get_user(username) or {}
    user.pop('password_hash', None)
    user['role'] = normalize_role(user.get('role'))
    return user
