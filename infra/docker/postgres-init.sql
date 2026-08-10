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
-- the postgres service.
--
-- IMPLEMENTATION NOTE: this file used to wrap the CREATE DATABASE calls
-- in a PL/pgSQL DO block. That does not work — Postgres refuses
-- `CREATE DATABASE` from inside a function or multi-statement
-- transaction ("CREATE DATABASE cannot be executed from a function"),
-- so the init script errored and the postgres container exited 3 on
-- every clean `docker compose up`. The psql `\gexec` idiom below runs
-- each CREATE as its own top-level statement, and the SELECT that
-- feeds it filters out databases that already exist — so the script
-- stays idempotent AND legal.

SELECT format('CREATE DATABASE %I OWNER medapp', datname)
FROM (
    VALUES
        ('medapp_users'),
        ('medapp_doctors'),
        ('medapp_nurses'),
        ('medapp_hospitals'),
        ('medapp_bookings'),
        ('medapp_payments'),
        ('medapp_telemedicines'),
        ('medapp_notifications'),
        ('medapp_inbox'),
        ('medapp_labs'),
        ('medapp_ehrs'),
        ('medapp_social'),
        ('medapp_analytics'),
        ('medapp_onboarding'),
        ('medapp_wearables'),
        ('medapp_pms'),
        ('medapp_hms_mgmt'),
        ('medapp_pharmacies'),
        ('medapp_pharmacists')
) AS wanted(datname)
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE pg_database.datname = wanted.datname
)
\gexec
