"""Safely copy the existing chat memory SQLite database to PostgreSQL.

Required environment variables:
- SOURCE_SQLITE_PATH: path to the existing SQLite file
- DATABASE_URL: destination PostgreSQL connection string

The source is copied to a timestamped backup before any destination write.
The script never deletes or modifies the source SQLite file.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import sqlite3
import time
from pathlib import Path

import psycopg


TABLES = {
    "chat_turns": (
        "id",
        "session_id",
        "question",
        "answer",
        "source",
        "created_at",
    ),
    "top_search_events": (
        "id",
        "session_id",
        "keyword",
        "keyword_norm",
        "question",
        "created_at",
    ),
}


def row_digest(rows: list[tuple[object, ...]]) -> str:
    digest = hashlib.sha256()
    for row in rows:
        digest.update(repr(row).encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


def main() -> None:
    source = Path(os.environ.get("SOURCE_SQLITE_PATH", "backend/db/chat_memory.sqlite3")).expanduser().resolve()
    destination_url = os.environ.get("DATABASE_URL", "").strip()
    if not destination_url:
        raise SystemExit("DATABASE_URL is required")
    if not source.is_file():
        raise SystemExit(f"SQLite source does not exist: {source}")

    backup = source.with_name(f"{source.name}.backup-{time.strftime('%Y%m%d-%H%M%S')}")
    shutil.copy2(source, backup)
    print(f"Backup created: {backup}")

    with sqlite3.connect(source) as sqlite_conn:
        integrity = sqlite_conn.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise SystemExit(f"SQLite integrity check failed: {integrity}")

        source_rows = {}
        for table, columns in TABLES.items():
            quoted_columns = ", ".join(columns)
            source_rows[table] = sqlite_conn.execute(
                f"SELECT {quoted_columns} FROM {table} ORDER BY id"
            ).fetchall()
            print(f"Source {table}: {len(source_rows[table])} rows")

    with psycopg.connect(destination_url) as pg_conn:
        with pg_conn.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_turns (
                    id BIGINT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    question TEXT NOT NULL,
                    answer TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'cloud-llm',
                    created_at BIGINT NOT NULL
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS top_search_events (
                    id BIGINT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    keyword TEXT NOT NULL,
                    keyword_norm TEXT NOT NULL,
                    question TEXT NOT NULL,
                    created_at BIGINT NOT NULL
                )
                """
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_chat_session_time ON chat_turns(session_id, created_at DESC)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_chat_question ON chat_turns(question)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_top_search_keyword_time ON top_search_events(keyword_norm, created_at DESC)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_top_search_session_time ON top_search_events(session_id, created_at DESC)"
            )

            for table, columns in TABLES.items():
                placeholders = ", ".join(["%s"] * len(columns))
                quoted_columns = ", ".join(columns)
                cursor.executemany(
                    f"INSERT INTO {table} ({quoted_columns}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING",
                    source_rows[table],
                )

            for table, columns in TABLES.items():
                quoted_columns = ", ".join(columns)
                destination_rows = cursor.execute(
                    f"SELECT {quoted_columns} FROM {table} ORDER BY id"
                ).fetchall()
                if len(destination_rows) != len(source_rows[table]):
                    raise RuntimeError(
                        f"Row count mismatch for {table}: "
                        f"source={len(source_rows[table])}, destination={len(destination_rows)}"
                    )
                if row_digest(source_rows[table]) != row_digest(destination_rows):
                    raise RuntimeError(f"Content checksum mismatch for {table}")
                print(f"Verified {table}: {len(destination_rows)} rows")

        pg_conn.commit()

    print("Migration completed. The original SQLite file and backup were preserved.")


if __name__ == "__main__":
    main()
