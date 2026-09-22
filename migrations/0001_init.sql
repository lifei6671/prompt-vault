CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(slug) > 0),
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(slug) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE prompts (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(slug) > 0),
  title TEXT NOT NULL,
  description TEXT,
  prompt_template TEXT NOT NULL,
  model TEXT,
  ratio TEXT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  original_image_key TEXT NOT NULL,
  preview_image_key TEXT NOT NULL,
  original_content_type TEXT NOT NULL,
  original_width INTEGER NOT NULL,
  original_height INTEGER NOT NULL,
  preview_width INTEGER NOT NULL,
  preview_height INTEGER NOT NULL,
  original_size_bytes INTEGER NOT NULL,
  preview_size_bytes INTEGER NOT NULL,
  image_alt TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft', 'published')),
  published_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX prompts_status_published_at_id_idx
  ON prompts(status, published_at DESC, id DESC);
CREATE INDEX prompts_category_status_published_at_id_idx
  ON prompts(category_id, status, published_at DESC, id DESC);

CREATE TABLE prompt_variables (
  id INTEGER PRIMARY KEY,
  prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  variable_key TEXT NOT NULL,
  label TEXT NOT NULL,
  input_type TEXT NOT NULL CHECK(input_type IN ('text', 'select')),
  input_placeholder TEXT,
  options_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(prompt_id, variable_key)
);

CREATE TABLE prompt_tags (
  prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(prompt_id, tag_id)
);

CREATE INDEX prompt_tags_tag_id_prompt_id_idx
  ON prompt_tags(tag_id, prompt_id);
