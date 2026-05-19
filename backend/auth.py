import os
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Supabase JWT secret — found in Supabase Dashboard > Settings > API > JWT Secret
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
ALGORITHM = "HS256"

# Comma-separated list of admin emails (bypass all subscription limits)
ADMIN_EMAILS: set[str] = {
    e.strip().lower()
    for e in os.getenv("ADMIN_EMAILS", "").split(",")
    if e.strip()
}

security = HTTPBearer()


class CurrentUser:
    """Lightweight user object extracted from Supabase JWT claims."""
    def __init__(self, id: str, email: str | None = None, role: str | None = None):
        self.id = id
        self.email = email
        self.role = role

    @property
    def is_admin(self) -> bool:
        return bool(self.email and self.email.lower() in ADMIN_EMAILS)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> CurrentUser:
    """FastAPI dependency — validates Supabase JWT and returns the current user."""
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_JWT_SECRET not configured",
        )

    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=[ALGORITHM],
            options={"verify_aud": False},
        )
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        email = payload.get("email")
        role = payload.get("role")
        return CurrentUser(id=user_id, email=email, role=role)
    except JWTError:
        raise credentials_exception
