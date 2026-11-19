"""Database connection and session management for Homelab Telemetry Hub."""

import os
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


def resolve_database_url(raw_url: str | None = None) -> str:
    """Normalize DATABASE_URL, defaulting to local SQLite when not set."""
    url = (raw_url if raw_url is not None else os.getenv("DATABASE_URL", "")).strip()
    if not url:
        return "sqlite:///./telemetry.db"
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if url.startswith("postgresql://"):
        try:
            import psycopg2  # noqa: F401
            url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
        except ImportError:
            pass
    return url


DATABASE_URL = resolve_database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
    pool_pre_ping=not IS_SQLITE,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for SQLAlchemy ORM models."""


def init_db() -> None:
    """Create telemetry tables if they do not exist."""
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Yield a transactional database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
