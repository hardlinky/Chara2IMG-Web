#!/usr/bin/env bash
# Entry point for the Chara2IMG Web pod. Run from the repo root after cloning.
# Keeps the RunPod container start command minimal and stable; app-specific
# steps (build, script placement) live here instead, versioned with the repo.
set -e

npm install
npm run build

NETWORK_MOUNT_DIR="${NETWORK_MOUNT_DIR:-/workspace}"
mkdir -p "$NETWORK_MOUNT_DIR/chara2img/scripts"
cp -f scripts/*.sh "$NETWORK_MOUNT_DIR/chara2img/scripts/"
chmod +x "$NETWORK_MOUNT_DIR/chara2img/scripts/"*.sh

exec npm run start
