-- CollabCut SQLite Database Schema
-- Real-time collaborative video editing platform

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL CHECK(length(username) >= 3 AND length(username) <= 30),
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL CHECK(length(display_name) >= 1 AND length(display_name) <= 50),
    avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'offline' CHECK(status IN ('online', 'offline', 'away')),
    preferences JSON DEFAULT '{}' CHECK(json_valid(preferences))
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK(length(name) >= 1 AND length(name) <= 100),
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL,
    settings JSON DEFAULT '{}' CHECK(json_valid(settings)),
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'deleted')),
    cloud_sync_enabled BOOLEAN DEFAULT 0,
    last_sync_at DATETIME,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Project membership association table
CREATE TABLE IF NOT EXISTS project_memberships (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer', 'commenter')),
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    invited_by TEXT,
    permissions JSON DEFAULT '{}' CHECK(json_valid(permissions)),
    UNIQUE(project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (invited_by) REFERENCES users(id)
);

-- Media assets table
CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    filename TEXT NOT NULL CHECK(length(filename) > 0),
    file_path TEXT NOT NULL,
    cloud_url TEXT,
    file_type TEXT NOT NULL CHECK(file_type IN ('video', 'audio', 'image', 'subtitle')),
    file_size INTEGER CHECK(file_size > 0),
    duration REAL CHECK(duration IS NULL OR duration > 0),
    resolution TEXT,
    framerate REAL CHECK(framerate IS NULL OR framerate > 0),
    codec TEXT,
    thumbnail_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    uploaded_by TEXT NOT NULL,
    metadata JSON DEFAULT '{}' CHECK(json_valid(metadata)),
    folder_path TEXT DEFAULT '',
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- Timeline sequences table
CREATE TABLE IF NOT EXISTS timeline_sequences (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL CHECK(length(name) >= 1 AND length(name) <= 100),
    duration REAL DEFAULT 0 CHECK(duration >= 0),
    framerate REAL NOT NULL CHECK(framerate > 0),
    resolution TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL,
    settings JSON DEFAULT '{}' CHECK(json_valid(settings)),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Timeline tracks table
CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    sequence_id TEXT NOT NULL,
    track_type TEXT NOT NULL CHECK(track_type IN ('video', 'audio', 'subtitle')),
    track_index INTEGER NOT NULL CHECK(track_index >= 0),
    name TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    locked BOOLEAN DEFAULT 0,
    solo BOOLEAN DEFAULT 0,
    muted BOOLEAN DEFAULT 0,
    volume REAL DEFAULT 1.0 CHECK(volume >= 0.0 AND volume <= 1.0),
    FOREIGN KEY (sequence_id) REFERENCES timeline_sequences(id) ON DELETE CASCADE
);

-- Clips table
CREATE TABLE IF NOT EXISTS clips (
    id TEXT PRIMARY KEY,
    track_id TEXT NOT NULL,
    media_asset_id TEXT NOT NULL,
    start_time REAL NOT NULL CHECK(start_time >= 0),
    end_time REAL NOT NULL CHECK(end_time > start_time),
    media_in REAL NOT NULL CHECK(media_in >= 0),
    media_out REAL NOT NULL CHECK(media_out > media_in),
    name TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    locked BOOLEAN DEFAULT 0,
    opacity REAL DEFAULT 1.0 CHECK(opacity >= 0.0 AND opacity <= 1.0),
    speed REAL DEFAULT 1.0 CHECK(speed > 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
    FOREIGN KEY (media_asset_id) REFERENCES media_assets(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Effects table
CREATE TABLE IF NOT EXISTS effects (
    id TEXT PRIMARY KEY,
    clip_id TEXT NOT NULL,
    effect_type TEXT NOT NULL CHECK(length(effect_type) > 0),
    name TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    parameters JSON DEFAULT '{}' CHECK(json_valid(parameters)),
    keyframes JSON DEFAULT '[]' CHECK(json_valid(keyframes)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    order_index INTEGER NOT NULL CHECK(order_index >= 0),
    FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    clip_id TEXT,
    sequence_id TEXT,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL CHECK(length(content) > 0),
    timestamp REAL CHECK(timestamp IS NULL OR timestamp >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'resolved', 'deleted')),
    reply_to TEXT,
    CHECK((clip_id IS NOT NULL) OR (sequence_id IS NOT NULL)),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE,
    FOREIGN KEY (sequence_id) REFERENCES timeline_sequences(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id),
    FOREIGN KEY (reply_to) REFERENCES comments(id)
);

-- Live cursors table for real-time collaboration
CREATE TABLE IF NOT EXISTS live_cursors (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    sequence_id TEXT NOT NULL,
    position REAL NOT NULL CHECK(position >= 0),
    active BOOLEAN DEFAULT 1,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    color TEXT NOT NULL CHECK(color LIKE '#%' AND length(color) = 7),
    activity_type TEXT DEFAULT 'viewing' CHECK(activity_type IN ('editing', 'viewing', 'selecting')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (sequence_id) REFERENCES timeline_sequences(id) ON DELETE CASCADE
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

CREATE INDEX IF NOT EXISTS idx_project_memberships_project_user ON project_memberships(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_project_memberships_user_id ON project_memberships(user_id);

CREATE INDEX IF NOT EXISTS idx_media_assets_project_id ON media_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets(created_at);
CREATE INDEX IF NOT EXISTS idx_media_assets_file_type ON media_assets(file_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_uploaded_by ON media_assets(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_timeline_sequences_project_id ON timeline_sequences(project_id);
CREATE INDEX IF NOT EXISTS idx_timeline_sequences_created_at ON timeline_sequences(created_at);

CREATE INDEX IF NOT EXISTS idx_tracks_sequence_id ON tracks(sequence_id);
CREATE INDEX IF NOT EXISTS idx_tracks_sequence_track_index ON tracks(sequence_id, track_index);

CREATE INDEX IF NOT EXISTS idx_clips_track_id ON clips(track_id);
CREATE INDEX IF NOT EXISTS idx_clips_media_asset_id ON clips(media_asset_id);
CREATE INDEX IF NOT EXISTS idx_clips_created_by ON clips(created_by);
CREATE INDEX IF NOT EXISTS idx_clips_timeline_position ON clips(track_id, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_effects_clip_id ON effects(clip_id);
CREATE INDEX IF NOT EXISTS idx_effects_order ON effects(clip_id, order_index);

CREATE INDEX IF NOT EXISTS idx_comments_project_id ON comments(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_clip_id ON comments(clip_id);
CREATE INDEX IF NOT EXISTS idx_comments_sequence_id ON comments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_reply_to ON comments(reply_to);

CREATE INDEX IF NOT EXISTS idx_live_cursors_user_id ON live_cursors(user_id);
CREATE INDEX IF NOT EXISTS idx_live_cursors_project_id ON live_cursors(project_id);
CREATE INDEX IF NOT EXISTS idx_live_cursors_sequence_id ON live_cursors(sequence_id);
CREATE INDEX IF NOT EXISTS idx_live_cursors_active ON live_cursors(active);
CREATE INDEX IF NOT EXISTS idx_live_cursors_last_updated ON live_cursors(last_updated);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at);

-- Triggers for updating timestamps
CREATE TRIGGER update_projects_timestamp 
    AFTER UPDATE ON projects
    BEGIN
        UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_comments_timestamp 
    AFTER UPDATE ON comments
    BEGIN
        UPDATE comments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_live_cursors_timestamp 
    AFTER UPDATE ON live_cursors
    BEGIN
        UPDATE live_cursors SET last_updated = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Initial data for development (only insert if not exists)
INSERT OR IGNORE INTO users (id, username, email, display_name, status) VALUES
    ('demo-user-1', 'demo_user', 'demo@example.com', 'Demo User', 'online');

INSERT OR IGNORE INTO projects (id, name, description, created_by) VALUES
    ('demo-project-1', 'Demo Project', 'A sample video editing project', 'demo-user-1');

INSERT OR IGNORE INTO project_memberships (id, project_id, user_id, role) VALUES
    ('demo-membership-1', 'demo-project-1', 'demo-user-1', 'owner');