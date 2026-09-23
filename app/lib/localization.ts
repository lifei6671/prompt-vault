export const SUPPORTED_LOCALES = ["zh-CN", "en-US"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function parseLocale(value: unknown): Locale {
  if (value === "zh-CN" || value === "en-US") return value;
  throw new Error("Unsupported locale");
}

export function resolveLocalized<T>(
  source: T,
  sourceLanguage: Locale,
  requestedLocale: Locale,
  translation: { locale: Locale; content: T } | null,
): { content: T; locale: Locale } {
  if (requestedLocale !== sourceLanguage && translation?.locale === requestedLocale) {
    return { content: translation.content, locale: requestedLocale };
  }
  return { content: source, locale: sourceLanguage };
}

export type SelectOption = {
  value: string;
  labels: Partial<Record<Locale, string>>;
};

export function parseSelectOptions(json: string, sourceLanguage: Locale): SelectOption[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Select options must be a nonempty array");
  }

  const seen = new Set<string>();
  return parsed.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Invalid select option");
    }
    const { value, labels } = entry as Record<string, unknown>;
    if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(value) || seen.has(value)) {
      throw new Error("Invalid or duplicate option value");
    }
    if (typeof labels !== "object" || labels === null || Array.isArray(labels)) {
      throw new Error("Invalid option labels");
    }
    const validLabels: SelectOption["labels"] = {};
    for (const [locale, label] of Object.entries(labels)) {
      parseLocale(locale);
      if (typeof label !== "string" || label.trim() === "") {
        throw new Error("Invalid option label");
      }
      validLabels[locale as Locale] = label;
    }
    if (!validLabels[sourceLanguage]) {
      throw new Error("Missing source option label");
    }
    seen.add(value);
    return { value, labels: validLabels };
  });
}

export function resolveOptionLabel(
  option: SelectOption,
  sourceLanguage: Locale,
  requestedLocale: Locale,
): string {
  const label = option.labels[requestedLocale] ?? option.labels[sourceLanguage];
  if (!label) throw new Error("Missing source option label");
  return label;
}
