# PromptVault 生产部署与回滚

本清单按仓库锁定的 Wrangler 4.133.0、本地 `wrangler --help`、`d1 migrations apply --help`、`d1 time-travel info/restore --help` 和 `rollback --help` 核对。以下生产命令仅供获得授权的运维人员执行；仓库脚本不会创建资源或自动执行远端 migration。当前不建设 staging。

## 首次生产准备（Cloudflare Dashboard 人工步骤）

1. 创建 D1 `prompt-vault-db` 与 R2 bucket `prompt-vault-images`，核对账号、区域和权限。把真实 D1 `database_id` 写入 `wrangler.jsonc` 的 `DB` binding；保持 `migrations_dir=migrations`。不要提交 secret 值。
2. 将 Worker Custom Domain 设为 `vault.disign.me`，将 R2 Custom Domain 设为 `vault-pic.disign.me`。关闭 Worker 的 workers.dev 暴露和 R2 的 r2.dev 暴露。`wrangler.jsonc` 已声明 `workers_dev=false`、Worker domain 和 `IMAGE_BASE_URL=https://vault-pic.disign.me`；部署前仍需在 Dashboard 核验域名与 R2 设置。
3. Cloudflare Access 同时保护 `vault.disign.me/admin` 和 `vault.disign.me/admin/*`，用未认证浏览器实测两个路径。配置 Worker 的 `CF_ACCESS_ISSUER`、`CF_ACCESS_AUD`、`ADMIN_EMAILS`，真实值作为 secret/env 管理，不写入仓库。仓库 `requireAdmin()` 的 JWT、issuer、audience 和 email 白名单校验只是第二层防护，不能代替边缘 Access 策略。
4. 确认 Workers Observability 已启用；配置会隐藏 query string、关闭自动 invocation logs。应用每个执行 Worker 的请求输出一条结构化摘要，包含 requestId、method、pathname 路由模板、status、durationMs、admin、D1 统计和公共筛选项缓存计数，字段与使用方式见下方“请求观测”。不得把 SQL、绑定参数、异常原文、Cookie、Token、搜索词、Prompt 正文或表单值加入观测日志。

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
- 响应头：匿名默认首页、详情、分类、标签及 `/image`、`/image/category/:slug`、`/image/tag/:slug` 为 `public, max-age=60, s-maxage=300, stale-while-revalidate=60`；普通 `page=2` 同样可缓存；locale 变体、后台和错误页为 `no-store`；静态资源保留原缓存头。
- 公共分类、标签、模型与比例筛选项由 Cache API 按 UI 语言缓存 300 秒，同一边缘节点上的列表、分页与筛选组合共用。缓存未命中时查询 D1；缓存读写失败不阻断列表，D1 查询失败仍正常报错。后台继续直读 D1，公开筛选项在到期后刷新；叠加整页缓存及 stale 窗口，旧筛选项可能保留约 11 分钟。本次不增加主动全局 purge。
- `/robots.txt` 禁止抓取搜索、模型、比例、原文语言、分类/标签 query、排序和旧 content_type 参数 URL；首页、详情、独立分类/标签路径及普通分页仍可抓取。这只约束遵守 robots 的爬虫，不是请求拦截规则。
- `/.ansible/vault_pass.txt`、`/.git/config`、`/.env`、WordPress 探测路径及 `.php/.jsp/.aspx` 文件请求在 Worker 入口直接返回纯文本 404、`Cache-Control: no-store`，HEAD 不返回正文；不进入 SSR、不读取 D1、不打印路由异常堆栈，仍保留脱敏请求摘要。检查忽略 query、大小写不敏感并解码一次；仅拦截已列明的扫描路径，普通未知路由继续由 React Router 处理。WAF 仍负责边缘拦截，Worker 过滤不能消除已发生的 Worker 调用。
- 如有真实验收样例，可由管理员人工走草稿 → 预览 → 发布链路；不要为 smoke 创建无意义生产内容。
- Smoke 完成后，在 Search Console 人工提交 `https://vault.disign.me/sitemap.xml`。

## 请求观测

Worker 入口使用原生 `withEnv` 为请求注入独立 D1 统计包装，保留其他绑定；并发请求互不串数。不增加数据库查询、依赖、迁移或 Node.js 兼容配置。计数仅在服务器日志中输出，不放入页面或响应头。

