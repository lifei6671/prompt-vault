import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { AdminSubmitButton } from "../app/components/admin-submit-button";
import { AdminImageDropzone } from "../app/components/admin-image-dropzone";
import { adminPromptCopy } from "../app/lib/admin-prompt-copy";
import { adminTaxonomyCopy } from "../app/lib/ui-copy";
import TaxonomyAdminPage from "../app/routes/taxonomy-admin";

describe("admin pending controls", () => {
  it("renders localized submit progress and blocks another submit", () => {
    for (const locale of ["zh-CN", "en-US"] as const) {
      const t = adminPromptCopy(locale);
      const pending = renderToStaticMarkup(createElement(AdminSubmitButton, {
        className: "admin-primary-action", pending: true, pendingLabel: t.creatingDraft,
        children: t.createDraft,
      }));
      expect(pending).toContain('type="submit"');
      expect(pending).toContain('disabled=""');
      expect(pending).toContain('aria-busy="true"');
      expect(pending).toContain('aria-hidden="true"');
      expect(pending).toContain(t.creatingDraft);
      const ready = renderToStaticMarkup(createElement(AdminSubmitButton, {
        className: "admin-primary-action", pending: false, pendingLabel: t.creatingDraft,
        children: t.createDraft,
      }));
      expect(ready).toContain(t.createDraft);
      expect(ready).not.toContain('aria-busy=');
      expect(ready).not.toContain('disabled=');
      expect(adminTaxonomyCopy(locale).processing).toBeTruthy();
    }
  });
  it("shows taxonomy pending state from a real form navigation", () => {
    const router = createMemoryRouter([{ path: "/", element: createElement(Outlet, { context: "en-US" }),
      children: [{ index: true, element: createElement(TaxonomyAdminPage, { kind: "tag", items: [] }),
        action: () => new Promise(() => {}) }] }]);
    const formData = new FormData();
    formData.set("_intent", "create");
    void router.navigate("/", { formMethod: "post", formData });
    expect(router.state.navigation.state).toBe("submitting");
    const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain(adminTaxonomyCopy("en-US").processing);
    router.dispose();
  });
  it("disables both image controls while upload is in progress", () => {
    const html = renderToStaticMarkup(createElement(AdminImageDropzone, {
      onImage: () => {}, inputLabel: "Original image", buttonLabel: "Processing…",
      uploading: true, children: null,
    }));
    expect(html).toMatch(/type="file"[^>]*disabled=""/);
    expect(html).toMatch(/type="button"[^>]*disabled=""[^>]*aria-busy="true"/);
    expect(html).toContain("Processing…");
  });
});
