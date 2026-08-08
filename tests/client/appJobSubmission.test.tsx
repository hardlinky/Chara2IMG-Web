import { describe, expect, it, vi } from "vitest";
import { omitImageDraftValues, submitRunAndPersistRecentJob } from "../../src/client/lib/jobSubmission";

describe("app job submission", () => {
  it("omits duplicate image values from submission metadata", () => {
    expect(omitImageDraftValues({
      prompt: "hello",
      reference: { dataUrl: "data:image/png;base64,abc" }
    })).toEqual({ prompt: "hello" });
  });

  it("calls submitRun and returns the RunpodRunResponse", async () => {
    const submitRun = vi.fn(async () => ({
      id: "job-123",
      status: "IN_QUEUE",
      output: null
    }));

    const response = await submitRunAndPersistRecentJob({
      endpointId: "endpoint-1",
      apiKey: "key",
      submittedInput: { workflow: { prompt: "hello", image: "data:image/png;base64,abc" } },
      snapshot: {
        templateFingerprint: "fp-1",
        workflowFileName: "workflow-a.json",
        draftValues: { prompt: "hello", reference: { dataUrl: "data:image/png;base64,abc" } },
        submittedInput: { workflow: { prompt: "hello", image: "data:image/png;base64,abc" } }
      },
      dependencies: {
        submitRun
      }
    });

    expect(submitRun).toHaveBeenCalledTimes(1);
    expect(submitRun).toHaveBeenCalledWith({
      endpointId: "endpoint-1",
      apiKey: "key",
      input: { workflow: { prompt: "hello", image: "data:image/png;base64,abc" } },
      meta: {
        workflowFileName: "workflow-a.json",
        draftValues: { prompt: "hello" },
        templateFingerprint: "fp-1"
      }
    });
    expect(response).toMatchObject({ id: "job-123", status: "IN_QUEUE" });
  });

  it("does not create a recent-job record when submission fails", async () => {
    const submitRun = vi.fn(async () => {
      throw new Error("submit failed");
    });

    await expect(
      submitRunAndPersistRecentJob({
        endpointId: "endpoint-1",
        apiKey: "key",
        submittedInput: { workflow: { prompt: "hello" } },
        snapshot: {
          templateFingerprint: "fp-1",
          workflowFileName: "workflow-a.json",
          draftValues: { prompt: "hello" },
          submittedInput: { workflow: { prompt: "hello" } }
        },
        dependencies: {
          submitRun
        }
      })
    ).rejects.toThrow("submit failed");
  });

  it("passes the endpoint and apiKey to the submitRun function", async () => {
    const submitRun = vi.fn(async () => ({ id: "job-xyz", status: "IN_QUEUE", output: null }));

    await submitRunAndPersistRecentJob({
      endpointId: "ep-42",
      apiKey: "secret-key",
      submittedInput: { workflow: {} },
      snapshot: {
        templateFingerprint: "fp-2",
        draftValues: {},
        submittedInput: { workflow: {} }
      },
      dependencies: { submitRun }
    });

    expect(submitRun).toHaveBeenCalledWith(
      expect.objectContaining({ endpointId: "ep-42", apiKey: "secret-key" })
    );
  });
});
