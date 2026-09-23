# PromptVault 生产部署与回滚

本清单按仓库锁定的 Wrangler 4.133.0、本地 `wrangler --help`、`d1 migrations apply --help`、`d1 time-travel info/restore --help` 和 `rollback --help` 核对。以下生产命令仅供获得授权的运维人员执行；仓库脚本不会创建资源或自动执行远端 migration。当前不建设 staging。

## 首次生产准备（Cloudflare Dashboard 人工步骤）

1. 创建 D1 `prompt-vault-db` 与 R2 bucket `prompt-vault-images`，核对账号、区域和权限。把真实 D1 `database_id` 写入 `wrangler.jsonc` 的 `DB` binding；保持 `migrations_dir=migrations`。不要提交 secret 值。
2. 将 Worker Custom Domain 设为 `vault.disign.me`，将 R2 Custom Domain 设为 `vault-pic.disign.me`。关闭 Worker 的 workers.dev 暴露和 R2 的 r2.dev 暴露。`wrangler.jsonc` 已声明 `workers_dev=false`、Worker domain 和 `IMAGE_BASE_URL=https://vault-pic.disign.me`；部署前仍需在 Dashboard 核验域名与 R2 设置。
3. Cloudflare Access 同时保护 `vault.disign.me/admin` 和 `vault.disign.me/admin/*`，用未认证浏览器实测两个路径。配置 Worker 的 `CF_ACCESS_ISSUER`、`CF_ACCESS_AUD`、`ADMIN_EMAILS`，真实值作为 secret/env 管理，不写入仓库。仓库 `requireAdmin()` 的 JWT、issuer、audience 和 email 白名单校验只是第二层防护，不能代替边缘 Access 策略。
4. 确认 Workers Observability 已启用；配置会隐藏 query string、关闭自动 invocation logs，应用每个请求输出一条仅含 requestId、method、pathname、status、durationMs、admin 的摘要。不得把 Cookie、Token、Prompt 正文或表单值写入日志。

## 每次发布

在仓库根目录完成本地 preflight：

```text
pnpm release:check
pnpm verify:release
```

`release:check` 只读本地配置、Wrangler schema 和 migration 文件；全零 D1 ID 会让它失败。`verify:release` 顺序执行 typecheck、test、build。失败时停止。`pnpm run deploy` 也串联这两项检查后才执行 `wrangler deploy --experimental-auto-create=false`，不会运行 migration。

部署顺序：

1. **数据库安全点。** 记录当前 Worker version ID、D1 Time Travel bookmark/时间点、当前 schema 和图片引用。Wrangler 4.133.0 支持 `wrangler d1 time-travel info prompt-vault-db --timestamp <RFC3339>` 查询历史点，命令作用于远端 D1；备份点及可恢复范围应在 Dashboard 再核验。保留输出中的 bookmark 供应急使用。
2. **Migration。** 核对 `migrations/0001_init.sql` → `0002_i18n.sql` → `0003_retired_image_keys.sql` 顺序及目标库，然后人工执行 `wrangler d1 migrations apply prompt-vault-db --remote`。Wrangler help 说明该命令会提示确认、逐条应用未执行 migration，并在应用后生成备份；失败的单条 migration 会回滚，先前成功的 migration 保留。应用没有 request-time auto migration。生产操作者应在确认 SQL 和备份后执行，不能把此命令接入自动 deploy。
3. **Worker。** preflight 全绿后执行 `pnpm run deploy`；记录新 Worker version ID，确认 Custom Domain 路由生效。
4. **Smoke。** 按下方清单验证；失败时立即停止后续操作并评估代码与 schema 的兼容性。

### Smoke tests

- `/` 返回 200，查看响应 HTML 源含已发布内容与 canonical。
- `/robots.txt`、`/sitemap.xml` 可读，sitemap 只列公开内容；一个真实 published Detail 可读。
- 已发布内容的 R2 图片可经 `https://vault-pic.disign.me` 访问。
- 未认证状态下 `/admin` 和 `/admin/*` 均被 Access 阻挡；认证后后台可读。
- 响应头：匿名默认首页、详情、分类、标签为 `public, max-age=60, s-maxage=300, stale-while-revalidate=60`；普通 `page=2` 同样可缓存；locale 变体、后台和错误页为 `no-store`；静态资源保留原缓存头。
- 如有真实验收样例，可由管理员人工走草稿 → 预览 → 发布链路；不要为 smoke 创建无意义生产内容。
- Smoke 完成后，在 Search Console 人工提交 `https://vault.disign.me/sitemap.xml`。

## 回滚

1. 先检查旧代码是否兼容现有 D1 schema。Wrangler 4.133.0 的 `wrangler versions list` 可列版本；`wrangler rollback <version-id>` 可回滚 Worker 代码。执行前核对目标 ID、绑定及发布记录。也可在 Dashboard 人工选择已知版本回滚。回滚代码不会回滚 D1。
2. 若确需恢复 D1，先用 `wrangler d1 time-travel info prompt-vault-db --timestamp <RFC3339>` 核对目标 bookmark，再审查恢复点与当前/待回滚 Worker 对 schema 的兼容性，特别是 `0003_retired_image_keys.sql` 的列与引用。Wrangler 4.133.0 支持 `wrangler d1 time-travel restore prompt-vault-db --bookmark <bookmark>`；这是远端恢复命令，仅由运维人员在确认数据损失范围后执行。
3. R2 对象 key 不可变，但更新或删除时旧对象可能已被 best-effort 清理。D1 回滚可能重新引用已经删除的历史对象；恢复数据库前必须检查目标点的图片 key 在 R2 是否仍可访问，并制定缺图修复方案。数据库 Time Travel 不恢复 R2 对象。
4. 回滚后重复 smoke，重点核对图片、后台 Access、公开页面和缓存响应头。

本清单只描述操作；不会自动创建 Cloudflare 资源、修改 Access/Custom Domain、运行远端 migration 或提交 sitemap。
