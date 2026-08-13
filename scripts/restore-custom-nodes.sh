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
restore_repo "https://github.com/yolain/ComfyUI-Easy-Use.git" "ComfyUI-Easy-Use"
restore_repo "https://github.com/kijai/ComfyUI-KJNodes.git" "ComfyUI-KJNodes"
restore_repo "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git" "ComfyUI-Impact-Pack"
restore_repo "https://github.com/ltdrdata/ComfyUI-Impact-Subpack.git" "ComfyUI-Impact-Subpack"
restore_repo "https://github.com/alexopus/ComfyUI-Image-Saver.git" "ComfyUI-Image-Saver"
restore_repo "https://github.com/BlenderNeko/ComfyUI_ADV_CLIP_emb.git" "ComfyUI_ADV_CLIP_emb"
restore_repo "https://github.com/rgthree/rgthree-comfy.git" "rgthree-comfy"
restore_repo "https://github.com/Miosp/ComfyUI-FBCNN.git" "ComfyUI-FBCNN"
restore_repo "https://github.com/aimoviestudio/comfyui-promptbuilder.git" "comfyui-promptbuilder"

echo
echo "Custom nodes restored to: $SHARED_ROOT"
ls -1 "$SHARED_ROOT"
