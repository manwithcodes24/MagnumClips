import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:magnumclips@localhost:54322/postgres")

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

# Supabase pooler uses port 6543 and requires different pool settings
is_supabase = "supabase" in DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    pool_size=5 if is_supabase else 10,
    max_overflow=10 if is_supabase else 20,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency for database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Called on app startup."""
    from models.db_models import (  # noqa: F401
        SubscriptionPlan, UserSubscription, UsageRecord,
        Video, Job, Clip, Transcript,
        ExplainerProject, ExplainerClip, ExplainerScene,
        ExplainerEdit, ExplainerJob,
    )
    Base.metadata.create_all(bind=engine)
