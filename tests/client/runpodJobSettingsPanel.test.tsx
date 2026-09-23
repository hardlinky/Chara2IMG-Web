import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { RunpodJobSettingsPanel } from "../../src/client/features/access/RunpodJobSettingsPanel";

function stubSettingsApi(webhookBaseUrl: string | null) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const settings = init?.body
      ? JSON.parse(String(init.body))
      : { useWebhook: false, executionTimeoutSeconds: 0 };
    return new Response(JSON.stringify({ ok: true, settings, webhookBaseUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RunpodJobSettingsPanel", () => {
  it("saves the webhook toggle and explains where RunPod calls back", async () => {
    const fetchMock = stubSettingsApi("https://pod-abc-3000.proxy.runpod.net");
    const view = within(render(<RunpodJobSettingsPanel />).container);

    const toggle = (await view.findByLabelText(/use webhook/i)) as HTMLInputElement;
    await waitFor(() => {
      expect(toggle.disabled).toBe(false);
    });
    expect(view.getByText(/pod-abc-3000\.proxy\.runpod\.net/)).toBeTruthy();

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const [, init] = fetchMock.mock.calls[1] ?? [];
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body)).useWebhook).toBe(true);
  });

  it("disables the toggle when the server is not publicly reachable", async () => {
    stubSettingsApi(null);
    const view = within(render(<RunpodJobSettingsPanel />).container);

    const toggle = (await view.findByLabelText(/use webhook/i)) as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
    expect(view.getByText(/PUBLIC_BASE_URL/)).toBeTruthy();
  });

  it("saves the execution timeout snapped to whole minutes", async () => {
    const fetchMock = stubSettingsApi("https://pod-abc-3000.proxy.runpod.net");
    const view = within(render(<RunpodJobSettingsPanel />).container);

    const timeout = (await view.findByLabelText(/job execution timeout/i)) as HTMLInputElement;
    expect(timeout.step).toBe("60");
    expect(timeout.value).toBe("0");

    fireEvent.change(timeout, { target: { value: "605" } });
    fireEvent.blur(timeout);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const [, init] = fetchMock.mock.calls[1] ?? [];
    expect(JSON.parse(String(init?.body)).executionTimeoutSeconds).toBe(600);
  });
});
