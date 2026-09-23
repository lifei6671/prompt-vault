# prompt-vault

Prompt Vault 文生图 Prompt 收藏与展示应用。

## 文档

- [技术方案 v0.3](docs/technical-design.md)

## Phase 1 开发

技术栈：React Router v8 SSR、TypeScript、Vite + Cloudflare Vite Plugin、Cloudflare Workers、D1、R2、Tailwind CSS v4、shadcn/ui 与 Vitest + `@cloudflare/vitest-plugin`。

```bash
pnpm install
pnpm cf-typegen
pnpm db:migrate:local
pnpm dev
```

常用验证命令：`pnpm typecheck`、`pnpm test`、`pnpm build`。本地 D1 migration 使用 `wrangler d1 migrations apply prompt-vault-db --local`；远端 migration 命令保留为 `pnpm db:migrate:remote`，仅在已完成远端资源配置后执行。

首次部署前，需在 Cloudflare 完成以下步骤。项目脚本已显式关闭 Wrangler 的资源自动创建，不会把本地占位 Binding 自动变成远端资源：

1. 执行 `wrangler d1 create prompt-vault-db`，将返回的真实 `database_id` 替换 `wrangler.jsonc` 中的全零占位符 `00000000-0000-0000-0000-000000000000`。
2. 执行 `wrangler r2 bucket create prompt-vault-images`。
3. 为 Worker 配置 Custom Domain `vault.disign.me`，并为 R2 配置公开读取 Custom Domain `vault-pic.disign.me`；保持 `IMAGE_BASE_URL=https://vault-pic.disign.me`。
4. 在确认 D1 备份/Time Travel 与回滚方案后，执行 `pnpm db:migrate:remote`，再执行 `pnpm deploy`。

## Phase 4A 后台安全配置

部署前在 Worker 环境中设置 `CF_ACCESS_ISSUER`（精确的 `https://<team>.cloudflareaccess.com`）、`CF_ACCESS_AUD`（Access 应用的单个 AUD tag）和 `ADMIN_EMAILS`（逗号分隔的管理员邮箱）。这些值通过 Cloudflare Worker secret/env 提供，不写入 `wrangler.jsonc`；本地未配置时 `/admin` 返回 503。邮箱匹配会去除配置项两侧空白并按大小写不敏感比较，配置中不允许空项。

在 Cloudflare Zero Trust 中为 `vault.disign.me/admin` 和 `vault.disign.me/admin/*` 都配置 Access 应用策略，并限制为预期管理员。边缘 Access 策略必须在 Cloudflare 控制台单独完成；仓库代码只负责 Worker 内的 JWT、邮箱白名单和后台写请求同源校验。后台写请求要求 `Origin: https://vault.disign.me` 与 `Sec-Fetch-Site: same-origin`。
