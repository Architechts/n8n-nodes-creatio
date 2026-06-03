# B-readiness Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize the toolchain — ESLint 9 flat config with `@n8n/eslint-plugin-community-nodes`, Node ≥22, and GitHub Actions CI + provenance publishing (OIDC) — while keeping the gulp+tsc build and the BSL-1.1 license, with no change to node runtime behavior.

**Architecture:** Replace the ESLint 8 `.eslintrc.*` setup with a single hand-composed `eslint.config.mjs` (flat config) that layers the n8n community-node rule set and the existing `eslint-plugin-n8n-nodes-base` rules over `typescript-eslint`. Bump the engine and dev dependencies. Add two GitHub Actions workflows: CI (lint/build/test) and a tag-triggered provenanced publish via an npm OIDC trusted publisher.

**Tech Stack:** ESLint 9 (flat config), `typescript-eslint`, `@n8n/eslint-plugin-community-nodes` 0.17.0, `eslint-plugin-n8n-nodes-base`, gulp + tsc build (unchanged), Jest (unchanged), GitHub Actions, npm provenance.

**Reference spec:** `docs/superpowers/specs/2026-06-03-b-readiness-tooling-design.md`

**Pre-verified during planning** (in a throwaway `/tmp` project against the real repo source): the exact flat config below loads without error and produces exactly the findings the triage in Task 2 addresses. Tool versions confirmed installable: `eslint@9.29.0`, `typescript-eslint@8.60.1`, `@n8n/eslint-plugin-community-nodes@0.17.0`, `eslint-plugin-n8n-nodes-base@1.16.6`.

---

## File Structure

| File | Responsibility |
|---|---|
| `eslint.config.mjs` | **New.** ESLint 9 flat config: community-node rules + n8n-nodes-base rules + typescript-eslint, scoped to `nodes/**` and `credentials/**`, with minimal vetted rule overrides. |
| `.eslintrc.js`, `.eslintrc.prepublish.js` | **Delete.** Superseded by flat config. |
| `package.json` | devDeps (ESLint 9 stack), `engines.node`, scripts (`lint`/`lint:fix`/`prepublishOnly`), `version` → 0.2.1. |
| `package-lock.json` | Regenerated from the dependency changes. |
| `nodes/Creatio/Creatio.node.ts`, `nodes/Creatio/GenericFunctions.ts` | Two inline `eslint-disable-next-line` comments on legitimate re-throws of already-wrapped errors. |
| `.github/workflows/ci.yml` | **New.** Lint/build/test on PR + push to `main` (Node 22). |
| `.github/workflows/publish.yml` | **New.** Provenanced `npm publish` on tag push, via OIDC trusted publisher. |
| `README.md` | **New "Releasing" section** + one-time npm Trusted Publisher setup. |

**Task order:** Task 1 (lint migration) must come before Task 2 (version/engine bumps touch the same `package.json`) only loosely; they are sequential to keep `package.json` edits clean. Tasks 3–5 (CI/docs) are independent of 1–2. Task 6 is final verification. Each task ends green.

---

## Task 1: Migrate to ESLint 9 flat config (with community-node rules)

Replace the ESLint 8 setup with a flat config and resolve the (small, known) set of findings so `npm run lint` exits clean.

**Files:**
- Create: `eslint.config.mjs`
- Delete: `.eslintrc.js`, `.eslintrc.prepublish.js`
- Modify: `package.json` (devDeps + lint scripts), `nodes/Creatio/Creatio.node.ts`, `nodes/Creatio/GenericFunctions.ts`
- Regenerate: `package-lock.json`

- [ ] **Step 1: Update ESLint-related devDependencies and lint scripts in `package.json`**

In `devDependencies`: remove `@typescript-eslint/parser`; add/update these (leave `jest`, `ts-jest`, `@types/jest`, `gulp`, `n8n-workflow`, `prettier`, `typescript` untouched in this task):

