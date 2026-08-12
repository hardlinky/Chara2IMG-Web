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

for bucket in checkpoints loras vae upscale_models; do
  mkdir -p "$SHARED_ROOT/$bucket"
  target="$SHARED_ROOT/$bucket"
  link="$COMFY_MODELS_ROOT/$bucket"

  if [[ -L "$link" || -e "$link" ]]; then
    echo "Keeping existing: $link"
  else
    ln -s "$target" "$link"
    echo "Linked: $link -> $target"
  fi
done

for bucket in ultralytics/segm ultralytics/bbox; do
  mkdir -p "$SHARED_ROOT/$bucket"
  target="$SHARED_ROOT/$bucket"
  link="$COMFY_MODELS_ROOT/$bucket"

  mkdir -p "$(dirname "$link")"

  if [[ -L "$link" || -e "$link" ]]; then
    echo "Keeping existing: $link"
  else
    ln -s "$target" "$link"
    echo "Linked: $link -> $target"
  fi
done

echo
echo "ComfyUI model links ready:"
ls -l "$COMFY_MODELS_ROOT"
