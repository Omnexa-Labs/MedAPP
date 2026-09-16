"""Isolated Alembic runner; connection credentials never appear in argv."""

import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url


def main() -> None:
    url = make_url(os.environ["HMS_MIGRATION_DATABASE_URL"])
    if url.get_backend_name() == "postgresql":
        url = url.set(drivername="postgresql+psycopg")
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "alembic"))
    # ConfigParser interprets percent escapes in URL-encoded credentials.
    config.set_main_option(
        "sqlalchemy.url", url.render_as_string(hide_password=False).replace("%", "%%")
    )
    command.upgrade(config, "head")


if __name__ == "__main__":
    main()
