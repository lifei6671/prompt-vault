import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [index("routes/home.tsx"), route("image", "routes/image.tsx"),
  route("image/category/:slug", "routes/image-category.tsx"),
  route("image/tag/:slug", "routes/image-tag.tsx"),
  route("prompt/:slug", "routes/prompt-detail.tsx"),
  route("category/:slug", "routes/category.tsx"), route("tag/:slug", "routes/tag.tsx"),
  route("robots.txt", "routes/robots.txt.ts"), route("sitemap.xml", "routes/sitemap.xml.ts"),
  route("admin", "routes/admin.tsx", [index("routes/admin-index.tsx"), route("categories", "routes/admin-categories.tsx"), route("tags", "routes/admin-tags.tsx"), route("prompts", "routes/admin-prompts.tsx"), route("prompts/new", "routes/admin-prompt-new.tsx"), route("prompts/new/image/:kind", "routes/admin-prompt-upload.ts"), route("prompts/:id/edit", "routes/admin-prompt-edit.tsx"), route("prompts/:id/image", "routes/admin-prompt-image.ts"), route("prompts/:id/preview", "routes/admin-prompt-preview.tsx")])] satisfies RouteConfig;
