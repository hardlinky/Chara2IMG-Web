import { execFileSync } from "node:child_process";

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function parseVersion(value) {
  const match = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(value);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function readVersionFromGit(ref) {
  return JSON.parse(runGit(["show", `${ref}:package.json`])).version;
}

function readLockVersionFromGit(ref) {
  return JSON.parse(runGit(["show", `${ref}:package-lock.json`])).version;
}

try {
  runGit(["rev-parse", "--is-inside-work-tree"]);
} catch {
  process.exit(0);
}

let headVersion;
let parentVersion;

try {
  headVersion = readVersionFromGit("HEAD");
  parentVersion = readVersionFromGit("HEAD^");
} catch {
  process.exit(0);
}

const head = parseVersion(headVersion);
const parent = parseVersion(parentVersion);
const lockVersion = parseVersion(readLockVersionFromGit("HEAD"));

if (!head || !parent || !lockVersion) {
  process.stderr.write("Unable to verify version bump before push.\n");
  process.exit(1);
}

const expectedPatch = parent.patch + 1;
const isPatchBump =
  head.major === parent.major &&
  head.minor === parent.minor &&
  head.patch === expectedPatch;
const isMinorBump =
  head.major === parent.major &&
  head.minor === parent.minor + 1 &&
  head.patch === 0;
const isMajorBump =
  head.major === parent.major + 1 &&
  head.minor === 0 &&
  head.patch === 0;
const versionMatches =
  (isPatchBump || isMinorBump || isMajorBump) &&
  lockVersion.major === head.major &&
  lockVersion.minor === head.minor &&
  lockVersion.patch === head.patch;

if (!versionMatches) {
  process.stderr.write(
    [
      "Push blocked: the tip commit must contain one sequential semantic version bump.",
      "Use a patch bump, or reset to .0 for an explicit next minor/major release, and keep package-lock.json aligned."
    ].join("\n") + "\n"
  );
  process.exit(1);
}