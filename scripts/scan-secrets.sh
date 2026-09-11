#!/bin/sh

set -eu

mode=${1:-full}

case "$mode" in
  full|--staged) ;;
  *)
    echo "usage: $0 [--staged]" >&2
    exit 2
    ;;
esac

# High-signal credential formats plus non-empty secret-like environment
# assignments. Findings print file names only so credentials never reach logs.
secret_pattern='(-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|(AKIA|ASIA)[A-Z0-9]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[0-9A-Za-z]{36,255}|github_pat_[0-9A-Za-z_]{20,255}|sk-(proj-)?[0-9A-Za-z_-]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|npm_[0-9A-Za-z]{36}|glpat-[0-9A-Za-z_-]{20,}|hf_[0-9A-Za-z]{20,}|https?://[^/@[:space:]:]+:[^/@[:space:]]+@[^[:space:]]+|eyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}|[A-Z0-9_]*(API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY)[[:space:]]*=[[:space:]]*"?[0-9A-Za-z/+_.=-]{16,})'

scan_tree() {
  if [ "$mode" = "--staged" ]; then
    git grep --cached -Il -E "$secret_pattern" -- . \
      ':(exclude)scripts/scan-secrets.sh' || true
  else
    git grep -Il -E "$secret_pattern" -- . \
      ':(exclude)scripts/scan-secrets.sh' || true
  fi
}

matches=$(scan_tree)
if [ -n "$matches" ]; then
  echo "secret scan: possible credential material found in:" >&2
  printf '%s\n' "$matches" >&2
  echo "secret scan: values are redacted; remove or rotate confirmed secrets" >&2
  exit 1
fi

if [ "$mode" = "full" ] && git rev-parse --verify HEAD >/dev/null 2>&1; then
  if git log -p --all -- . ':(exclude)scripts/scan-secrets.sh' | \
    grep -E -q "$secret_pattern"; then
    echo "secret scan: possible credential material exists in Git history (redacted)" >&2
    echo "secret scan: inspect and rotate it before publishing the repository" >&2
    exit 1
  fi
fi

echo "secret scan: no high-signal credentials found"
