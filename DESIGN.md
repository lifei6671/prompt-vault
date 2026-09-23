# PromptVault Design System

> Version: v0.1  
> Status: Design Baseline  
> Product: PromptVault  
> First-release locales: `zh-CN`, `en-US`

## 1. Purpose

This document is the UI design contract for PromptVault. It is intended to be shared by Stitch, designers, frontend implementation, and later UI review.

PromptVault is a visual-first prompt library. Its core user flow is:

1. Discover a visual result.
2. Open the prompt detail.
3. Understand the prompt and its usage requirements.
4. Optionally fill prompt variables.
5. Copy the final prompt.
6. Reuse it in an external AI product.

The product should feel like a focused content tool rather than an AI generation dashboard, social feed, ecommerce marketplace, or administration system.

The design system must optimize for three things:

- fast visual discovery;
- efficient prompt reading and copying;
- stable bilingual and future multilingual layout.

## 2. Product Positioning

### 2.1 Primary product model

PromptVault combines three proven interaction patterns:

- image-first discovery similar to visual prompt galleries;
- prompt-centric detail and copy workflow;
- structured metadata for model, category, ratio, language, tags, and variables.

The visual hierarchy is always:

**Image → Title → Prompt → Primary Action → Metadata**

Metadata must support discovery and understanding without competing with the image or prompt.

### 2.2 First-release scope

PromptVault v0.1 supports:

- image prompt discovery;
- prompt details;
- prompt variables;
- one-click prompt copy;
- Chinese and English UI;
- Chinese and English prompt content when translations exist;
- desktop and mobile responsive layouts.

The system must remain compatible with future content types such as video prompts, text prompts, structured JSON prompts, reusable skills, and other prompt assets.

### 2.3 Design references

Use current prompt and visual content products as interaction references, not as visual templates:

- PromptHero: search, filtering, prompt discovery;
- OpenArt / Lexica: high-density image-first browsing;
- PromptBase: concise metadata structure and parameterized prompt concepts;
- Pinterest / Unsplash: efficient visual scanning;
- Linear: restrained interface density and component discipline.

Do not directly copy any single product.

## 3. Design Principles

### 3.1 Visual first

On discovery surfaces, the image is the primary information carrier. Users should be able to decide whether a prompt is interesting before reading detailed text.

Avoid long prompt previews on image cards.

### 3.2 Browse for discovery, detail for use

Discovery pages answer:

> Is this result relevant to me?

Detail pages answer:

> How do I use this prompt?

Keep these responsibilities separate.

### 3.3 Prompt is a first-class content object

Prompt text is not treated as an anonymous code block. The interface must understand:

- source language;
- translated versions;
- variables;
- variable input types;
- model;
- tags;
- image requirements;
- copy state;
- future prompt revisions.

### 3.4 Actions stay close to content

The primary copy action must remain visually and spatially connected to the prompt being copied.

On desktop, the main copy action belongs at the bottom of the prompt interaction panel.

On mobile, the primary copy action should remain reachable through a sticky bottom action area when appropriate.

### 3.5 Reduce visual noise

Prefer neutral backgrounds, typography, whitespace, subtle borders, and clear hierarchy.

Avoid:

- generic AI purple gradients;
- neon effects;
- glassmorphism;
- oversized rounded cards;
- heavy shadows;
- excessive badges;
- dashboard-like widget grids;
- decorative charts unrelated to prompt usage.

### 3.6 One component, one responsibility

Repeated interaction patterns must be expressed as reusable components. New pages should compose existing components before introducing new visual patterns.

## 4. Internationalization Contract

## 4.1 First-release locales

The first release supports exactly:

- Simplified Chinese: `zh-CN`
- English: `en-US`

Other languages are not part of v0.1 content or visual acceptance, but the architecture and component system must remain extensible.

### 4.2 UI language and prompt language are independent

Site UI language controls:

- navigation;
- buttons;
- filters;
- helper text;
- empty states;
- errors;
- SEO UI strings.

Prompt language controls:

- prompt title;
- prompt description;
- prompt body;
- variable labels where localized;
- copied prompt text.

Changing the site language must not silently replace the prompt's source text.

### 4.3 Source language must be preserved

Each prompt has a stable `source_language`.

Translations are derived content and must never replace the original prompt.

A typical content model is conceptually:

- source language;
- localized title;
- localized description;
- localized prompt body;
- stable variables;
- localized variable labels and options.

