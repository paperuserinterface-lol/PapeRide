-- ============================================================================
-- TBRide :: schema.sql
-- PostgreSQL 16+ schema for the TBRide ride-hailing / dispatch platform.
-- PostGIS is intentionally NOT used. Coordinates are stored as DECIMAL.
--   latitude  DECIMAL(10,8)  ->  -90.00000000 .. 90.00000000
--   longitude DECIMAL(11,8)  -> -180.00000000 .. 180.00000000
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name    VARCHAR(120) NOT NULL,
    phone_number VARCHAR(24)  NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    role         VARCHAR(16)  NOT NULL
                 CHECK (role IN ('user', 'driver', 'operator', 'admin')),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_role_idx       ON users (role);
CREATE INDEX IF NOT EXISTS users_phone_idx      ON users (phone_number);
CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC);

-- ---------------------------------------------------------------------------
-- driver_profiles  (1:1 with users where role = 'driver')
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_profiles (
    driver_id     UUID        PRIMARY KEY
                  REFERENCES users (id) ON DELETE CASCADE,
    vehicle_model VARCHAR(80) NOT NULL,
    license_plate VARCHAR(24) NOT NULL UNIQUE,
    status        VARCHAR(16) NOT NULL DEFAULT 'offline'
                  CHECK (status IN ('offline', 'online', 'active')),
    current_lat   DECIMAL(10, 8),
    current_lng   DECIMAL(11, 8),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- either both coordinates are set, or neither
    CONSTRAINT driver_coords_pair
        CHECK ((current_lat IS NULL) = (current_lng IS NULL)),
    CONSTRAINT driver_lat_range
        CHECK (current_lat IS NULL OR (current_lat >= -90  AND current_lat <= 90)),
    CONSTRAINT driver_lng_range
        CHECK (current_lng IS NULL OR (current_lng >= -180 AND current_lng <= 180))
);

CREATE INDEX IF NOT EXISTS driver_profiles_status_idx ON driver_profiles (status);
CREATE INDEX IF NOT EXISTS driver_profiles_updated_idx ON driver_profiles (updated_at DESC);

-- ---------------------------------------------------------------------------
-- ride_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ride_requests (
    id                 UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID         NOT NULL
                       REFERENCES users (id) ON DELETE CASCADE,
    pickup_lat         DECIMAL(10, 8) NOT NULL,
    pickup_lng         DECIMAL(11, 8) NOT NULL,
    dropoff_lat        DECIMAL(10, 8) NOT NULL,
    dropoff_lng        DECIMAL(11, 8) NOT NULL,
    assigned_driver_id UUID REFERENCES users (id) ON DELETE SET NULL,
    operator_id        UUID REFERENCES users (id) ON DELETE SET NULL,
    -- optional human readable addresses (Telegram riders type them in);
    -- NULL for map-only web requests, which fall back to coordinates
    pickup_label       VARCHAR(160),
    dropoff_label      VARCHAR(160),
    status             VARCHAR(16)  NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'assigned', 'in_progress',
                                         'completed', 'cancelled')),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ride_lat_range
        CHECK (pickup_lat  BETWEEN -90 AND 90
           AND dropoff_lat BETWEEN -90 AND 90),
    CONSTRAINT ride_lng_range
        CHECK (pickup_lng  BETWEEN -180 AND 180
           AND dropoff_lng BETWEEN -180 AND 180),
    -- a ride must actually move somewhere (>= ~11 metres apart)
    CONSTRAINT ride_points_differ
        CHECK (pickup_lat <> dropoff_lat OR pickup_lng <> dropoff_lng)
);

CREATE INDEX IF NOT EXISTS ride_requests_status_idx        ON ride_requests (status);
CREATE INDEX IF NOT EXISTS ride_requests_user_idx          ON ride_requests (user_id);
CREATE INDEX IF NOT EXISTS ride_requests_driver_idx        ON ride_requests (assigned_driver_id);
CREATE INDEX IF NOT EXISTS ride_requests_operator_idx      ON ride_requests (operator_id);
CREATE INDEX IF NOT EXISTS ride_requests_created_at_idx    ON ride_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS ride_requests_active_status_idx ON ride_requests (created_at)
    WHERE status IN ('pending', 'assigned', 'in_progress');

-- HARD concurrency guard at the database level:
--   * a driver can hold at most one live ride
--   * a rider   can have at most one live ride
DROP INDEX IF EXISTS ride_requests_one_live_per_driver;
DROP INDEX IF EXISTS ride_requests_one_live_per_user;

CREATE UNIQUE INDEX IF NOT EXISTS ride_requests_one_active_per_driver
    ON ride_requests (assigned_driver_id)
    WHERE assigned_driver_id IS NOT NULL
      AND status IN ('assigned', 'in_progress');

-- A rider may hold several *pending* requests (that is what the dispatch board
-- shows), but PostgreSQL still guarantees at most one ride that is actually
-- being served. Duplicate pending spam is rejected by the service layer.
CREATE UNIQUE INDEX IF NOT EXISTS ride_requests_one_active_per_user
    ON ride_requests (user_id)
    WHERE status IN ('assigned', 'in_progress');

-- ---------------------------------------------------------------------------
-- system_logs  (admin panel / audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_logs (
    id         BIGSERIAL    PRIMARY KEY,
    actor_id   UUID REFERENCES users (id) ON DELETE SET NULL,
    actor_role VARCHAR(16),
    event      VARCHAR(64)  NOT NULL,
    entity_id  UUID,
    level      VARCHAR(16)  NOT NULL DEFAULT 'info'
               CHECK (level IN ('info', 'warn', 'error')),
    details    JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_logs_created_at_idx ON system_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS system_logs_event_idx      ON system_logs (event);
CREATE INDEX IF NOT EXISTS system_logs_actor_idx      ON system_logs (actor_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tbride_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS driver_profiles_touch_updated_at ON driver_profiles;
CREATE TRIGGER driver_profiles_touch_updated_at
    BEFORE UPDATE ON driver_profiles
    FOR EACH ROW EXECUTE FUNCTION tbride_touch_updated_at();

DROP TRIGGER IF EXISTS ride_requests_touch_updated_at ON ride_requests;
CREATE TRIGGER ride_requests_touch_updated_at
    BEFORE UPDATE ON ride_requests
    FOR EACH ROW EXECUTE FUNCTION tbride_touch_updated_at();

COMMIT;
