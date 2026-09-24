import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { checkReleaseConfig, parseJsonc } from "./release-check.mjs";
import { forbiddenPorts } from "./vitest-safe-ports.mjs";

const config = parseJsonc(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"), "wrangler.jsonc");
const schema = JSON.parse(readFileSync(new URL("../node_modules/wrangler/config-schema.json", import.meta.url), "utf8"));
const clone = () => structuredClone(config);
const migrations = new Set(["0001_init.sql", "0002_i18n.sql", "0003_retired_image_keys.sql", "0004_reference_image_requirement.sql"]);
const hasFile = (path) => migrations.has(path.split(/[\\/]/).at(-1));
const valid = () => {
  const copy = clone();
  copy.d1_databases[0].database_id = "123e4567-e89b-42d3-a456-426614174000";
  return copy;
};

test("JSONC comments and trailing commas parse", () => {
  assert.deepEqual(parseJsonc('{ // comment\n "value": 1, }', "fixture.jsonc"), { value: 1 });
});
test("placeholder fails and valid local fixture passes", () => {
  const placeholder = clone();
  placeholder.d1_databases[0].database_id = "00000000-0000-0000-0000-000000000000";
  assert.match(checkReleaseConfig(placeholder, schema, hasFile).join(" "), /database_id/);
  assert.deepEqual(checkReleaseConfig(valid(), schema, hasFile), []);
});
test("wrong domain, binding and missing migration fail", () => {
  const copy = valid();
  copy.routes[0].pattern = "wrong.example";
  copy.r2_buckets[0].binding = "WRONG";
  copy.d1_databases[0].binding = "WRONG";
  const errors = checkReleaseConfig(copy, schema, () => false).join(" ");
  for (const phrase of ["custom domain", "DB binding", "R2 binding", "Missing migration"])
    assert.match(errors, new RegExp(phrase));
});
test("cache and observability settings are required", () => {
  const copy = valid();
  copy.cache.enabled = false;
  copy.observability.redact_query_string = false;
  const errors = checkReleaseConfig(copy, schema, hasFile).join(" ");
  assert.match(errors, /cache.enabled/);
  assert.match(errors, /redact_query_string/);
});
test("admin authorization values stay in Worker secrets", () => {
  const exposed = valid();
  exposed.vars.ADMIN_EMAILS = "admin@example.com";
  exposed.vars.CF_ACCESS_AUD = "audience-id";
  assert.match(checkReleaseConfig(exposed, schema, hasFile).join(" "), /must not be committed under vars/);

  const missing = valid();
  missing.secrets.required = ["ADMIN_EMAILS"];
  assert.match(checkReleaseConfig(missing, schema, hasFile).join(" "), /secrets.required/);
});
test("deploy script gates the actual deploy command", () => {
  const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
  assert.equal(scripts["release:check"], "node scripts/release-check.mjs");
  assert.match(scripts["verify:release"], /typecheck.*test.*build/);
  assert.match(scripts.deploy, /^pnpm run release:check && pnpm run verify:release && wrangler deploy /);
});

test("Vitest reserves every Undici forbidden port Windows may assign", () => {
  const pluginPackage = realpathSync(new URL("../node_modules/@cloudflare/vitest-plugin/package.json", import.meta.url));
  const pluginRequire = createRequire(pluginPackage);
  const miniflareRequire = createRequire(pluginRequire.resolve("miniflare"));
  const { badPorts } = miniflareRequire("undici/lib/web/fetch/constants.js");
  assert.deepEqual(forbiddenPorts, badPorts.map(Number).filter((port) => port >= 1024));

  const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
  assert.match(scripts.test, /^node scripts\/vitest-safe-ports\.mjs && node --test /);
});
