import { FormEvent, useState } from "react";
import { runViaProxy, statusViaProxy } from "../../lib/api/runpodProxyClient";
import { extractRunpodImagePreview, type RunpodImagePreview } from "../../lib/runpodOutputImage";

type RunpodProxySmokeProps = {
  apiKey: string;
};

export function RunpodProxySmoke(props: RunpodProxySmokeProps) {
  const [endpointId, setEndpointId] = useState("");
  const [jobId, setJobId] = useState("");
  const [inputJson, setInputJson] = useState('{"prompt":"smoke"}');
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [imagePreview, setImagePreview] = useState<RunpodImagePreview | null>(null);

  async function onRun(event: FormEvent): Promise<void> {
    event.preventDefault();

    setError("");

    try {
      const input = JSON.parse(inputJson) as Record<string, unknown>;
      const response = await runViaProxy({
        endpointId,
        apiKey: props.apiKey,
        input
      });

      setResult(JSON.stringify(response, null, 2));
      setImagePreview(extractRunpodImagePreview(response));
    } catch (runError) {
      setImagePreview(null);
      setError(runError instanceof Error ? runError.message : "Run request failed");
    }
  }

  async function onStatus(): Promise<void> {
    setError("");

    try {
      const response = await statusViaProxy({
        endpointId,
        apiKey: props.apiKey,
        id: jobId
      });

      setResult(JSON.stringify(response, null, 2));
      setImagePreview(extractRunpodImagePreview(response));
    } catch (statusError) {
      setImagePreview(null);
      setError(statusError instanceof Error ? statusError.message : "Status request failed");
    }
  }

  return (
    <section>
      <h2>Runpod Proxy Smoke</h2>
      <p>Run a lightweight run/status proxy check using your current key.</p>

      <form onSubmit={(event) => void onRun(event)}>
        <label htmlFor="endpoint-id">Endpoint ID</label>
        <input
          id="endpoint-id"
          value={endpointId}
          onChange={(event) => setEndpointId(event.target.value)}
          required
        />

        <label htmlFor="job-id">Job ID (for status)</label>
        <input id="job-id" value={jobId} onChange={(event) => setJobId(event.target.value)} />

        <label htmlFor="input-json">Input JSON</label>
        <textarea
          id="input-json"
          value={inputJson}
          onChange={(event) => setInputJson(event.target.value)}
          rows={5}
        />

        <button type="submit">Run Proxy Call</button>
        <button type="button" onClick={() => void onStatus()}>
          Status Proxy Call
        </button>
      </form>

      {error ? <p role="alert">{error}</p> : null}
      {result ? <pre>{result}</pre> : null}
      {imagePreview ? (
        <div>
          <h3>Detected Output Image</h3>
          <p>MIME type: {imagePreview.mimeType}</p>
          <p>Source path: {imagePreview.sourcePath}</p>
          <img alt="Runpod output preview" src={imagePreview.dataUrl} style={{ maxWidth: 512 }} />
        </div>
      ) : null}
    </section>
  );
}
