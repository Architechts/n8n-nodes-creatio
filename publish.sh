#!/usr/bin/env bash
#
# publish.sh — validate and publish n8n-nodes-creatio to npm.
#
# Runs the full pre-flight gate (clean build, tests, prepublish lint),
# strips build artifacts from the tarball, shows what will be published,
# then publishes. Aborts on the first failure.
#
# Usage:
#   ./publish.sh                 # validate + publish (prompts for 2FA code)
#   ./publish.sh --otp=123456    # validate + publish with a 2FA one-time code
#   ./publish.sh --dry-run       # validate + pack preview, but do NOT publish

set -euo pipefail

cd "$(dirname "$0")"

DRY_RUN=false
OTP=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --otp=*)   OTP="${arg#--otp=}" ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mx %s\033[0m\n' "$1" >&2; exit 1; }

# 1. Must be authenticated before we do any work.
step "Checking npm authentication"
if ! NPM_USER=$(npm whoami 2>/dev/null); then
  fail "Not logged in to npm. Run 'npm login' first, then re-run this script."
fi
echo "Logged in as: $NPM_USER"

# 2. Version sanity — don't try to re-publish an existing version.
PKG_VERSION=$(node -p "require('./package.json').version")
step "Publishing version $PKG_VERSION"
if npm view "n8n-nodes-creatio@$PKG_VERSION" version >/dev/null 2>&1; then
  fail "Version $PKG_VERSION is already on npm. Bump the version in package.json first."
fi

# 3. Clean build from scratch so dist reflects current source.
#    Must also drop the incremental state file, or tsc sees "nothing changed"
#    after dist is deleted and emits no JS.
step "Clean build"
rm -rf dist .tsbuildinfo
npm run build

# 4. Tests must pass.
step "Running tests"
npm test

# 5. Same lint the registry enforces via prepublishOnly.
step "Prepublish lint"
npm run lint -c .eslintrc.prepublish.js nodes credentials package.json

# 6. Drop the TypeScript incremental-build artifact from the package.
step "Stripping build artifacts from dist"
rm -f dist/tsconfig.tsbuildinfo

# 7. Show exactly what will ship.
step "Tarball preview"
npm pack --dry-run

# 8. Publish (or stop here on --dry-run).
if $DRY_RUN; then
  step "Dry run complete — nothing published"
  exit 0
fi

step "Publishing to npm"
if [[ -n "$OTP" ]]; then
  npm publish --otp="$OTP"
else
  # No OTP passed; npm will prompt interactively if 2FA is enabled.
  npm publish
fi

step "Published n8n-nodes-creatio@$PKG_VERSION"
