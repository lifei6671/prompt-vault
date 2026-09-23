-- Existing source fields stay authoritative. Legacy rows are assigned zh-CN;
-- audit and correct source_language for any English originals before publishing.
ALTER TABLE prompts ADD COLUMN source_language TEXT NOT NULL DEFAULT 'zh-CN'
  CHECK(source_language IN ('zh-CN', 'en-US'));
ALTER TABLE categories ADD COLUMN source_language TEXT NOT NULL DEFAULT 'zh-CN'
  CHECK(source_language IN ('zh-CN', 'en-US'));
ALTER TABLE tags ADD COLUMN source_language TEXT NOT NULL DEFAULT 'zh-CN'
  CHECK(source_language IN ('zh-CN', 'en-US'));

CREATE TABLE prompt_translations (
  prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK(locale IN ('zh-CN', 'en-US')),
  title TEXT NOT NULL,
  description TEXT,
  prompt_template TEXT NOT NULL,
  image_alt TEXT NOT NULL,
  PRIMARY KEY(prompt_id, locale)
);

CREATE TABLE category_translations (
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK(locale IN ('zh-CN', 'en-US')),
  name TEXT NOT NULL,
  description TEXT,
  PRIMARY KEY(category_id, locale)
);

CREATE TABLE tag_translations (
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK(locale IN ('zh-CN', 'en-US')),
  name TEXT NOT NULL,
  PRIMARY KEY(tag_id, locale)
);

CREATE TABLE prompt_variable_translations (
  variable_id INTEGER NOT NULL REFERENCES prompt_variables(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK(locale IN ('zh-CN', 'en-US')),
  label TEXT NOT NULL,
  input_placeholder TEXT,
  PRIMARY KEY(variable_id, locale)
);

-- Convert v0.2 string options to stable IDs in their original order.
-- New options_json shape: [{"value":"option_1","labels":{"zh-CN":"原文"}}].
UPDATE prompt_variables
SET options_json = (
  SELECT json_group_array(
    json_object('value', 'option_' || (CAST(legacy.key AS INTEGER) + 1),
                'labels', json_object(prompts.source_language, legacy.value))
  )
  FROM json_each(prompt_variables.options_json) AS legacy
  JOIN prompts ON prompts.id = prompt_variables.prompt_id
)
WHERE input_type = 'select' AND options_json IS NOT NULL;
