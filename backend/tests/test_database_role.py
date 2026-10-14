"""Production must reject connections that bypass tenant policies."""
from unittest.mock import Mock
import pytest
from fastapi import HTTPException
from app.config import get_settings
from app.db import get_db


@pytest.mark.parametrize("unsafe", [True, False])
def test_production_checks_database_role(monkeypatch, unsafe):
    import app.db as module
    db = Mock()
    db.get_bind.return_value.dialect.name = "postgresql"
    db.execute.return_value.scalar.return_value = unsafe
    monkeypatch.setattr(module, "SessionLocal", lambda: db)
    monkeypatch.setenv("SIOONA_ENV", "production")
    get_settings.cache_clear()
    generator = get_db()
    try:
        if unsafe:
            with pytest.raises(HTTPException) as error:
                next(generator)
            assert error.value.status_code == 503
            assert error.value.detail == "unsafe_database_role"
        else:
            assert next(generator) is db
            db.execute.assert_called_once()
    finally:
        generator.close()
        get_settings.cache_clear()