```json
    "@n8n/eslint-plugin-community-nodes": "0.17.0",
    "eslint": "^9.29.0",
    "eslint-plugin-n8n-nodes-base": "^1.16.6",
    "typescript-eslint": "^8.60.0",
```

In `scripts`, replace the `lint`, `lintfix`, and `prepublishOnly` entries with:

```json
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "prepublishOnly": "npm run build && npm run lint",
```

(Remove the old `lintfix` key if present; the new key is `lint:fix`.)

- [ ] **Step 2: Install to regenerate the lockfile**

Run: `npm install`
Expected: installs ESLint 9 + plugins, updates `package-lock.json`, no peer-dependency errors that abort the install.

- [ ] **Step 3: Delete the old ESLint config files**

```bash
git rm .eslintrc.js .eslintrc.prepublish.js
```

- [ ] **Step 4: Create `eslint.config.mjs`**

```javascript
import tseslint from 'typescript-eslint';
import community from '@n8n/eslint-plugin-community-nodes';
import n8nNodesBase from 'eslint-plugin-n8n-nodes-base';

export default tseslint.config(
	{ ignores: ['dist/**', 'node_modules/**', 'test/**', '**/*.js', '**/*.mjs'] },
	...tseslint.configs.recommended,
	{
		// n8n community-node rule set: deprecations, structure, AI-readiness, package.json checks.
		files: ['nodes/**/*.ts', 'credentials/**/*.ts'],
		plugins: community.configs.recommended.plugins,
		rules: community.configs.recommended.rules,
	},
	{
		// Legacy n8n-nodes-base node rules (granular description/param style checks).
		files: ['nodes/**/*.ts'],
		plugins: { 'n8n-nodes-base': n8nNodesBase },
		rules: n8nNodesBase.configs.nodes.rules,
	},
	{
		// Legacy n8n-nodes-base credential rules.
		files: ['credentials/**/*.ts'],
		plugins: { 'n8n-nodes-base': n8nNodesBase },
		rules: {
			...n8nNodesBase.configs.credentials.rules,
			// Preserve the project's prior override: this rule false-positives on the
			// correctly-cased `documentationUrl` field. Disabled in the old .eslintrc too.
			'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
		},
	},
	{
		// Creatio's OData responses and n8n error objects are dynamically shaped;
		// `any` is intentional and was accepted in code review.
		files: ['nodes/**/*.ts', 'credentials/**/*.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},
);
```

- [ ] **Step 5: Run lint to observe the remaining known findings**

Run: `npm run lint`
Expected: exactly **2 errors**, both `@n8n/community-nodes/require-node-api-error`, at `nodes/Creatio/GenericFunctions.ts` (the `throw error;` in the `creatioApiRequest` catch) and `nodes/Creatio/Creatio.node.ts` (the final `throw error;` in the `execute` catch), plus **1 warning** `@n8n/community-nodes/resource-operation-pattern`. (The `no-explicit-any` and `cred-...-miscased` findings are now silenced by Step 4.)

- [ ] **Step 6: Inline-disable the two legitimate re-throws**

These two `throw error;` statements re-throw errors that are **already** `NodeApiError`/`NodeOperationError` instances, so the rule is a false positive there. Add a justifying disable comment immediately above each.

In `nodes/Creatio/GenericFunctions.ts`, the catch block in `creatioApiRequest` currently has:
```typescript
		if (error instanceof NodeApiError) {
			throw error;
		}
```
Change to:
```typescript
		if (error instanceof NodeApiError) {
			// eslint-disable-next-line @n8n/community-nodes/require-node-api-error -- already a NodeApiError; re-throwing unchanged
			throw error;
		}
```

In `nodes/Creatio/Creatio.node.ts`, the per-item catch in `execute` currently ends with:
```typescript
				throw error;
			}
```
Change the `throw error;` line to:
```typescript
				// eslint-disable-next-line @n8n/community-nodes/require-node-api-error -- error originates from the transport already wrapped as NodeApiError/NodeOperationError
				throw error;
			}
```

