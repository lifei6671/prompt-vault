# Prompt Vault 技术方案 v0.3

> 状态：设计基线  
> 日期：2026-09-23
> 目标：以最少的基础设施和运行时复杂度，实现一个 SEO 友好的文生图 Prompt 收藏与展示网站。

## 1. 产品目标与边界

Prompt Vault 用于沉淀和展示文生图 Prompt。公开页面以图片瀑布流为主要浏览入口，用户可按分类、标签浏览，进入详情页查看生成效果、Prompt、模型和画幅，并复制 Prompt。Prompt 可包含可选参数，使用户能在本地填写变量后复制最终文本。

后台仅面向站点管理员，用于维护 Prompt、变量、分类、标签和图片，并管理草稿、发布与删除。

首版包含：首页、详情、分类、标签、分页和加载更多、参数化 Prompt 复制、后台 CRUD、图片上传、草稿/发布、SEO、sitemap、robots、Open Graph、图片懒加载，以及 Cloudflare Access 后台保护。

首版不包含：普通用户账户、收藏/评论/投稿、在线调用模型、Prompt 自动改写、AI 自动分类、向量搜索、推荐算法、多角色 RBAC、独立搜索服务、独立 API Server、独立 Python 服务或 ORM。

## 2. 架构原则

### 2.1 单 Worker、单 TypeScript 技术栈

首版采用 React Router v8 SSR、TypeScript、Vite + Cloudflare Vite Plugin、Cloudflare Workers、D1、R2、Tailwind CSS + shadcn/ui 与 Cloudflare Access。页面渲染、表单提交、D1 读写和后台 R2 上传均在一个业务 Worker 中完成。

