import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const migrations = ["0001_init.sql", "0002_i18n.sql", "0003_retired_image_keys.sql", "0004_reference_image_requirement.sql"];

export function checkReleaseConfig(config, schema, hasFile) {
  const errors = [];
  const requireValue = (ok, message) => { if (!ok) errors.push(message); };
  requireValue(config.workers_dev === false, "workers_dev must be false");
  requireValue(Array.isArray(config.routes) && config.routes.some((route) =>
    route.pattern === "vault.disign.me" && route.custom_domain === true),
  "Worker custom domain must be vault.disign.me");
  requireValue(config.vars?.IMAGE_BASE_URL === "https://vault-pic.disign.me",
    "IMAGE_BASE_URL must be https://vault-pic.disign.me");

  requireValue(config.vars?.CF_ACCESS_ISSUER === "https://lifei6671.cloudflareaccess.com",
    "CF_ACCESS_ISSUER must match the production Cloudflare Access issuer");
  requireValue(!Object.prototype.hasOwnProperty.call(config.vars ?? {}, "ADMIN_EMAILS")
    && !Object.prototype.hasOwnProperty.call(config.vars ?? {}, "CF_ACCESS_AUD"),
  "ADMIN_EMAILS and CF_ACCESS_AUD must not be committed under vars");
  const requiredSecrets = new Set(config.secrets?.required ?? []);
  requireValue(requiredSecrets.has("ADMIN_EMAILS") && requiredSecrets.has("CF_ACCESS_AUD"),
    "ADMIN_EMAILS and CF_ACCESS_AUD must be declared under secrets.required");

  const db = config.d1_databases?.find((item) => item.binding === "DB");
  requireValue(db?.database_name === "prompt-vault-db", "DB binding/database_name must be DB/prompt-vault-db");
  requireValue(typeof db?.database_id === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(db.database_id)
    && db.database_id !== "00000000-0000-0000-0000-000000000000",
  "DB database_id must be a real non-placeholder UUID");
  requireValue(db?.migrations_dir === "migrations", "DB migrations_dir must be migrations");
  requireValue(config.r2_buckets?.some((item) =>
    item.binding === "IMAGES" && item.bucket_name === "prompt-vault-images"),
  "R2 binding/bucket_name must be IMAGES/prompt-vault-images");
  for (const name of migrations) requireValue(hasFile(join("migrations", name)), `Missing migration: ${name}`);

  const definitions = schema?.definitions;
  requireValue(definitions?.CacheOptions?.properties?.enabled?.type === "boolean"
    && config.cache?.enabled === true, "Wrangler cache.enabled must be supported and true");
  requireValue(definitions?.Observability?.properties?.enabled?.type === "boolean"
    && config.observability?.enabled === true, "Wrangler observability.enabled must be supported and true");
  requireValue(definitions?.Observability?.properties?.redact_query_string?.type === "boolean"
    && config.observability?.redact_query_string === true,
  "Wrangler observability.redact_query_string must be supported and true");
  requireValue(definitions?.Observability?.properties?.logs?.properties?.invocation_logs?.type === "boolean"
    && config.observability?.logs?.invocation_logs === false,
  "Wrangler observability.logs.invocation_logs must be supported and false");
  return errors;
}

export function parseJsonc(source, filename) {
  const parsed = ts.parseConfigFileTextToJson(filename, source);
  if (parsed.error) throw new Error(`${filename}: invalid JSONC`);
  return parsed.config;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseJsonc(readFileSync(join(root, "wrangler.jsonc"), "utf8"), "wrangler.jsonc");
    const schema = JSON.parse(readFileSync(join(root, "node_modules/wrangler/config-schema.json"), "utf8"));
    const errors = checkReleaseConfig(config, schema, (path) => existsSync(join(root, path)));
    if (errors.length) {
      for (const error of errors) console.error(`release:check: ${error}`);
      process.exitCode = 1;
    } else console.log("release:check: local configuration passed");
  } catch (error) {
    console.error(`release:check: ${error.message}`);
    process.exitCode = 1;
  }
}
