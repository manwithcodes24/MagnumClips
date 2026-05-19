from fastapi import APIRouter, Depends
from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me")
async def get_me(current_user: CurrentUser = Depends(get_current_user)):
    """Return the current authenticated user's info from the Supabase JWT."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
    }
