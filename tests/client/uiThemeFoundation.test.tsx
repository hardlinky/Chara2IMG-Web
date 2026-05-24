import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

function readClientFile(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, "../../src/client", relativePath), "utf8");
}

describe("ui theme foundation", () => {
  it("wires global stylesheet import through main entry", () => {
    const mainSource = readClientFile("main.tsx");

    expect(mainSource).toContain('import "./styles/index.css"');
  });

  it("defines required semantic and interaction contracts", () => {
    const tokenSource = readClientFile("styles/tokens.css");
    const componentSource = readClientFile("styles/components.css");

    expect(tokenSource).toContain("--color-accent-primary");
    expect(tokenSource).toContain("--color-danger-bg");

    expect(componentSource).toContain(".btn-primary");
    expect(componentSource).toContain(".btn-secondary");
    expect(componentSource).toContain(".btn-destructive");
    expect(componentSource).toContain(":focus-visible");
    expect(componentSource).toContain("prefers-reduced-motion");
    expect(componentSource).toContain(".input-invalid");
  });
});