| 字段 | 含义 |
| --- | --- |
| `d1Queries` | 请求提交的 D1 语句执行次数，包括失败尝试；`first/all/run` 各计一次，`batch` 按数组中的语句数计，不是网络批次数，不额外计 D1 内部重试。 |
| `d1RowsRead` | 各返回结果 `meta.rows_read` 的合计；读取的是扫描行数，不是返回行数。任何一次执行失败且缺少 metadata 时记 `null`，不伪装成 0；原生 `raw/exec` 不提供读取行数，同样记 `null`。 |
| `d1Errors` | 失败的 D1 API 执行次数；失败 batch 计一次，不猜测其中实际失败的语句数。 |
| `exploreOptionsCacheHits` / `exploreOptionsCacheMisses` | 公共筛选项缓存成功读取 / 确认未命中的次数。未访问该缓存时均为 0。 |
| `exploreOptionsCacheReadErrors` / `exploreOptionsCacheWriteErrors` | 缓存打开、读取、解码失败 / 写入失败次数；错误不计作命中，仍沿既有机制查询 D1。 |

`first()` 使用相同 SQL 的一次 `all()` 执行取得 metadata，再返回首行或指定列；保留空结果、缺列报错和 D1 错误传播。batch 保留原始事务，不拆分执行。请求失败后会等待已开始的并行 D1 调用完成，再输出摘要。

在 Workers Logs 中按 `pathname`、`admin`、`status` 聚合，比较平均 `d1Queries`、已知的 `d1RowsRead` 与 `d1RowsRead=null` 的请求占比。筛选项缓存命中率为 Hits / (Hits + Misses)，同时单独观察 ReadErrors/WriteErrors，避免把缓存故障与正常未命中混淆。冷列表通常为 6 次查询、1 次 Miss，热列表为 2 次查询、1 次 Hit；分类/标签路径还会有身份查询，不能一律要求恰好 2 次。

`pathname` 仅记录 `/prompt/:slug`、`/image/tag/:slug`、`/admin/prompts/:id/edit` 等固定模板，未知路径记 `/other` 或 `/admin/*`；不保留 slug、ID、query 或未知路径原文。requestId 只接受格式合法的 cf-ray，否则生成 UUID；不记录 User-Agent、IP、认证头或异常消息。缓存异常附加日志只有固定文字。

整页 Workers Cache 的 HIT 在 Worker 执行之前返回，因此不会产生应用摘要。这部分命中率应结合 Cloudflare 缓存统计或 `CF-Cache-Status` 检查；不能把没有应用日志的请求算作 0 命中。本地测试验证计数和隔离，真实边缘命中率需发布后单独观察。

## 回滚

1. 先检查旧代码是否兼容现有 D1 schema。Wrangler 4.133.0 的 `wrangler versions list` 可列版本；`wrangler rollback <version-id>` 可回滚 Worker 代码。执行前核对目标 ID、绑定及发布记录。也可在 Dashboard 人工选择已知版本回滚。回滚代码不会回滚 D1。
2. 若确需恢复 D1，先用 `wrangler d1 time-travel info prompt-vault-db --timestamp <RFC3339>` 核对目标 bookmark，再审查恢复点与当前/待回滚 Worker 对 schema 的兼容性，特别是 `0003_retired_image_keys.sql` 的列与引用。Wrangler 4.133.0 支持 `wrangler d1 time-travel restore prompt-vault-db --bookmark <bookmark>`；这是远端恢复命令，仅由运维人员在确认数据损失范围后执行。
3. R2 对象 key 不可变，但更新或删除时旧对象可能已被 best-effort 清理。D1 回滚可能重新引用已经删除的历史对象；恢复数据库前必须检查目标点的图片 key 在 R2 是否仍可访问，并制定缺图修复方案。数据库 Time Travel 不恢复 R2 对象。
4. 回滚后重复 smoke，重点核对图片、后台 Access、公开页面和缓存响应头。

本清单只描述操作；不会自动创建 Cloudflare 资源、修改 Access/Custom Domain、运行远端 migration 或提交 sitemap。