- [ ] **Step 7: Run lint, build, and tests to confirm green**

Run: `npm run lint && npm run build && npm test`
Expected: lint exits 0 (0 errors; the single `resource-operation-pattern` warning is acceptable — our node is operation-only by design); build succeeds; 19/19 tests pass.

- [ ] **Step 8: Commit**

```bash
git add eslint.config.mjs package.json package-lock.json nodes/Creatio/Creatio.node.ts nodes/Creatio/GenericFunctions.ts
git rm --cached .eslintrc.js .eslintrc.prepublish.js 2>/dev/null; true
git commit -m "build: migrate to ESLint 9 flat config with n8n community-node rules"
```

(The `git rm` in Step 3 already staged the deletions; the commit includes them.)

---

## Task 2: Bump Node engine and remaining dependency versions

**Files:**
- Modify: `package.json` (`engines`, `version`, `prettier`, `typescript`)
- Regenerate: `package-lock.json`

- [ ] **Step 1: Update `engines`, `version`, and bump prettier/typescript in `package.json`**

Replace the `engines` block:
```json
  "engines": {
    "node": ">=22"
  },
```
(Removes the stray `pnpm` constraint — the repo uses npm via `package-lock.json`.)

Change `version`:
```json
  "version": "0.2.1",
```

In `devDependencies`, bump these two:
```json
    "prettier": "^3.6.2",
    "typescript": "^5.9.3",
```

- [ ] **Step 2: Reinstall to refresh the lockfile**

Run: `npm install`
Expected: lockfile updates; no errors.

- [ ] **Step 3: Verify build and tests still pass on the bumped toolchain**

Run: `npm run build && npm test && npm run lint`
Expected: build succeeds; 19/19 tests pass; lint clean (0 errors).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: require Node >=22, bump prettier/typescript, version 0.2.1"
```

---

## Task 3: Add the CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test
```

- [ ] **Step 2: Validate the workflow YAML**

Run: `if command -v actionlint >/dev/null; then actionlint .github/workflows/ci.yml; else npx --yes js-yaml .github/workflows/ci.yml >/dev/null && echo "YAML valid (actionlint not installed)"; fi`
Expected: `actionlint` reports no issues if installed (and a non-zero exit would surface a real problem); otherwise the YAML parses without error and prints `YAML valid (actionlint not installed)`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint/build/test workflow on Node 22"
```

---

## Task 4: Add the provenanced publish workflow

**Files:**
- Create: `.github/workflows/publish.yml`

- [ ] **Step 1: Create `.github/workflows/publish.yml`**

Triggered by pushing a `v`-prefixed semver tag (matches `npm version`'s default tag format, used in the release flow in Task 5). Uses npm OIDC trusted publishing — **no `NPM_TOKEN` secret**.

```yaml
name: Publish

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm publish --provenance --access public
```

- [ ] **Step 2: Validate the workflow YAML**

Run: `if command -v actionlint >/dev/null; then actionlint .github/workflows/publish.yml; else npx --yes js-yaml .github/workflows/publish.yml >/dev/null && echo "YAML valid (actionlint not installed)"; fi`
Expected: `actionlint` reports no issues if installed; otherwise prints `YAML valid (actionlint not installed)`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: add provenanced npm publish on tag via OIDC trusted publisher"
```

---

## Task 5: Document the release flow and Trusted Publisher setup

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append a Releasing section to `README.md`**

Add this section near the end of `README.md` (before the `## License` section if present, otherwise at the end):