Do not model localization through fields such as `title_en`, `title_zh`, `prompt_en`, and `prompt_zh`. Use locale-keyed translations.

### 4.4 Variable keys are language-neutral

Variables use stable internal keys.

Example:

- key: `subject`
- Chinese label: 主体
- English label: Subject

Select options also use stable values with localized display labels.

This prevents translated prompts from defining incompatible variable contracts.

### 4.5 Language switcher

The global language selector belongs in the header.

Desktop label may use a compact form such as:

- 中文
- EN

The expanded menu must display language names in their own language:

- 简体中文
- English

Do not use country flags to represent languages.

### 4.6 Prompt language tabs

When more than one prompt translation exists, the prompt panel may show:

- 中文
- English · 原文

The source version should be identifiable.

Copying copies the currently displayed prompt language.

If a translation is machine-generated in the future, it must be explicitly marked as AI translated. Human-maintained translations do not need a special marker.

### 4.7 Text expansion

No button, tab, dropdown, chip, or label may depend on a fixed text width.

Use content-driven width with minimum height and inline padding.

English layouts must tolerate approximately 30–50% text expansion compared with common Chinese labels.

### 4.8 Future RTL compatibility

Although right-to-left languages are not part of v0.1 acceptance, components must avoid hardcoded directional assumptions.

Prefer logical concepts and CSS logical properties:

- start / end;
- inline-start / inline-end;
- margin-inline;
- padding-inline.

Prompt text containers should support automatic text direction detection where appropriate.

## 5. Visual Foundation

### 5.1 Overall visual direction

Use:

**Modern editorial layout × visual asset library × restrained productivity tool**

The visual tone should be:

- clean;
- calm;
- precise;
- content-focused;
- high-density without feeling crowded.

The product should not visually resemble an AI chat application.

### 5.2 Color tokens

Default theme is light.

| Token | Value | Usage |
| --- | --- | --- |
| `bg-page` | `#F7F7F5` | page background |
| `bg-surface` | `#FFFFFF` | cards, panels |
| `bg-inverse` | `#111111` | image viewer / lightbox |
| `text-primary` | `#18181B` | primary text |
| `text-secondary` | `#71717A` | metadata |
| `text-muted` | `#A1A1AA` | supporting text |
| `border-default` | `#E4E4E7` | default border |
| `border-hover` | `#D4D4D8` | hover border |
| `action-primary` | `#2563EB` | primary action |
| `action-primary-hover` | `#1D4ED8` | primary action hover |
| `status-success` | `#16A34A` | success feedback |
| `status-danger` | `#DC2626` | destructive/error feedback |

Color should support hierarchy rather than decorate the interface.

Dark mode may be added later and is not required for the first Stitch baseline.

### 5.3 Typography

Preferred font strategy:

- Latin: Inter or system sans-serif;
- Simplified Chinese: Noto Sans SC or high-quality system Chinese sans-serif;
- Japanese future fallback: Noto Sans JP;
- Korean future fallback: Noto Sans KR;
- code / JSON only: modern monospace stack.

Natural-language prompts should use the normal UI sans-serif font by default. Do not force long natural-language prompts into monospace.

Recommended scale:

| Role | Size | Weight | Line height |
| --- | ---: | ---: | ---: |
| Page title | 28–32px | 600–700 | 1.2 |
| Detail title | 22–24px | 600 | 1.3 |
| Section title | 16px | 600 | 1.4 |
| Card title | 14–15px | 500–600 | 1.4 |
| Body | 14–16px | 400 | 1.55–1.7 |
| Prompt text | 14–15px | 400 | 1.65 |
| Metadata | 12–13px | 400–500 | 1.4 |

Chinese long-form prompt text should favor approximately 1.65 line height.

### 5.4 Spacing

Use a 4px base grid.

Primary spacing scale:

- 4
- 8
- 12
- 16
- 24
- 32
- 48
- 64

Prefer 16–24px internal spacing for normal content panels.

### 5.5 Radius

Use restrained corner radii.

- buttons and inputs: 8px;
- cards: 12px;
- modal / drawer / bottom sheet: 16px;
- small chips: fully rounded only when the semantic shape is genuinely a chip.

Avoid turning every container into a pill.

### 5.6 Shadows

Borders are preferred over shadows.

Use shadows only for floating layers such as:

- dropdown;
- popover;
- modal;
- drawer;
- floating action element.

Card grids should remain mostly flat.

### 5.7 Content width

Desktop maximum page width: approximately 1440px.

