-- Prevent a cleaned image reference from being bound by a concurrent admin action.
CREATE TABLE retired_image_keys (
  original_image_key TEXT PRIMARY KEY,
  retired_at TEXT NOT NULL
);