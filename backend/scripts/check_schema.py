"""Read-only startup gate. Schema changes are a separate approved operator step."""
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from app.config import get_settings


def main():
    expected = set(ScriptDirectory.from_config(Config('alembic.ini')).get_heads())
    engine = create_engine(get_settings().database_url)
    try:
        with engine.connect() as connection:
            actual = set(connection.scalars(text('SELECT version_num FROM alembic_version')))
        if actual != expected:
            raise SystemExit('schema_not_ready: apply reviewed migrations before deploying consumers')
    finally:
        engine.dispose()


if __name__ == '__main__':
    main()
