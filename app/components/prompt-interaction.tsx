import { useEffect, useRef, useState } from "react";
import type { Locale } from "../lib/localization";
import { resolvePrompt } from "../lib/prompt-template";
import { uiCopy } from "../lib/ui-copy";
import type { PromptDetail } from "../services/prompt-detail.server";

export function PromptInteraction({ prompt, locale, pageUrl }: {
  prompt: PromptDetail; locale: Locale; pageUrl: string;
}) {
  const t = uiCopy(locale);
  const [values, setValues] = useState<Record<string, string>>({});
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const replacements: Record<string, string> = {};
  for (const variable of prompt.variables) {
    const value = Object.hasOwn(values, variable.key) ? values[variable.key] : undefined;
    if (!value) continue;
    if (variable.type === "text") replacements[variable.key] = value;
    else {
      const option = variable.options.find((item) => item.value === value);
      if (option) replacements[variable.key] = option.label;
    }
  }
  const resolved = resolvePrompt(prompt.promptTemplate, replacements);

  function languageHref(language: Locale) {
    const url = new URL(pageUrl, "https://vault.disign.me");
    if (language === prompt.sourceLanguage) url.searchParams.delete("prompt_locale");
    else url.searchParams.set("prompt_locale", language);
    return url.pathname + url.search;
  }

  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(resolved);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    timer.current = setTimeout(() => setCopyState("idle"), 1500);
  }

  return (
    <div className="detail-interaction" lang={locale}>
      {prompt.variables.length > 0 && (
        <section className="variable-group" aria-labelledby="variable-heading">
          <div className="detail-section-heading">
            <h2 id="variable-heading">{t.customizePrompt}</h2>
            <button type="button" className="detail-reset" onClick={() => setValues({})}>{t.reset}</button>
          </div>
          <div className="variable-fields">
            {prompt.variables.map((variable) => (
              <div className="variable-field" key={variable.key} lang={prompt.contentLanguage}>
                <label htmlFor={`variable-${variable.key}`}>{variable.label}</label>
                {variable.type === "text"
                  ? <input id={`variable-${variable.key}`} type="text"
                      placeholder={variable.placeholder ?? undefined}
                      value={Object.hasOwn(values, variable.key) ? values[variable.key] : ""}
                      onChange={(event) => setValues({ ...values, [variable.key]: event.target.value })} />
                  : <select id={`variable-${variable.key}`} value={Object.hasOwn(values, variable.key) ? values[variable.key] : ""}
                      onChange={(event) => setValues({ ...values, [variable.key]: event.target.value })}>
                      <option value="">{t.selectPlaceholder}</option>
                      {variable.options.map((option) =>
                        <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>}
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="prompt-panel" aria-label={t.promptBody}>
        {prompt.languages.length > 1 && (
          <nav className="prompt-languages" aria-label={t.promptLanguage}>
            {prompt.languages.map((language) => (
              <a key={language} href={languageHref(language)}
                lang={language} aria-current={language === prompt.contentLanguage ? "page" : undefined}>
                {language === "zh-CN" ? "中文" : "English"}
                {language === prompt.sourceLanguage ? ` · ${t.original}` : ""}
              </a>
            ))}
          </nav>
        )}
        <div className="resolved-prompt" lang={prompt.contentLanguage}>{resolved}</div>
      </section>
      <div className="detail-copy-area">
        <button type="button" className="copy-prompt" onClick={copy}>
          {copyState === "copied" ? t.copied : copyState === "failed" ? t.copyFailed : t.copyPrompt}
        </button>
        <span role="status" aria-live="polite" className="copy-status">
          {copyState === "copied" ? t.copied : copyState === "failed" ? t.copyFailed : ""}
        </span>
      </div>
    </div>
  );
}


