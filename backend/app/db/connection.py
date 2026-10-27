import os
import sqlite3
import re
from contextlib import contextmanager
from pathlib import Path
from backend.app.config import Config

_IS_POSTGRES = False
_PG_DRIVER = None

db_url = Config.DATABASE_URL

if db_url.startswith("postgres://") or db_url.startswith("postgresql://"):
    _IS_POSTGRES = True
    try:
        import psycopg
        _PG_DRIVER = "psycopg"
    except Exception:
        try:
            import pg8000.dbapi
            _PG_DRIVER = "pg8000"
        except Exception:
            _PG_DRIVER = None

def is_postgres():
    return _IS_POSTGRES

class DatabaseWrapper:
    def __init__(self, raw_conn, is_pg=False):
        self.raw_conn = raw_conn
        self.is_pg = is_pg

    def cursor(self):
        return self.raw_conn.cursor()

    def commit(self):
        self.raw_conn.commit()

    def rollback(self):
        self.raw_conn.rollback()

    def close(self):
        self.raw_conn.close()

def get_connection():
    if _IS_POSTGRES:
        if _PG_DRIVER == "psycopg":
            import psycopg
            conn = psycopg.connect(Config.DATABASE_URL, autocommit=False)
            return DatabaseWrapper(conn, is_pg=True)
        elif _PG_DRIVER == "pg8000":
            import pg8000.dbapi
            # Parse database url: postgresql://user:password@host:port/dbname
            pattern = re.compile(r"postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/(.+)")
            m = pattern.match(Config.DATABASE_URL)
            if m:
                user, password, host, port, dbname = m.groups()
                port = int(port) if port else 5432
                conn = pg8000.dbapi.connect(user=user, password=password, host=host, port=port, database=dbname)
                return DatabaseWrapper(conn, is_pg=True)
            raise RuntimeError(f"Unable to parse PostgreSQL URL: {Config.DATABASE_URL}")
        else:
            raise RuntimeError("PostgreSQL URL requested but neither psycopg nor pg8000 could be loaded.")
    else:
        # SQLite
        path_str = Config.DATABASE_URL.replace("sqlite:///", "")
        path = Path(path_str)
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        return DatabaseWrapper(conn, is_pg=False)

@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()

@contextmanager
def transaction():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def _adapt_sql(sql: str, is_pg: bool) -> str:
    if is_pg:
        # Convert '?' placeholders to '%s'
        return re.sub(r"\?", "%s", sql)
    else:
        # Convert '%s' placeholders to '?'
        return re.sub(r"%s", "?", sql)

def execute_query(conn, sql: str, params=()):
    adapted = _adapt_sql(sql, conn.is_pg)
    cur = conn.cursor()
    cur.execute(adapted, params)
    return cur

def fetch_one(conn, sql: str, params=()):
    cur = execute_query(conn, sql, params)
    row = cur.fetchone()
    if row is None:
        return None
    if hasattr(row, "keys"):
        return dict(row)
    elif conn.is_pg:
        # For pg8000 / postgres tuple cursor
        cols = [desc[0] for desc in cur.description]
        return dict(zip(cols, row))
    return dict(row)

def fetch_all(conn, sql: str, params=()):
    cur = execute_query(conn, sql, params)
    rows = cur.fetchall()
    if not rows:
        return []
    if hasattr(rows[0], "keys"):
        return [dict(r) for r in rows]
    elif conn.is_pg:
        cols = [desc[0] for desc in cur.description]
        return [dict(zip(cols, r)) for r in rows]
    return [dict(r) for r in rows]

def run_migrations():
    migration_dir = Path(__file__).resolve().parent / "migrations"
    migration_files = sorted(migration_dir.glob("*.sql"))

    with transaction() as conn:
        for migration_file in migration_files:
            sql = migration_file.read_text(encoding="utf-8")
            if conn.is_pg:
                if migration_file.name == "002_core_committee.sql":
                    conn.cursor().execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check")
                    conn.cursor().execute("""
                        ALTER TABLE users
                        ADD CONSTRAINT users_role_check
                        CHECK (role IN ('convener', 'co_convener', 'volunteer', 'core_committee'))
                    """)

                # Translate the SQLite identity/flag types used by the shared schema.
                # Integer flags preserve the application's existing 0/1 predicates.
                pg_sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
                pg_sql = pg_sql.replace("BOOLEAN", "INTEGER")
                for statement in pg_sql.split(";"):
                    if statement.strip():
                        conn.cursor().execute(statement)
            else:
                if migration_file.name == "002_core_committee.sql":
                    _upgrade_sqlite_user_roles(conn)
                conn.raw_conn.executescript(sql)

        if conn.is_pg:
            existing_column = fetch_one(conn, """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'volunteer_profiles'
                  AND column_name = 'interviewed_by'
            """)
        else:
            existing_columns = conn.raw_conn.execute("PRAGMA table_info(volunteer_profiles)").fetchall()
            existing_column = next((column for column in existing_columns if column["name"] == "interviewed_by"), None)

        if not existing_column:
            conn.cursor().execute("ALTER TABLE volunteer_profiles ADD COLUMN interviewed_by TEXT")


def _upgrade_sqlite_user_roles(conn):
    """Rebuild legacy SQLite users tables to allow the core_committee role."""
    schema = fetch_one(conn, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    if not schema or "core_committee" in (schema["sql"] or "").lower():
        return

    raw_conn = conn.raw_conn
    raw_conn.execute("PRAGMA foreign_keys = OFF")
    raw_conn.execute("PRAGMA legacy_alter_table = ON")
    try:
        raw_conn.execute("BEGIN IMMEDIATE")
        raw_conn.execute("ALTER TABLE users RENAME TO users_legacy")
        raw_conn.execute("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT,
                role TEXT NOT NULL CHECK (role IN ('convener', 'co_convener', 'volunteer', 'core_committee')),
                status TEXT NOT NULL DEFAULT 'pending_activation' CHECK (status IN ('pending_activation', 'active', 'locked', 'inactive')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_login_at TEXT
            )
        """)
        raw_conn.execute("""
            INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at, last_login_at)
            SELECT id, email, password_hash, role, status, created_at, updated_at, last_login_at
            FROM users_legacy
        """)
        raw_conn.execute("DROP TABLE users_legacy")
        raw_conn.commit()
    except Exception:
        raw_conn.rollback()
        raise
    finally:
        raw_conn.execute("PRAGMA legacy_alter_table = OFF")
        raw_conn.execute("PRAGMA foreign_keys = ON")

    if raw_conn.execute("PRAGMA foreign_key_check").fetchone():
        raise RuntimeError("SQLite foreign key validation failed after upgrading user roles.")
