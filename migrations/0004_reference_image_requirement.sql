ALTER TABLE prompts ADD COLUMN requires_reference_image INTEGER NOT NULL DEFAULT 0
  CHECK(requires_reference_image IN (0, 1));
