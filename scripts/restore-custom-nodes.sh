#!/usr/bin/env bash
set -euo pipefail

SHARED_ROOT="${NETWORK_CUSTOM_NODES_ROOT:-${SHARED_ROOT:-/workspace/custom_nodes}}"

if [[ ! -d "$SHARED_ROOT" ]]; then
  echo "Shared custom nodes root does not exist: $SHARED_ROOT"
  echo "Create it first or set NETWORK_CUSTOM_NODES_ROOT (or SHARED_ROOT) to the correct mount path."
  exit 1
fi

mkdir -p "$SHARED_ROOT"

restore_repo() {
  local repo_url="$1"
  local repo_name="$2"
  local target="$SHARED_ROOT/$repo_name"

  if [[ -d "$target/.git" || -d "$target" ]]; then
    echo "Already present: $target"
    return
  fi

  echo "Cloning custom node: $repo_url -> $target"
  git clone --depth 1 "$repo_url" "$target"
}

restore_repo "https://github.com/Smirnov75/ComfyUI-mxToolkit.git" "ComfyUI-mxToolkit"
restore_repo "https://github.com/kijai/ComfyUI-KJNodes.git" "ComfyUI-KJNodes"
restore_repo "https://github.com/ssitu/ComfyUI_UltimateSDUpscale.git" "ComfyUI_UltimateSDUpscale"

echo
echo "Custom nodes restored to: $SHARED_ROOT"
ls -1 "$SHARED_ROOT"
