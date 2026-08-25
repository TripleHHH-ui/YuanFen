import { describe, expect, it } from "vitest";
import {
  applySwipe,
  initialTasteState,
  scorePlace,
  seedVector,
  undoSwipe,
  type DeckCard,
  type Place,
} from "../src/index.js";

const card = (id: string, tags: string[]): DeckCard => ({
  id,
  title: id,
  emoji: "x",
  vibeTags: tags as DeckCard["vibeTags"],
});

const place = (id: string, tags: string[]): Place => ({
  id,
  name: id,
  lat: 0,
  lng: 0,
  area: "t",
  vibeTags: tags as Place["vibeTags"],
  openHours: { daily: [["00:00", "23:59"]] },
  estStayMin: 60,
  estCostSGD: 10,
  priceBand: 1,
  emoji: "x",
  blurb: "t",
});

describe("seedVector (FR-002)", () => {
  it("gives picked tags positive weight and others zero", () => {
    const v = seedVector(["food", "coffee", "nature", "culture", "chill"]);
    expect(v.food).toBeGreaterThan(0);
    expect(v.chill).toBeGreaterThan(0);
    expect(v.beach).toBe(0);
  });
});

describe("applySwipe / undo (FR-003)", () => {
  it("like raises card tags, pass lowers them", () => {
    const s0 = initialTasteState(seedVector(["food"]));
    const liked = applySwipe(s0, card("a", ["nature"]), "like");
    expect(liked.vector.nature).toBeGreaterThan(s0.vector.nature);
    const passed = applySwipe(s0, card("b", ["nightlife"]), "pass");
    expect(passed.vector.nightlife).toBeLessThan(s0.vector.nightlife);
  });

  it("must-go boosts harder than like and records the place id", () => {
    const s0 = initialTasteState(seedVector(["food"]));
    const c = { ...card("c", ["views"]), placeId: "sg-mbs-skypark" };
    const liked = applySwipe(s0, c, "like");
    const must = applySwipe(s0, c, "mustgo");
    expect(must.vector.views).toBeGreaterThan(liked.vector.views);
    expect(must.mustGo).toContain("sg-mbs-skypark");
  });

  it("undo restores the exact previous state including must-go list", () => {
    const s0 = initialTasteState(seedVector(["food"]));
    const c = { ...card("c", ["views"]), placeId: "p1" };
    const s1 = applySwipe(s0, c, "mustgo");
    const s2 = undoSwipe(s1);
    expect(s2.vector).toEqual(s0.vector);
    expect(s2.mustGo).toEqual(s0.mustGo);
    expect(s2.swipeCount).toBe(0);
  });

  it("counts swipes toward the 15-card session cap", () => {
    let s = initialTasteState(seedVector(["food"]));
    for (let i = 0; i < 3; i++) s = applySwipe(s, card(`c${i}`, ["food"]), "like");
    expect(s.swipeCount).toBe(3);
  });
});

describe("scorePlace", () => {
  it("ranks a food place above a park for a food-heavy vector", () => {
    let s = initialTasteState(seedVector(["food"]));
    s = applySwipe(s, card("a", ["food"]), "like");
    s = applySwipe(s, card("b", ["food", "culture"]), "like");
    const foodScore = scorePlace(s.vector, place("hawker", ["food"]));
    const parkScore = scorePlace(s.vector, place("park", ["nature", "chill"]));
    expect(foodScore).toBeGreaterThan(parkScore);
  });

  it("is deterministic", () => {
    const v = seedVector(["art", "history"]);
    const p = place("museum", ["art", "history"]);
    expect(scorePlace(v, p)).toBe(scorePlace(v, p));
  });
});
