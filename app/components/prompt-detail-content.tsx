import type { Locale } from "../lib/localization";
import { uiCopy } from "../lib/ui-copy";
import type { PromptDetail } from "../services/prompt-detail.server";
import { PromptInteraction } from "./prompt-interaction";

export function PromptDetailContent({ prompt, locale, pageUrl, imageUrl, backHref, backLabel }: {
  prompt: PromptDetail; locale: Locale; pageUrl: string; imageUrl: string;
  backHref: string; backLabel: string;
}) {
  const t = uiCopy(locale);
  return (
    <div className="detail-main">
      <a lang={locale} className="detail-back" href={backHref}>← {backLabel}</a>
      <div className="detail-layout">
        <div className="detail-visual">
          <img src={imageUrl} width={prompt.imageWidth} height={prompt.imageHeight}
            alt={prompt.imageAlt} />
        </div>
        <article className="detail-content" lang={prompt.contentLanguage}>
          <h1 lang={prompt.contentLanguage}>{prompt.title}</h1>
          {prompt.description && <p className="detail-description" lang={prompt.contentLanguage}>{prompt.description}</p>}
          <dl className="detail-meta" lang={locale}>
            {prompt.model && <div><dt>{t.model}</dt><dd>{prompt.model}</dd></div>}
            <div><dt>{t.category}</dt><dd>{prompt.categoryName}</dd></div>
            {prompt.ratio && <div><dt>{t.ratio}</dt><dd>{prompt.ratio}</dd></div>}
            <div><dt>{t.sourceLanguage}</dt><dd>{prompt.sourceLanguage === "zh-CN" ? "中文" : "English"}</dd></div>
          </dl>
          {prompt.tags.length > 0 && <ul className="detail-tags" lang={locale} aria-label={t.tags}>
            {prompt.tags.map((tag) => <li key={tag.slug}>#{tag.name}</li>)}
          </ul>}
          <PromptInteraction prompt={prompt} locale={locale} pageUrl={pageUrl} />
        </article>
      </div>
    </div>
  );
}