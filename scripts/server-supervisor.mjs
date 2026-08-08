import { spawn } from "node:child_process";

const RESTART_EXIT_CODE = 75;
const serverArgs = process.argv.length > 2
  ? process.argv.slice(2)
  : ["--import", "tsx", "src/server/index.ts"];
let child = null;
let stopping = false;

function startServer() {
  child = spawn(process.execPath, serverArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });

  child.once("exit", (code, signal) => {
    child = null;
    if (!stopping && code === RESTART_EXIT_CODE) {
      console.log("[SUPERVISOR] Restarting updated server...");
      startServer();
      return;
    }

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

function stop(signal) {
  stopping = true;
  if (child) {
    child.kill(signal);
    return;
  }
  process.exit(0);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

startServer();