Normal working content area: approximately 1280–1360px, depending on viewport.

The layout should remain centered with responsive horizontal padding.

## 6. Responsive Foundation

Recommended breakpoints:

- mobile: < 640px;
- tablet: 640–1023px;
- desktop: ≥ 1024px;
- wide desktop optimization: ≥ 1440px.

Do not simply shrink desktop screens for mobile. Mobile prompt consumption must use a dedicated interaction layout.

## 7. Global Navigation

### 7.1 Header

Desktop header:

- approximate height: 64px;
- sticky;
- neutral surface;
- subtle bottom border or background separation.

Recommended information architecture:

**Logo | Explore | Categories | Global Search | Language | User**

Global search is a primary navigation function and should remain visible on normal desktop widths.

Avoid a large SaaS marketing hero above the prompt feed. The first meaningful viewport should expose prompt content quickly.

### 7.2 Global search

Search supports concepts such as:

- prompt title;
- style;
- category;
- model;
- tag.

Placeholder examples:

Chinese:
> 搜索 Prompt、风格、模型或标签

English:
> Search prompts, styles, models, or tags

Search design should feel like a discovery tool, not a chat input.

## 8. Explore / Discovery Page

### 8.1 Page goal

The Explore page maximizes visual scanning speed while keeping filtering accessible.

### 8.2 Recommended structure

1. Header
2. Search / discovery context
3. Filter bar
4. Sort control
5. Prompt masonry grid
6. Loading / pagination behavior

### 8.3 Filters

Primary content-type filters may include:

- 全部 / All
- 图片 / Image
- 视频 / Video
- 文本 / Text

v0.1 may initially contain image prompts while preserving the information architecture.

Additional filters:

- Model
- Category
- Ratio
- Language
- More

Sort:

- Recommended
- Popular
- Newest

Do not display all advanced filters simultaneously if they reduce image density.

### 8.4 Prompt grid

Use a masonry-style image grid on desktop because prompt examples naturally include multiple aspect ratios:

- 1:1
- 3:4
- 2:3
- 16:9
- 2.35:1
- other editorial ratios

Do not crop all assets into a fixed ratio merely to create uniform cards.

Maintain consistent column gutters even when image heights differ.

## 9. Prompt Card

PromptCard is a foundational component.

### 9.1 Content hierarchy

A standard card contains:

1. preview image;
2. title;
3. compact metadata;
4. optional hover actions.

The card must not display the full prompt.

### 9.2 Metadata

Default compact metadata should use approximately one line, for example:

> ChatGPT Image · 海报设计

or:

> ChatGPT Image · Poster Design

Do not show a dense row of tags, author statistics, view counts, and secondary actions by default.

### 9.3 Title

- maximum two lines;
- consistent line clamp;
- no fixed width assumptions;
- long English titles must be tested.

### 9.4 Hover behavior

Desktop hover may reveal:

- favorite action;
- quick copy action when safe and unambiguous.

Clicking the main image/card opens the detail page.

Hover-only actions must have keyboard and touch equivalents.

### 9.5 Card states

Design at least:

- default;
- hover;
- keyboard focus;
- loading;
- image failure;
- favorited where supported.

## 10. Prompt Detail Page

The prompt detail page is the highest-priority product surface.

### 10.1 Desktop layout

Preferred desktop composition:

- approximately 56% visual area;
- approximately 44% prompt/content area.

Conceptual structure:

| Visual area | Prompt interaction area |
| --- | --- |
| Main preview | Title |
| Gallery | Model / tags |
| Optional sticky visual | Variables |
|  | Prompt language |
|  | Prompt body |
|  | Copy action |

The visual area may remain sticky when viewport and content length allow.

The prompt area scrolls naturally.

### 10.2 Visual viewer

The main preview should:

- preserve original aspect ratio;
- avoid destructive cropping;
- support multiple example images;
- use a neutral or dark viewing background when opening a lightbox.

For multiple images:

- one primary image;
- compact thumbnail strip;
- clear selected state.

### 10.3 Prompt panel

The prompt panel should visually group:

- prompt language;
- prompt body;
- variable editing state;
- copy action.

Prompt text must remain easy to select manually.

Do not hide the prompt behind a modal or accordion by default.

## 11. Prompt Variable Interaction

Parameterized prompts are a core PromptVault differentiator.

### 11.1 Placeholder syntax

Prompts may contain variables such as:

- `{{subject}}`
- `{{location}}`
- `{{style}}`

