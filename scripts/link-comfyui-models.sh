#!/usr/bin/env bash
set -euo pipefail

SHARED_ROOT="${SHARED_ROOT:-/workspace/models}"
COMFY_MODELS_ROOT="${COMFY_MODELS_ROOT:-${COMFYUI_ROOT:-/workspace/runpod-slim/ComfyUI/models}}"

if [[ ! -d "$SHARED_ROOT" ]]; then
  echo "Shared models root does not exist: $SHARED_ROOT"
  echo "Create it first or set SHARED_ROOT to the correct mount path."
  exit 1
fi

mkdir -p "$COMFY_MODELS_ROOT"

link_bucket() {
  local bucket="$1"
  local target="$SHARED_ROOT/$bucket"
  local link="$COMFY_MODELS_ROOT/$bucket"

  mkdir -p "$(dirname "$link")"
  mkdir -p "$target"

  if [[ -L "$link" ]]; then
    echo "Already linked: $link -> $(readlink "$link")"
    return
  fi

  if [[ -d "$link" ]]; then
    local backup="${link}.bak.$(date +%s)"
    echo "Replacing directory with symlink: $link -> $target"
    mv "$link" "$backup"

    if [[ -d "$backup" && -n "$(find "$backup" -mindepth 1 -maxdepth 1 2>/dev/null)" ]]; then
      echo "Merging backup contents into shared target: $backup -> $target"
      cp -a "$backup/." "$target/"
    fi
  fi

  ln -s "$target" "$link"
  echo "Linked: $link -> $target"
}

for bucket in checkpoints loras vae upscale_models; do
  link_bucket "$bucket"
done

for bucket in ultralytics/segm ultralytics/bbox; do
  link_bucket "$bucket"
done

echo
echo "ComfyUI model links ready:"
ls -l "$COMFY_MODELS_ROOT"
