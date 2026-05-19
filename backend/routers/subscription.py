from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from database import get_db
from models.db_models import SubscriptionPlan, UserSubscription, UsageRecord
from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/subscription", tags=["subscription"])


# ── Pydantic schemas ──

class PlanResponse(BaseModel):
    id: str
    name: str
    max_videos_per_month: int
    max_exports_per_month: int
    max_video_duration_seconds: int
    max_storage_mb: int
    price_monthly: float
    is_active: bool


class SubscriptionResponse(BaseModel):
    id: str
    user_id: str
    plan: PlanResponse
    status: str
    current_period_start: str | None = None
    current_period_end: str | None = None


class UsageResponse(BaseModel):
    videos_used: int
    videos_limit: int
    exports_used: int
    exports_limit: int
    max_video_duration_seconds: int
    plan_name: str
    is_admin: bool = False


# ── Seed default plans on import ──

def seed_default_plans(db: Session):
    """Create default subscription plans if they don't exist."""
    defaults = [
        {"name": "free", "max_videos_per_month": 3, "max_exports_per_month": 5,
         "max_video_duration_seconds": 600, "max_storage_mb": 500, "price_monthly": 0.0},
        {"name": "pro", "max_videos_per_month": 30, "max_exports_per_month": 100,
         "max_video_duration_seconds": 3600, "max_storage_mb": 5000, "price_monthly": 19.0},
        {"name": "enterprise", "max_videos_per_month": 999, "max_exports_per_month": 999,
         "max_video_duration_seconds": 7200, "max_storage_mb": 50000, "price_monthly": 49.0},
    ]
    for plan_data in defaults:
        existing = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == plan_data["name"]).first()
        if not existing:
            db.add(SubscriptionPlan(**plan_data))
    db.commit()


def _get_or_create_subscription(user_id: str, db: Session) -> UserSubscription:
    """Get the user's active subscription, or assign them the free plan."""
    sub = db.query(UserSubscription).filter(
        UserSubscription.user_id == user_id,
        UserSubscription.status == "active",
    ).first()
    if sub:
        return sub

    # Auto-assign free plan
    free_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == "free").first()
    if not free_plan:
        seed_default_plans(db)
        free_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == "free").first()

    sub = UserSubscription(
        user_id=user_id,
        plan_id=free_plan.id,
        status="active",
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def _count_usage_this_month(user_id: str, action: str, db: Session) -> int:
    """Count how many times the user performed an action this month."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return db.query(func.count(UsageRecord.id)).filter(
        UsageRecord.user_id == user_id,
        UsageRecord.action == action,
        UsageRecord.created_at >= month_start,
    ).scalar() or 0


def check_usage_limit(user_id: str, action: str, db: Session, user: CurrentUser | None = None):
    """Check if the user has exceeded their plan's limit for an action. Raises 403 if exceeded.
    Admin users bypass all limits."""
    if user and user.is_admin:
        return

    sub = _get_or_create_subscription(user_id, db)
    plan = sub.plan
    used = _count_usage_this_month(user_id, action, db)

    limit_map = {
        "ingest": plan.max_videos_per_month,
        "export": plan.max_exports_per_month,
    }
    limit = limit_map.get(action)
    if limit is not None and used >= limit:
        raise HTTPException(
            status_code=403,
            detail=f"Monthly {action} limit reached ({used}/{limit}). Upgrade your plan.",
        )


def record_usage(user_id: str, action: str, video_id: str | None, db: Session):
    """Record a usage event."""
    db.add(UsageRecord(user_id=user_id, action=action, video_id=video_id))
    db.commit()


# ── Endpoints ──

@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(db: Session = Depends(get_db)):
    """List all active subscription plans."""
    plans = db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active == True).all()
    if not plans:
        seed_default_plans(db)
        plans = db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active == True).all()
    return [PlanResponse(
        id=p.id, name=p.name,
        max_videos_per_month=p.max_videos_per_month,
        max_exports_per_month=p.max_exports_per_month,
        max_video_duration_seconds=p.max_video_duration_seconds,
        max_storage_mb=p.max_storage_mb,
        price_monthly=p.price_monthly,
        is_active=p.is_active,
    ) for p in plans]


@router.get("/me", response_model=SubscriptionResponse)
async def get_my_subscription(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user's active subscription."""
    sub = _get_or_create_subscription(current_user.id, db)
    plan = sub.plan
    return SubscriptionResponse(
        id=sub.id, user_id=sub.user_id,
        plan=PlanResponse(
            id=plan.id, name=plan.name,
            max_videos_per_month=plan.max_videos_per_month,
            max_exports_per_month=plan.max_exports_per_month,
            max_video_duration_seconds=plan.max_video_duration_seconds,
            max_storage_mb=plan.max_storage_mb,
            price_monthly=plan.price_monthly,
            is_active=plan.is_active,
        ),
        status=sub.status,
        current_period_start=sub.current_period_start.isoformat() if sub.current_period_start else None,
        current_period_end=sub.current_period_end.isoformat() if sub.current_period_end else None,
    )


@router.get("/usage", response_model=UsageResponse)
async def get_my_usage(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user's usage for this billing period."""
    videos_used = _count_usage_this_month(current_user.id, "ingest", db)
    exports_used = _count_usage_this_month(current_user.id, "export", db)

    if current_user.is_admin:
        return UsageResponse(
            videos_used=videos_used,
            videos_limit=999999,
            exports_used=exports_used,
            exports_limit=999999,
            max_video_duration_seconds=999999,
            plan_name="Admin (Unlimited)",
            is_admin=True,
        )

    sub = _get_or_create_subscription(current_user.id, db)
    plan = sub.plan
    return UsageResponse(
        videos_used=videos_used,
        videos_limit=plan.max_videos_per_month,
        exports_used=exports_used,
        exports_limit=plan.max_exports_per_month,
        max_video_duration_seconds=plan.max_video_duration_seconds,
        plan_name=plan.name,
    )
