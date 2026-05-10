import time
from collections import defaultdict
from fastapi import Request, HTTPException, status
import requests
import os

# --- Rate Limiter ---
RATE_LIMIT_WINDOW = 60  # seconds
MAX_REQUESTS = 5
_rate_limits = defaultdict(list)

def rate_limit_auth(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    
    # Clean old requests
    _rate_limits[client_ip] = [t for t in _rate_limits[client_ip] if now - t < RATE_LIMIT_WINDOW]
    
    if len(_rate_limits[client_ip]) >= MAX_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later."
        )
    
    _rate_limits[client_ip].append(now)

# --- CAPTCHA ---

# Google provides these test keys that always pass verification
RECAPTCHA_SECRET_KEY = os.environ.get("RECAPTCHA_SECRET_KEY", "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe")

def generate_captcha():
    # Deprecated: math captcha. Just returning dummy data now since frontend uses Google reCAPTCHA
    return {"captcha_id": "recaptcha", "question": "Please solve the reCAPTCHA widget"}

def verify_captcha(c_id: str, answer: str) -> bool:
    if not answer:
        return False
        
    try:
        resp = requests.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data={
                "secret": RECAPTCHA_SECRET_KEY,
                "response": answer
            },
            timeout=10
        )
        result = resp.json()
        return result.get("success", False)
    except Exception:
        return False

