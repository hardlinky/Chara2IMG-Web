import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

function runGit(args) {
  execFileSync("git", args, { stdio: "ignore" });
}

try {
  if (!existsSync(".git")) {
    process.exit(0);
  }

  runGit(["rev-parse", "--is-inside-work-tree"]);
  runGit(["config", "--local", "core.hooksPath", ".githooks"]);
} catch {
  process.exit(0);
}