"""JSON persistence for the single-user profile."""

from __future__ import annotations

import json
from pathlib import Path

from app.core.config import get_settings
from app.models.schemas import UserProfile

PROFILE_FILENAME = "profile.json"


def _data_dir() -> Path:
    settings = get_settings()
    path = settings.resolved_data_dir
    path.mkdir(parents=True, exist_ok=True)
    return path


def profile_path() -> Path:
    return _data_dir() / PROFILE_FILENAME


def load_profile() -> UserProfile:
    path = profile_path()
    if not path.exists():
        return UserProfile()
    raw = path.read_text(encoding="utf-8")
    if not raw.strip():
        return UserProfile()
    return UserProfile.model_validate_json(raw)


def save_profile(profile: UserProfile) -> UserProfile:
    path = profile_path()
    payload = profile.model_dump(mode="json")
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return profile