不增加 FastAPI、Node API Server、Docker、Nginx、MySQL、Redis 或额外运行单元。React Router route 处理 loader/action 与 SSR；不额外设计只供当前前端调用的 REST API。未来有公共 API、移动端或第三方集成的明确需求时，再增加 /api/*。

不引入 Python Worker：当前工作主要是 CRUD、筛选、SSR 和上传，第二种语言与运行时没有足够收益。出现批量分析、自动标签、模型调用、Embedding 或复杂数据处理时再评估。

不引入 ORM：使用 D1 Binding、参数化 SQL 和 migrations/*.sql。迁移不在应用启动时动态执行。

### 2.2 生产域名与资源边界

| 用途 | 固定地址 | 责任 |
| --- | --- | --- |
| 主站 | https://vault.disign.me | Cloudflare Worker Custom Domain，SSR 与后台上传 |
| 图片 | https://vault-pic.disign.me | R2 Custom Domain，直接公开读取对象 |

生产环境设置 IMAGE_BASE_URL=https://vault-pic.disign.me。D1 只保存 R2 object key，页面以该配置拼接公开图片 URL。Worker 只处理后台上传，不代理公开图片 GET。

生产环境关闭 R2 的 r2.dev 公共开发地址与 workers.dev；后台不以 preview 或备用访问入口对外提供。首版不启用会妨碍 Google 图片搜索或外部展示的全局 Referer 防盗链。未来发生明显盗链时，再评估 WAF 或速率策略。

## 3. 总体架构

```mermaid
flowchart TB
    U[用户 / 搜索引擎爬虫] --> W[Cloudflare Worker<br/>React Router v8 SSR]
    A[管理员] --> ACCESS[Cloudflare Access]
    ACCESS --> W
    W --> D1[(Cloudflare D1)]
    W --> R2[(Cloudflare R2 上传)]
    U --> PIC[vault-pic.disign.me<br/>R2 Custom Domain]
    PIC --> R2
```

公共 GET 由 loader 查询 D1 并 SSR 输出 HTML；后台写请求由 action 完成鉴权、校验、D1/R2 写入。图片浏览器请求直接到 R2 Custom Domain，不经过 Worker。

## 4. 路由与 URL 生命周期

### 4.1 公共路由

| 路由 | 用途 | 索引规则 |
| --- | --- | --- |
| / | 首页瀑布流 | 可索引 |
| /prompt/:slug | Prompt 详情 | 核心索引页 |
| /category/:slug | 单一分类列表 | 可索引 |
| /tag/:slug | 单一标签列表 | 可索引 |
| /robots.txt | 爬虫规则 | 必须 |
| /sitemap.xml | URL 索引 | 必须 |

分类与标签使用固定 SEO 路由。首版筛选 UI 支持“一个 category + 一个 tag”的组合筛选，组合条件使用 query URL，并统一 `noindex,follow`、不进入 sitemap；仅 category 或仅 tag 时跳转到对应固定 SEO 路由。多标签交集筛选不进入 v0.3。未知排序或过滤参数同样不得进入索引。

slug 统一小写，使用 COLLATE NOCASE UNIQUE。草稿阶段可以修改 slug；首次发布后，只要 published_at 已有值，slug 永久冻结，标题仍可修改。published_at 仅记录首次发布，撤回后再次发布不刷新；每次修改均更新 updated_at，供 sitemap lastmod 使用。

删除为软删除：deleted_at 有值的公开 URL 返回 410 Gone；草稿或撤回状态返回 404。v0.3 不引入 slug_aliases；只有未来确有已发布 URL 改名需求时才增加。

### 4.2 后台路由

```text
/admin
/admin/prompts
/admin/prompts/new
/admin/prompts/:id/edit
/admin/prompts/:id/preview
/admin/categories
/admin/tags
```

创建、编辑、发布、删除使用相应 React Router action；/admin/prompts/:id/preview 仅管理员可见，用于查看草稿和绕过公共缓存的最新数据。

### 4.3 首版语言状态

UI locale 与 Prompt 内容语言独立。UI locale 控制导航、操作文案、分类/标签展示；Prompt 内容语言控制标题、描述、正文、图片 alt、变量与选项展示及复制。首版默认 UI locale 为 `zh-CN`，服务端只接受白名单内的明确偏好（如同站 cookie），无效值回退默认值。切换 UI locale 不自动切换 Prompt 内容语言；首次详情访问默认显示 source_language，用户显式选择已有译文后才显示该版本。SSR 与 hydration 使用同一解析结果；按 cookie 变化的公开 HTML 必须区分缓存语言或不缓存。

slug、公开路径、分页和 canonical 保持 4.1 与第 5 节的单一身份，不新增 locale 路由或平行 sitemap。默认可索引的 Prompt 内容使用原文；非默认语言展示也指向同一 canonical。SEO title/description 与 HTML lang 必须反映实际 SSR 展示语言，不能声明不存在的译文，也不为缺失译文创建 hreflang 目标。

## 5. 分页、瀑布流与 SEO

列表使用 page=N、每页 24 条、OFFSET 分页，查询排序固定为 ORDER BY published_at DESC, id DESC，不引入 cursor。page=1 规范化为不含 page 的 URL；page>=2 的每页使用自己的 self-canonical。非正整数或超过最后一页的 page 返回 404。正常分页页可抓取和索引，不对 page>=2 设置 noindex。

连续翻页期间若恰有新 Prompt 发布，OFFSET 可能造成一次重复或跳项；v0.3 为简单性接受该限制。“加载更多”可以使用 fetcher 追加，但必须保留真实的 <a href> 上一页/下一页入口，作为无 JavaScript 回退和爬虫路径。

首版瀑布流使用 CSS columns 与 break-inside: avoid。这是明确取舍：DOM、Tab 和读屏顺序可能与视觉横向顺序不同；加载更多追加时列可能重新平衡。每张 img 必须输出 preview_width/preview_height 对应的尺寸以预留空间、降低 CLS。出现严格视觉顺序或虚拟化需求后，再迁移 Masonry。

详情页 SSR HTML 直接包含 title、description、canonical、Open Graph、H1、图片与 alt、原始 Prompt、模型、画幅、分类、标签和发布时间。og:image 首版使用 preview，不增加第三份 OG 图片。sitemap 只包含 published 且 deleted_at IS NULL 的 Prompt，以及 published_count > 0 的分类和标签；robots 禁止 /admin/，但草稿不依赖 robots 隐藏。

## 6. 数据模型与语言职责

所有时间统一使用 UTC ISO-8601。D1 执行外键约束；迁移依次应用 `0001_init.sql`、`0002_i18n.sql`，不重写 0001 或在业务请求中迁移。首版内容 locale 白名单为 `zh-CN`、`en-US`，其他值在写入和读取边界拒绝。新增语言时再扩展约束与校验，不新增按语言平铺字段。

### 6.1 原文与翻译

`prompts.source_language` 是原文语言。0001 的 `title`、`description`、`prompt_template`、`image_alt` 永远是该 Prompt 的原文字段；翻译只写 `prompt_translations(prompt_id, locale, title, description, prompt_template, image_alt)`，`(prompt_id, locale)` 唯一。翻译行是完整内容版本；不能把几个字段分别从不同语言拼接，也不能以翻译覆盖原文。源语言对应的翻译行不应写入，写入端必须拒绝；读取端始终优先原文字段。无目标语言翻译时整体回退原文，并把实际展示语言返回给页面和复制逻辑。

`categories`、`tags` 的 0001 `name`（分类还有 `description`）是原文；0002 新增各自的 `source_language` 和 `category_translations(category_id, locale, name, description)`、`tag_translations(tag_id, locale, name)`。它们的 slug/id 是跨语言稳定身份。分类、标签按 UI locale 选择完整翻译行，缺少时回退原文；不根据展示名生成不同 slug。新增 Prompt、Category、Tag 时必须显式写入准确的 source_language；修改翻译时同步更新父行 updated_at，以保持 sitemap lastmod 有效。

0002 为兼容旧行，对三个主表新增 `source_language TEXT NOT NULL DEFAULT 'zh-CN'`，旧原文字段与 URL 均保持不变。迁移前已有英文原文的行会被临时标为 `zh-CN`；部署前须审计并校正这些行的 source_language，尤其是 Prompt 变量选项的源语言标签。校正 source_language 不改写原文内容，也不生成翻译。此默认值只服务旧数据迁移，新写入不能依赖默认值猜语言。

### 6.2 Prompt 与变量

`prompts` 保留 0001 的 slug、状态、图片、分类关联、模型、画幅、时间字段与现有索引；`prompt_template` 是唯一原文正文，零变量时就是普通文本。`prompt_translations.prompt_template` 是派生译文。每个翻译版本的 `{{key}}` 集合必须与原文一致，发布前由服务端校验。

`prompt_variables.variable_key`、`input_type`、`sort_order` 是语言无关契约，`variable_key` 在同一 Prompt 内唯一。`label`、`input_placeholder` 是原文展示字段，语言随所属 Prompt 的 source_language；`prompt_variable_translations(variable_id, locale, label, input_placeholder)` 存派生展示文案。变量文案按当前实际展示的 Prompt 内容语言选择，缺失时整体回退原文。翻译不得改变 key、类型或选项 value。

`select` 的 `options_json` 使用有序 JSON 数组，格式示例：

```json
[
  { "value": "vintage", "labels": { "zh-CN": "复古", "en-US": "Vintage" } },
  { "value": "modern", "labels": { "zh-CN": "现代" } }
]
```

`value` 是非空、唯一、语言无关的小写 ASCII 业务值，表单状态使用 value，替换正文时使用当前内容语言的 label；`labels` 用于显示及正文替换，必须包含所属 Prompt 的 source_language，允许缺少另一语言。显示 label 优先当前 Prompt 内容语言，缺少时回退源语言 label。写入与读取均校验 JSON、稳定 value、支持的 locale、非空 label 和去重。`text` 的 options_json 为空；`select` 必须至少有一个有效选项。0002 将旧字符串数组转为 `option_1`、`option_2` 等稳定 value，并保留原字符串为源语言 label；迁移后不再写旧数组格式。旧原文复制仍使用原 label；后台上线前应按真实语义人工审阅这些自动生成的 value。

### 6.3 关联与查询

`prompt_tags` 的关联、分类/标签 slug 和 Prompt slug 保持唯一身份。翻译表以父 ID 与 locale 为复合主键，父行删除时级联清理。公开查询应只取所需字段，并批量读取目标 locale 的翻译，避免 24 张卡片逐条查询。用户填写变量值只在浏览器交互状态，不落 D1。

## 7. Prompt 参数化模板

Prompt 文本允许零个或多个 `{{key}}`；key 使用小写 ASCII snake_case，建议正则 `^[a-z][a-z0-9_]{0,63}$`。变量仅有 `text`、`select` 两种，均为可选。未填写时复制保留占位符；填写后替换该 key 的全部出现位置，只执行一轮 literal substitution，输入中出现的新 `{{...}}` 不递归展开。select 表单状态保存稳定 value，界面显示并向正文填入当前内容语言的 label；缺译时回退源语言 label。页面预览与复制必须使用同一份解析结果。

后台发布前扫描原文和各翻译正文的 token，校验每个 key 恰有一份变量定义、每份变量至少被正文引用、各语言 key 集合一致，并校验 select 的规范 options_json。无变量 Prompt 不展示空表单，直接复制当前显示语言的正文。用户填写值只保存在浏览器 state，不写 URL、服务端、D1 或日志；SSR 仍输出可索引的正文。

## 8. 图片与上传

原图仅接受 JPEG、PNG、WebP，保留源格式，object key 使用真实扩展名；preview 统一 WebP，最长边约 640–768px。建议 key：

```text
prompts/{yyyy}/{mm}/{uuid}/original.{ext}
prompts/{yyyy}/{mm}/{uuid}/preview.webp
```

服务端生成 UUID，禁止以原文件名作为 key。上传对象写入正确 Content-Type 与：

```text
Cache-Control: public, max-age=31536000, immutable
```

管理后台浏览器生成 preview，并必须正确处理图片方向，避免 EXIF orientation 导致旋转错误；可使用浏览器图像解码与 Canvas 等能力，但不绑定到单一 API。Worker 不承担通用图片转换。服务端仍校验 MIME、大小、可解析宽高、图片 alt 与 key；不接受 SVG。

上传不使用 request.formData() 一次性缓冲大文件。Worker 以 raw/stream 方式接收文件并流式写入 R2，控制内存压力，仍保持单 Worker。

## 9. D1 与 R2 一致性

R2 与 D1 没有跨服务事务。设计目标是最多留下可回收的孤儿对象，绝不形成稳定的裂图引用。

| 场景 | 顺序与失败处理 |
| --- | --- |
| 创建 | 生成 key → 流式上传 original → 流式上传 preview → 两个 R2 均成功后，以一次 db.batch() 写入 prompt、variables、tags。R2 部分失败则 best-effort 删除已上传对象且不写 D1；D1 batch 失败则 best-effort 删除两个新对象。 |
| 更新图片 | 先上传新对象 → 以 db.batch() 原子切换 key → best-effort 删除旧对象。 |
| 删除 Prompt | 先在 DB 中写入删除状态（deleted_at）→ best-effort 清理 R2；失败记录必要日志并人工补偿。 |

多表写一律使用 db.batch()，禁止多次串联 await 造成可见中间态。

## 10. 缓存

生产环境启用 2026 Workers Caching：wrangler 配置 `cache.enabled=true`，local 可关闭。公共 HTML 只有在 Workers Caching 已启用且响应缓存指令允许时才进入边缘缓存。

| 响应 | 策略 |
| --- | --- |
| 公共匿名 GET HTML | Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=60 |
| 管理员预览 | Cache-Control: no-store，立即读取 D1 最新内容 |
| /admin/*、写请求、4xx/5xx | Cache-Control: no-store |
| R2 图片 | vault-pic.disign.me 直出，对象 immutable 一年；key 不可变，替换生成新 key |

接受公开页面最长约 5 分钟内容延迟。暂不实现主动 purge、cache tag 或 Redis/Cache API 手工缓存；有真实需要后再引入。

## 11. 后台 Access 纵深防御

Cloudflare Access 以 hostname/path 同时保护 `vault.disign.me/admin` 与 `vault.disign.me/admin/*`。React Router 的 admin.tsx 统一 layout 在进入后台 route 前执行 requireAdmin()；边缘策略与应用层校验共同构成后台访问边界。

requireAdmin() 验证 Cf-Access-Jwt-Assertion 的签名、issuer 与 AUD，并使用 jose 和远程 JWKS；随后再次检查管理员 email allowlist。管理员身份相关配置使用 secrets/env，禁止写死在代码。

后台写操作要求 `Origin` 精确匹配 `https://vault.disign.me`，并要求 `Sec-Fetch-Site: same-origin`；Origin 缺失、异常或跨站请求默认拒绝。若真实浏览器兼容性证明需要，再引入 CSRF token；v0.3 不提前建立复杂 token 系统。后台全部 `no-store`。

## 12. 工程结构

建议职责如下，精确目录可随 React Router 项目约定调整：

```text
app/
├── components/
│   ├── prompt-card.tsx
│   ├── prompt-grid.tsx
│   ├── prompt-variable-form.tsx
│   └── copy-prompt-button.tsx
├── routes/
│   ├── admin.tsx                 # 后台统一 layout / requireAdmin
│   ├── admin.prompts.id.preview.tsx
│   ├── prompt.slug.tsx
│   ├── category.slug.tsx
│   ├── tag.slug.tsx
│   ├── robots.txt.ts
│   └── sitemap.xml.ts
├── services/
│   ├── prompt.server.ts
│   ├── image.server.ts
│   ├── category.server.ts
│   ├── tag.server.ts
│   ├── seo.server.ts
│   └── admin-auth.server.ts
├── lib/
│   ├── prompt-template.ts
│   ├── slug.ts
│   ├── pagination.ts
│   └── validation.ts
└── root.tsx

migrations/
wrangler.jsonc
vite.config.ts
react-router.config.ts
```

route 负责请求边界、SSR 数据装配和 action；*.server.ts 负责 D1/R2 与业务约束；component 不直接访问数据库；prompt-template.ts 负责 token 扫描、变量校验与单轮替换。不建立 Controller → Service → Repository 的多层模板结构。

## 13. 测试基线

使用 Vitest + `@cloudflare/vitest-plugin`。按实施阶段至少覆盖：

- zh-CN/en-US 白名单、原文/译文整体回退、select 稳定 value 与本地化 label、非法 locale/option；
- 0001 + 0002 从空库迁移，以及旧字符串选项转换与翻译表约束；
- slug 规范化与首次发布后冻结；
- token 扫描、变量校验、单轮替换、空值保留 token；
- 草稿不可公开、删除后返回 410；
- category/tag 过滤；
- page 参数规范化、越界 404 与排序；
- D1 db.batch() 回滚；
- 图片 MIME、大小和 key；
- Access JWT 与管理员白名单；
- Origin 与 Sec-Fetch-Site 写操作校验；
- sitemap 排除 draft、deleted、空分类和空标签。

## 14. 环境、部署与迁移

### Local

- Wrangler 本地运行时；
- 本地 D1；
- 本地/模拟 R2；
- local 可关闭 Workers cache；
- 常规开发与测试不依赖生产数据。

### Production

- vault.disign.me → Worker Custom Domain；
- vault-pic.disign.me → R2 Custom Domain；
- R2 r2.dev disabled；
- workers.dev disabled；
- D1 + R2 + Access；
- IMAGE_BASE_URL=https://vault-pic.disign.me；
- DB、IMAGES 等 Binding 通过 wrangler types 生成类型，业务代码不手写不完整 Env。

继续不单独建设 staging。部署前运行项目定义的 typecheck、test、build。migration 人工执行时，部署清单必须包含 D1 Time Travel/备份确认与回滚检查；应用启动时不自动迁移。

## 15. 可观测性

启用 Cloudflare Workers Observability，只记录必要结构化日志：request id、route、status、duration、关键 D1/R2 错误、后台写操作类型，以及 R2 清理失败的补偿线索。禁止记录完整 Prompt 正文、最终变量值、Access Token、Cookie 或其他认证信息。不引入独立日志平台或 APM。

## 16. 验收标准

### 前台与模板

- 首页 SSR 返回已发布 Prompt，图片瀑布流在加载前后无明显跳动；
- 分类、标签、详情与分页在禁用 JavaScript 时仍可访问主体内容；
- 无变量 Prompt 详情仅显示原始 Prompt 与一键复制；
- 有变量 Prompt 自动展示 text/select 表单；
- 未填变量时复制保留 {{key}}，填值只替换对应 token 的全部出现；
- select 值只能来自配置 options；刷新后用户填写值消失，不产生网络提交或持久化；
- 后台不能发布 token 与变量定义不一致的 Prompt；
- 参数化 UI 不改变 SSR 可索引的原始 Prompt 内容。

### SEO、后台与工程

- 页面源代码包含详情标题、描述、H1、原始 Prompt、图片及 alt；
- sitemap 仅包含应公开内容，canonical 与分页规则正确；
- Access 未认证用户不能进入 /admin/*，管理员可创建草稿、上传两种图片、维护变量/分类/标签、发布、撤回、编辑、软删除；
- D1 migration 可从空库依次应用 0001、0002，旧 v0.2 行可保留原文并转换 select 选项；
- 项目定义的 typecheck、test、build 均通过。

## 17. 实施顺序

1. **Phase 1：工程骨架**：React Router v8、Cloudflare Vite Plugin、Wrangler、D1/R2 Binding、migration、Vitest + @cloudflare/vitest-plugin、本地启动/类型检查/构建；初始化时锁定兼容版本并提交 pnpm lockfile，CI 不使用浮动 latest。
2. **Phase 2 前：双语数据基线**：0002 forward migration、locale 与回退解析、旧数据源语言审计。
3. **Phase 2：只读前台**：数据访问、首页 SSR、瀑布流、详情、分类、标签、分页、模板复制。
4. **Phase 3：SEO**：metadata、canonical、Open Graph、robots、sitemap、图片 alt/尺寸与无 JavaScript 检查。
5. **Phase 4：后台**：Access/requireAdmin()、Prompt/变量 CRUD、分类/标签、流式图片上传、草稿/发布/删除与孤儿清理。
6. **Phase 5：上线基线**：生产 D1/R2、两个 Custom Domain、Access、缓存、Observability、部署与 D1 回滚清单、提交 sitemap。

## 18. 后续演进触发条件

只有出现明确需求或指标后才引入新组件：

| 触发条件 | 演进方向 |
| --- | --- |
| Prompt 规模增大且关键词检索变慢 | D1 FTS / 专用搜索 |
| 用户开始以自然语言找风格 | Embedding + Vectorize |
| 需要自动分析、自动标签、Prompt 改写 | Workers AI 或独立 Python Worker |
| 普通用户需要收藏和投稿 | 用户系统 + 业务权限 |
| 图片变体和流量成本成为主要问题 | Cloudflare Images / Image Transformations |
| 需要严格视觉顺序或单页持续加载量过大 | Masonry 虚拟化 |
| 后台出现多人协作 | 应用内账号与 RBAC |
| 需要已发布 URL 改名 | slug_aliases 与重定向策略 |
| 发布风险提高 | staging + 自动 migration pipeline |

v0.3 仅实现已经进入本设计基线的需求；新能力依照实际触发条件进入后续设计。
