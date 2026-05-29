import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  }).trim();
}

function readVersion(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8")).version;
}

try {
  runGit(["rev-parse", "--is-inside-work-tree"]);
} catch {
  process.exit(0);
}

let headVersion = null;

try {
  headVersion = JSON.parse(runGit(["show", "HEAD:package.json"])).version;
} catch {
  headVersion = null;
}

const currentVersion = readVersion("package.json");

if (headVersion && currentVersion !== headVersion) {
  process.exit(0);
}

if (process.platform === "win32") {
  execFileSync("cmd.exe", ["/d", "/s", "/c", "npm version patch --no-git-tag-version"], {
    stdio: "inherit"
  });
} else {
  execFileSync("npm", ["version", "patch", "--no-git-tag-version"], {
    stdio: "inherit"
  });
}

execFileSync("git", ["add", "package.json", "package-lock.json"], {
  stdio: "inherit"
});