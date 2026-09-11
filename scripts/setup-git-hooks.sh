#!/bin/sh

set -eu

repo_root=$(git rev-parse --show-toplevel)
hooks_dir="$repo_root/.githooks"

if [ ! -d "$hooks_dir" ]; then
  echo "setup-git-hooks: missing hooks directory: $hooks_dir" >&2
  exit 1
fi

git -C "$repo_root" config core.hooksPath .githooks

echo "Git hooks configured: $hooks_dir"
