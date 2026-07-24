-- Per-service Postgres databases used by the MedApp dev stack.
--
-- Postgres's docker-entrypoint-initdb.d runs every .sql here ONCE,
-- the first time the container starts against an empty data volume.
-- Re-runs after that point are a no-op (entrypoint skips init when
-- PGDATA already has a `pg_version` file). If you change this file
-- and want the new DBs to appear in an existing volume, the easiest
-- path is `docker compose down -v` (destroys the pgdata volume).
--
-- All databases share the `medapp` role declared via POSTGRES_USER on
-- the postgres service. `IF NOT EXISTS` is not legal for `CREATE
-- DATABASE` in plain SQL, so we use the dollar-quoted DO block pattern
-- to keep this script idempotent in case it's re-run by hand.

DO $$
DECLARE
    db_name TEXT;
    db_list TEXT[] := ARRAY[
        'medapp_pms',
        'medapp_hms_mgmt',
        'medapp_pharmacies',
        'medapp_pharmacists'
    ];
BEGIN
    FOREACH db_name IN ARRAY db_list LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = db_name) THEN
            EXECUTE format('CREATE DATABASE %I OWNER medapp', db_name);
        END IF;
    END LOOP;
END
$$;
