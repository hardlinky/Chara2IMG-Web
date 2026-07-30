import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "chara2imgTrackedInputCategories";

async function loadModule() {
  vi.resetModules();
  return import("../../src/client/lib/inputTrackingStorage");
}

describe("inputTrackingStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts empty", async () => {
    const store = await loadModule();
    expect(store.getTrackedCategories()).toEqual([]);
    expect(store.isCategoryTracked("Config")).toBe(false);
  });

  it("toggles a category on and off", async () => {
    const store = await loadModule();

    store.toggleCategoryTracked("Config");
    expect(store.isCategoryTracked("Config")).toBe(true);
    expect(store.getTrackedCategories()).toContain("Config");

    store.toggleCategoryTracked("Config");
    expect(store.isCategoryTracked("Config")).toBe(false);
    expect(store.getTrackedCategories()).not.toContain("Config");
  });

  it("setCategoryTracked is idempotent", async () => {
    const store = await loadModule();

    store.setCategoryTracked("Prompt", true);
    store.setCategoryTracked("Prompt", true);
    expect(store.getTrackedCategories()).toEqual(["Prompt"]);

    store.setCategoryTracked("Prompt", false);
    store.setCategoryTracked("Prompt", false);
    expect(store.getTrackedCategories()).toEqual([]);
  });

  it("persists to localStorage", async () => {
    const store = await loadModule();

    store.setCategoryTracked("Config", true);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")).toEqual(["Config"]);
  });

  it("reads existing localStorage value on first access", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["Sampler"]));
    const store = await loadModule();

    expect(store.getTrackedCategories()).toEqual(["Sampler"]);
    expect(store.isCategoryTracked("Sampler")).toBe(true);
  });

  it("notifies subscribers on change and stops after unsubscribe", async () => {
    const store = await loadModule();
    const listener = vi.fn();
    const unsubscribe = store.subscribeTrackedCategories(listener);

    store.toggleCategoryTracked("A");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.toggleCategoryTracked("B");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed stored data", async () => {
    window.localStorage.setItem(STORAGE_KEY, "not json");
    const store = await loadModule();

    expect(store.getTrackedCategories()).toEqual([]);
  });
});
