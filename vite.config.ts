import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version?: string;
};

const appVersion = packageJson.version ?? "0.0.0";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
});
