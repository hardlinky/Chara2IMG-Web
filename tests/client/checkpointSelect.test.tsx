import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { CheckpointSelect } from "../../src/client/features/inputs/DynamicInputEditor";

describe("CheckpointSelect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replaces a placeholder with the sole available checkpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      checkpoints: ["waiIllustriousSDXL_v160.safetensors"]
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const onChange = vi.fn();

    render(<CheckpointSelect value="None" onChange={onChange} />);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("waiIllustriousSDXL_v160.safetensors");
    });
  });
});