The UI should convert known variables into user-friendly input controls.

### 11.2 v0.1 variable input types

Required:

- text input;
- select.

Data architecture should remain compatible with future:

- textarea;
- radio;
- number;
- boolean;
- image requirement;
- other structured controls.

### 11.3 Variable behavior

If a variable is not filled, the copied prompt retains the placeholder.

Example source:

> 一个 {{subject}}，位于 {{location}}，采用 {{style}}

If only `subject` is filled:

> 一个 九节狼小熊猫，位于 {{location}}，采用 {{style}}

Do not silently remove unfilled placeholders.

### 11.4 Live resolved prompt

When variables change, the displayed prompt updates immediately.

The visible prompt is the exact content that will be copied.

Users should not need a separate “Generate Prompt” step before copying.

### 11.5 Select variables

Select options consist of:

- stable value;
- localized Chinese label;
- localized English label.

Displayed labels change with UI/prompt context while stable values remain language-neutral.

### 11.6 Prompt without variables

When a prompt has no variables:

- completely hide the variable section;
- do not show an empty “No variables” panel;
- keep the detail flow simple: image → title/metadata → prompt → copy.

### 11.7 Image-required prompts

If a prompt requires the user to upload/reference an image in another AI product, show a lightweight requirement indicator such as:

Chinese:
> 需要参考图片

English:
> Reference image required

PromptVault v0.1 does not need to render a fake image upload control unless the product itself is performing generation.

## 12. Copy Interaction

### 12.1 Primary action

Primary label:

Chinese:
> 复制 Prompt

English:
> Copy Prompt

### 12.2 Success feedback

After a successful copy, temporarily change the button state:

Chinese:
> 已复制

English:
> Copied

Use a check icon and success feedback for approximately 1–2 seconds, then return to the normal state.

### 12.3 Copy contract

The copied content is always the currently visible, resolved prompt:

- current prompt language;
- current variable substitutions;
- remaining unfilled placeholders preserved.

This rule must stay deterministic.

## 13. Metadata Components

Metadata should remain secondary.

Potential components:

- ModelBadge
- Category label
- AspectRatio label
- Tags
- Language/source marker
- Image-required marker

Avoid using a different saturated color for every metadata type.

Default metadata visual treatment should use neutral text, subtle borders, or low-emphasis chips.

## 14. Mobile Design

### 14.1 Explore

Prefer a two-column masonry grid on common mobile widths when images remain readable.

On very narrow screens or when card metadata becomes unstable, a one-column fallback is acceptable.

Filters should use horizontally scrollable compact controls or a dedicated filter sheet.

### 14.2 Detail

Recommended mobile order:

1. image;
2. image gallery;
3. title;
4. metadata;
5. variables when present;
6. prompt language;
7. prompt body;
8. copy action.

The copy action may use a sticky bottom action bar if it does not obscure prompt content.

### 14.3 Mobile overlays

Do not reuse desktop popovers for complex mobile selection.

Use bottom sheets for:

- model filter;
- category filter;
- language selection when expanded;
- long select option lists.

## 15. Component Inventory

The first reusable component baseline should include:

### Navigation

- Header
- Logo
- GlobalSearch
- LanguageSwitcher
- UserMenu

### Discovery

- PromptCard
- MasonryGrid
- FilterChip
- FilterDropdown
- SortControl
- CategoryTabs

### Prompt content

- ImageViewer
- ImageGallery
- ModelBadge
- MetadataRow
- Tag
- PromptLanguageTabs
- PromptText

### Interactive prompt

- VariableField
- VariableSelect
- VariableGroup
- ResolvedPrompt
- CopyButton

### Feedback and overlays

- Toast
- Tooltip
- Skeleton
- EmptyState
- ErrorState
- Dropdown
- Drawer
- BottomSheet
- Modal / Lightbox

New pages should reuse this inventory where possible.

## 16. UI States

Stitch designs must include or account for:

- initial loading;
- incremental grid loading;
- empty search result;
- image loading;
- image loading failure;
- prompt copy success;
- favorite active/inactive when applicable;
- prompt translation available;
- prompt translation missing;
- variables untouched;
- variables partially filled;
- variables completely filled;
- no variables;
- long prompt;
- long translated title;
- mobile bottom sheet;
- keyboard focus state;
- disabled action where required;
- generic recoverable error.

## 17. Accessibility

Target: WCAG 2.2 AA.

Requirements:

