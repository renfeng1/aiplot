import { describe, expect, it } from "vitest";

import { chooseModel, getGroupedModelCatalog } from "@/server/models";

describe("model catalog", () => {
  it("returns grouped models", async () => {
    const catalog = await getGroupedModelCatalog();
    expect(catalog.models.length).toBeGreaterThan(0);
    expect(catalog.byCapability.chat.length).toBeGreaterThan(0);
  });

  it("chooses a fallback chat model", async () => {
    const model = await chooseModel({
      capability: "chat",
      tier: "FREE",
    });
    expect(model.capabilities).toContain("chat");
  });
});
