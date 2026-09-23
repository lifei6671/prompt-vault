export const TOKEN_PATTERN = /\{\{([a-z][a-z0-9_]{0,63})\}\}/g;

export function scanPromptKeys(template: string): string[] {
  return [...new Set(Array.from(template.matchAll(TOKEN_PATTERN), (match) => match[1]))];
}

export function resolvePrompt(template: string, values: Record<string, string>): string {
  return template.replace(TOKEN_PATTERN, (token, key: string) => Object.hasOwn(values, key) && values[key] ? values[key] : token);
}