- normal text contrast ratio of at least 4.5:1 where applicable;
- visible keyboard focus ring;
- icon-only buttons have accessible labels;
- hover is never the only way to access an action;
- semantic buttons and links;
- images provide meaningful alt text where appropriate;
- respect `prefers-reduced-motion`;
- motion is subtle and never required to understand state;
- form controls have visible labels;
- validation/error messages are associated with the relevant field.

## 18. Motion

Motion should clarify state, not decorate the interface.

Recommended durations:

- hover/focus: 120–180ms;
- dropdown/popover: 150–220ms;
- drawer/bottom sheet: 200–280ms;
- copy success state: approximately 1500ms before reset.

Avoid:

- springy overshoot on ordinary controls;
- long page transitions;
- parallax;
- decorative infinite animation.

## 19. Bilingual Content Guidelines

Use natural product language rather than literal translation.

Examples:

| Chinese | English |
| --- | --- |
| 探索 | Explore |
| 分类 | Categories |
| 搜索 Prompt、风格、模型或标签 | Search prompts, styles, models, or tags |
| 复制 Prompt | Copy Prompt |
| 已复制 | Copied |
| 原文 | Original |
| 需要参考图片 | Reference image required |
| 推荐 | Recommended |
| 热门 | Popular |
| 最新 | Newest |
| 无搜索结果 | No results found |

Do not translate the product name PromptVault.

## 20. SEO and Localized Route Compatibility

The design system must not assume a specific URL strategy, but all page templates must work under localized routing in the future.

The UI must support:

- localized page titles;
- localized category names;
- localized prompt title/description;
- canonical source prompt identity independent of locale.

Visual components must not depend on locale-specific URL structure.

## 21. Stitch Baseline Screens

The first Stitch design pass should produce exactly these baseline screens before expanding the design language:

1. Desktop Explore — Chinese
2. Desktop Prompt Detail with variables — Chinese
3. Desktop Prompt Detail without variables — Chinese
4. Desktop Prompt Detail — English
5. Mobile Explore — Chinese
6. Mobile Prompt Detail — Chinese

The English detail screen functions as an internationalization stress test, not as a separate product flow.

At minimum, the English screen should use deliberately longer realistic titles, labels, and prompt text to validate text expansion.

## 22. Stitch Prompt Constraints

When generating PromptVault screens, follow these constraints:

> PromptVault is a visual-first prompt library, not an AI generator dashboard and not an ecommerce marketplace.

> Images are the primary discovery surface. Prompt text becomes the primary interaction surface on the detail page.

> Use restrained editorial layouts, neutral backgrounds, subtle borders, generous whitespace, high information clarity, and minimal shadows.

> Keep metadata visually secondary to images and prompt content.

> Avoid glassmorphism, neon AI gradients, excessive pills, oversized rounded corners, dashboard widget grids, and decorative visual noise.

> Preserve real image aspect ratios in discovery layouts rather than forcing all content into a single crop.

> Treat Chinese and English as first-class production languages. Components must tolerate English text expansion and must not use fixed text widths.

> The prompt source language and site UI language are separate states.

> Parameterized prompts must expose user-friendly variable controls and show the exact resolved text that will be copied.

## 23. Visual Acceptance Criteria

A screen is considered aligned with this design system when:

- the image is clearly dominant on discovery surfaces;
- the prompt is clearly dominant on detail interaction surfaces;
- the primary copy action is easy to locate;
- cards do not become metadata dashboards;
- long prompts remain readable;
- prompt variables are understandable without explaining placeholder syntax;
- prompts without variables remain visually simple;
- Chinese and English layouts share the same component system;
- long English strings do not overflow or collapse layout;
- mobile actions remain reachable without imitating desktop popovers;
- hover states have touch/keyboard equivalents;
- loading, empty, error, and success states are accounted for;
- colors and effects remain restrained;
- new screens can be composed from the documented component inventory.

## 24. Future Compatibility

The v0.1 design system should allow later addition of:

- Japanese;
- Korean;
- right-to-left languages;
- dark mode;
- video prompt previews;
- multi-part prompts;
- structured JSON prompts;
- prompt version history;
- reusable prompt collections;
- user favorites;
- creator profiles;
- prompt import/export;
- Skill or Agent prompt assets.

Future features should extend the current visual hierarchy rather than converting PromptVault into a generic dashboard.

---

This file is the visual and interaction baseline for PromptVault v0.1. Stitch output and frontend implementation should treat it as the default design contract unless a later reviewed version explicitly replaces a rule.
