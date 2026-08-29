import { describe, expect, it } from "vitest";
import { parseIntent } from "../src/intent.js";

describe("parseIntent (FR-004)", () => {
  it("parses the S1 demo phrase", () => {
    const intent = parseIntent("Day trip in Singapore CBD, must eat chicken rice, then somewhere quiet");
    expect(intent.city).toBe("singapore");
    expect(intent.area).toBe("CBD");
    expect(intent.mustTags).toEqual(["chicken rice"]);
    expect(intent.moodTags).toContain("chill");
  });

  it("handles unknown city without inventing one", () => {
    const intent = parseIntent("Plan me something fun");
    expect(intent.city).toBeNull();
  });

  it("extracts multiple must clauses", () => {
    const intent = parseIntent("Weekend in Chiang Mai, must see Doi Suthep and must eat khao soi");
    expect(intent.city).toBe("chiang-mai");
    expect(intent.mustTags).toEqual(["doi suthep", "khao soi"]);
  });

  it("falls back to the contextual city when none is named", () => {
    const intent = parseIntent("must eat chicken rice, then somewhere quiet", { contextCity: "singapore" });
    expect(intent.city).toBe("singapore");
    expect(intent.cityName).toBe("Singapore");
    expect(intent.mustTags).toEqual(["chicken rice"]);
  });

  it("lets an explicit city override the contextual city", () => {
    const intent = parseIntent("Day trip in Da Nang, must see Dragon Bridge", { contextCity: "singapore" });
    expect(intent.city).toBe("da-nang");
    expect(intent.cityName).toBe("Da Nang");
    expect(intent.mustTags).toContain("dragon bridge");
  });

  it("resolves a bare place name to a must-visit place in the contextual city", () => {
    const intent = parseIntent("ArtScience Museum, must eat chicken rice, then somewhere quiet", {
      contextCity: "singapore",
    });
    expect(intent.city).toBe("singapore");
    expect(intent.mustTags).toContain("artscience museum");
    expect(intent.mustTags).toContain("chicken rice");
  });
});
