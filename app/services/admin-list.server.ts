export const ADMIN_PAGE_SIZE = 20;

export type AdminListFilters = {
  q: string; status: "all" | "draft" | "published" | "deleted";
  category: string; model: string; ratio: string; page: number;
};

export type AdminListItem = {
  id: number; preview_image_key: string; preview_width: number; preview_height: number;
  title: string; description: string | null; slug: string; category_name: string;
  model: string | null; ratio: string | null; status: "draft" | "published";
  deleted_at: string | null; updated_at: string;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function readAdminListFilters(params: URLSearchParams): AdminListFilters {
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const rawStatus = params.get("status");
  const status = rawStatus === "draft" || rawStatus === "published" || rawStatus === "deleted"
    ? rawStatus : "all";
  const category = params.get("category") ?? "";
  const model = params.get("model") ?? "";
  const ratio = params.get("ratio") ?? "";
  const rawPage = params.get("page") ?? "1";
  return {
    q, status,
    category: slugPattern.test(category) && category.length <= 80 ? category : "",
    model: model.trim().slice(0, 120),
    ratio: ratio.trim().slice(0, 60),
    page: /^[1-9]\d*$/.test(rawPage) && Number.isSafeInteger(Number(rawPage)) ? Number(rawPage) : 1,
  };
}

export async function getAdminNavCounts(db: D1Database) {
  const [prompts, categories, tags] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM prompts").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM categories").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM tags").first<{ count: number }>(),
  ]);
  return { prompts: prompts!.count, categories: categories!.count, tags: tags!.count };
}

export async function getAdminPromptSummary(db: D1Database) {
  const row = await db.prepare(`SELECT COUNT(*) AS total,
    COALESCE(SUM(CASE WHEN deleted_at IS NULL AND status = 'draft' THEN 1 ELSE 0 END), 0) AS draft,
    COALESCE(SUM(CASE WHEN deleted_at IS NULL AND status = 'published' THEN 1 ELSE 0 END), 0) AS published,
    COALESCE(SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS deleted
    FROM prompts`).first<{ total: number; draft: number; published: number; deleted: number }>();
  return row!;
}

export async function getAdminListOptions(db: D1Database) {
  const [categories, models, ratios] = await Promise.all([
    db.prepare("SELECT slug, name FROM categories ORDER BY sort_order, name, id")
      .all<{ slug: string; name: string }>(),
    db.prepare("SELECT DISTINCT model AS value FROM prompts WHERE model IS NOT NULL AND model <> '' ORDER BY model")
      .all<{ value: string }>(),
    db.prepare("SELECT DISTINCT ratio AS value FROM prompts WHERE ratio IS NOT NULL AND ratio <> '' ORDER BY ratio")
      .all<{ value: string }>(),
  ]);
  return { categories: categories.results, models: models.results.map((row) => row.value),
    ratios: ratios.results.map((row) => row.value) };
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function queryAdminPrompts(db: D1Database, filters: AdminListFilters) {
  const where: string[] = [];
  const args: string[] = [];
  if (filters.q) {
    where.push("(p.title LIKE ? ESCAPE '\\' OR p.slug LIKE ? ESCAPE '\\')");
    const search = `%${escapeLike(filters.q)}%`;
    args.push(search, search);
  }
  if (filters.status === "deleted") where.push("p.deleted_at IS NOT NULL");
  else if (filters.status !== "all") {
    where.push("p.deleted_at IS NULL AND p.status = ?");
    args.push(filters.status);
  }
  if (filters.category) { where.push("c.slug = ?"); args.push(filters.category); }
  if (filters.model) { where.push("p.model = ?"); args.push(filters.model); }
  if (filters.ratio) { where.push("p.ratio = ?"); args.push(filters.ratio); }
  const from = "FROM prompts p JOIN categories c ON c.id = p.category_id";
  const condition = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const total = (await db.prepare(`SELECT COUNT(*) AS count ${from}${condition}`)
    .bind(...args).first<{ count: number }>())!.count;
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const rows = await db.prepare(`SELECT p.id, p.preview_image_key, p.preview_width, p.preview_height,
    p.title, p.description, p.slug, c.name AS category_name, p.model, p.ratio,
    p.status, p.deleted_at, p.updated_at ${from}${condition}
    ORDER BY p.updated_at DESC, p.id DESC LIMIT ? OFFSET ?`)
    .bind(...args, ADMIN_PAGE_SIZE, (page - 1) * ADMIN_PAGE_SIZE).all<AdminListItem>();
  return { items: rows.results, total, page, pages };
}
