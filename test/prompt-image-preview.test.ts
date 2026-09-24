import { describe, expect, it, vi } from "vitest";
import { createLocalImagePreview } from "../app/lib/use-prompt-image-upload";
import { createPreview } from "../app/lib/create-preview.client";

vi.mock("../app/lib/create-preview.client", () => ({ createPreview: vi.fn() }));

describe("local image preview", () => {
  it("publishes decoded preview and dimensions before upload can continue", async () => {
    const file = new File(["image"], "example.png", { type: "image/png" });
    const decoded = { blob: new Blob(["preview"], { type: "image/webp" }), width: 1200, height: 800 };
    vi.mocked(createPreview).mockResolvedValue(decoded);
    const events: string[] = [];
    const preview = await createLocalImagePreview(file, (local) => {
      expect(local).toBe(decoded);
      events.push("local");
    });
    events.push("network");
    expect(events).toEqual(["local", "network"]);
    expect(preview.width).toBe(1200);
  });
});