```markdown
## Releasing

Releases are published to npm automatically by GitHub Actions with build [provenance](https://docs.npmjs.com/generating-provenance-statements). No npm token is stored in the repository — publishing uses npm's OIDC **Trusted Publisher** mechanism.

### One-time setup (maintainer)

1. On npmjs.com, open the `n8n-nodes-creatio` package → **Settings** → **Trusted Publishers**.
2. Add a **GitHub Actions** publisher pointing at this repository and the workflow file `.github/workflows/publish.yml` (branch/environment left blank).
3. Ensure GitHub Actions is enabled for the repository.

### Cutting a release

```bash
npm version patch        # or: minor / major — bumps package.json, commits, creates a vX.Y.Z tag
git push --follow-tags   # pushes the commit and the tag
```

Pushing the `vX.Y.Z` tag triggers `.github/workflows/publish.yml`, which builds and runs `npm publish --provenance --access public`. The published package includes a signed provenance statement.

> Note: the publish workflow triggers on tags matching `v*.*.*`, which is the tag format `npm version` creates by default. If you change `npm version`'s tag prefix, update the trigger in `publish.yml` to match.
```

- [ ] **Step 2: Verify the section is present**

Run: `grep -n "Trusted Publisher\|npm version patch\|--follow-tags" README.md`
Expected: all three found.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document provenanced release flow and Trusted Publisher setup"
```

---

## Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Clean build, lint, and test from scratch**

Run: `rm -rf dist && npm run build && npm run lint && npm test`
Expected: build succeeds; lint exits 0 (0 errors, at most the one `resource-operation-pattern` warning); 19/19 tests pass.

- [ ] **Step 2: Confirm the published artifacts still include the codex and both credentials**

Run: `ls dist/nodes/Creatio/Creatio.node.js dist/nodes/Creatio/Creatio.node.json dist/nodes/Creatio/Creatio.svg dist/credentials/CreatioApi.credentials.js dist/credentials/CreatioOAuth2Api.credentials.js dist/credentials/Creatio.svg`
Expected: every file exists (confirms the gulp build still ships the codex the n8n CLI would have dropped).

- [ ] **Step 3: Confirm no ESLint 8 config remnants and the engine is set**

Run: `ls .eslintrc.js .eslintrc.prepublish.js 2>&1; node -p "require('./package.json').engines.node"; node -p "require('./package.json').version"`
Expected: both `.eslintrc.*` files are "No such file or directory"; engine prints `>=22`; version prints `0.2.1`.

- [ ] **Step 4: Manual verification (maintainer — cannot run locally)**

Document that the following require GitHub/npm and are performed by the maintainer:
1. Push a branch / open a PR → confirm the **CI** workflow runs and passes (lint/build/test on Node 22).
2. Configure the npm **Trusted Publisher** (per README), then cut one release (`npm version patch` → `git push --follow-tags`) → confirm `publish.yml` runs and the package appears on npm **with a provenance badge**.

- [ ] **Step 5: Final summary commit (optional)**

```bash
git commit --allow-empty -m "chore: B-readiness tooling complete"
```

---

## Notes for the implementer

- **Do NOT adopt `@n8n/node-cli`.** Its `build` is bare `tsc` + icon copy and does **not** copy `*.node.json` codex files; our gulp build does. Keep `build: "tsc && gulp build:icons"` exactly as-is.
- **License stays BSL-1.1.** There is no lint rule that checks license; do not change it.
- **`package.json` is not linted by this flat config** (the community plugin's package.json rules need a JSON parser/processor we deliberately did not wire in). Its invariants are already satisfied and must be maintained manually: name starts with `n8n-nodes-`, keyword `n8n-community-node-package` present, `dependencies` empty, `peerDependencies` exactly `{ "n8n-workflow": "*" }`, `n8n.nodes`/`n8n.credentials` entries start with `dist/`.
- The single `resource-operation-pattern` warning is expected and acceptable — this node is intentionally operation-only (OData verbs), not resource/operation structured. Do not refactor to silence it.
- If `npm install` surfaces a newer `@n8n/eslint-plugin-community-nodes` with additional rules (it releases weekly), keep the pinned `0.17.0` for reproducibility; bumping it is a separate, deliberate change.
