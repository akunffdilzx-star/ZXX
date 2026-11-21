PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 device_name TEXT NOT NULL, device_model TEXT DEFAULT '', android_version TEXT DEFAULT '',
 pairing_code TEXT UNIQUE, device_credential_hash TEXT, status TEXT NOT NULL DEFAULT 'offline',
 last_seen TEXT, created_at TEXT NOT NULL, revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS media (
 id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
 filename TEXT NOT NULL, original_name TEXT NOT NULL, media_type TEXT NOT NULL,
 file_path TEXT NOT NULL, file_size INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS camera_permissions (
 id TEXT PRIMARY KEY, device_id TEXT UNIQUE NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
 remote_camera_enabled INTEGER NOT NULL DEFAULT 0, consent_version TEXT, consented_at TEXT, revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS camera_sessions (
 id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, status TEXT NOT NULL,
 started_at TEXT NOT NULL, stopped_at TEXT
);
CREATE TABLE IF NOT EXISTS activity_logs (
 id TEXT PRIMARY KEY, device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
 user_id TEXT REFERENCES users(id) ON DELETE SET NULL, event_type TEXT NOT NULL,
 description TEXT NOT NULL, created_at TEXT NOT NULL
);
