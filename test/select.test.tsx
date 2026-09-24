import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Select } from "../app/components/ui/select";
import { AdminPromptFields } from "../app/components/admin-prompt-fields";

describe("custom Select", () => {
  it("renders a named hidden value for form submission and an accessible trigger", () => {
    const html = renderToStaticMarkup(createElement(Select, {
      name: "category_id", defaultValue: "42", ariaLabel: "Category", required: true,
      options: [{ value: "", label: "Choose category" }, { value: "42", label: "Posters" }],
    }));
    expect(html).toContain('name="category_id"');
    expect(html).toContain('value="42"');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Category"');
    expect(html).toContain('aria-required="true"');
    expect(html).toContain("Posters");
    expect(html).not.toContain("<select");
  });

  it("uses controlled values and omits disabled fields from submission", () => {
    const html = renderToStaticMarkup(createElement(Select, {
      name: "translation_mode", value: "remove", disabled: true, ariaLabel: "Translation mode",
      options: [{ value: "present", label: "Present" }, { value: "remove", label: "Remove" }],
    }));
    expect(html).toContain('name="translation_mode"');
    expect(html).toContain('value="remove"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("Remove");
  });

  it("keeps Admin editor field names and values", () => {
    const html = renderToStaticMarkup(createElement(AdminPromptFields, {
      locale: "en-US", source: "en-US", taxonomy: {
        categories: [{ id: 42, name: "Posters" }], tags: [],
      }, editable: true,
    }));
    expect(html).toContain('name="source_language" value="en-US"');
    expect(html).toContain('name="category_id" value=""');
    expect(html).toContain('name="translation_mode" value="remove"');
    expect(html).toContain('aria-label="Category"');
    expect(html).not.toContain("<select");
  });

  it("has no native select in app TSX source", () => {
    const files = import.meta.glob("../app/**/*.tsx", { query: "?raw", import: "default", eager: true });
    expect(Object.keys(files).length).toBeGreaterThan(0);
    for (const [path, source] of Object.entries(files))
      expect(source, path).not.toMatch(/<select\b/);
  });
});
