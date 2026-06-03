# B-readiness Tooling Modernization — Design Spec

**Date:** 2026-06-03
**Status:** Approved for planning
**Scope:** Adopt n8n's modern community-node *quality + publishing* tooling (ESLint 9 + `@n8n/eslint-plugin-community-nodes`, Node 22, GitHub Actions CI, provenance publishing) **without** adopting `@n8n/node-cli` and **keeping the BSL-1.1 license**. The node is intentionally NOT pursuing the n8n "verified" listing.

**Predecessor:** `docs/superpowers/specs/2026-06-02-creatio-modernization-design.md` (OAuth2 + transport + friendly errors, already merged at v0.2.0). This spec implements the deferred B-readiness items from that spec's §8.

---

## 1. Goals & non-goals

**Goals**
1. Lint with **ESLint 9 (flat config)** + **`@n8n/eslint-plugin-community-nodes`** — the rule set that encodes n8n's deprecation/quality expectations.
2. Bump the toolchain: **Node ≥22**, ESLint 9, `typescript-eslint`, current prettier/TypeScript.
3. Add **GitHub Actions**: a CI workflow (lint/build/test) and a **provenance** publish workflow using an **OIDC trusted publisher** (no stored npm token).
4. Keep everything green: build still ships the codex, all tests pass.

**Non-goals (explicitly out of scope)**
- Adopting `@n8n/node-cli` (`n8n-node build/dev/lint/release`). Its `build` is bare `tsc` + icon copy, **does not copy `*.node.json` codex files**, and offers no bundler — it would regress our codex shipping for no gain.
- Changing the license from **BSL-1.1**. There is **no ESLint rule** that checks license; BSL-1.1 passes the linter. MIT is only a *verification-program* policy, which we are not pursuing.
- Submitting to / qualifying for the n8n **verified** listing or running `@n8n/scan-community-package` (the verification gatekeeper).
- Any change to node runtime behavior or the public node/credential interface.

---

## 2. Key facts driving the design (from research, 2026-06-03)

- **No license lint rule exists** in `@n8n/eslint-plugin-community-nodes` (verified by source grep). BSL-1.1 is fine.
- **`n8n-node build` does not copy `*.node.json`** (only `*.png/*.svg` and `__schema__/**/*.json`). Our gulp build copies `*.{png,svg,json}` including `nodes/Creatio/Creatio.node.json`. Therefore we **keep gulp+tsc**.
- **Provenance is license-independent** and does **not** require `@n8n/node-cli` — it is a plain npm (`--provenance`) + GitHub OIDC feature. For an unverified node it is best-practice, not strictly required, but cheap and worth doing.
- The community plugin is **ESLint 9 flat-config only**, exposes `recommended` and `recommendedWithoutN8nCloudSupport` configs, and is pre-1.0 with weekly releases → **pin an exact version**, do not use `"*"`.
- The CLI's `n8n.strict` byte-identical-config check only applies to the `n8n-node lint` wrapper. We run `eslint .` directly, so strict mode is irrelevant and we may customize our config freely.

---

## 3. Lint setup

Replace the ESLint 8 `.eslintrc.*` setup with a single ESLint 9 flat config, hand-composed (no `@n8n/node-cli` dependency).

**`eslint.config.mjs`** composes:
- `@n8n/eslint-plugin-community-nodes` `recommended` config — applied to **`nodes/**/*.ts`** and **`credentials/**/*.ts`** only.
- `typescript-eslint` recommended (replaces the old `@typescript-eslint/parser` setup).
- Existing `eslint-plugin-n8n-nodes-base` rules retained (the community config also layers these; keep our prior coverage).
- **Ignores:** `dist/**`, `node_modules/**`, and `test/**` (tests are not node source; the community-node rules should not run on them).
- Any rule that genuinely does not fit a single-resource OData node may be downgraded/disabled **with an inline comment justifying it**. Default posture: fix real findings rather than silence them.

**Files removed:** `.eslintrc.js` (if present), `.eslintrc.prepublish.js`.

**`package.json` script changes:**
- `lint`: `eslint .`
- `lint:fix`: `eslint . --fix`
- `prepublishOnly`: `npm run build && npm run lint` (drops the `-c .eslintrc.prepublish.js` invocation).
- `format`: unchanged (prettier).

**Expected findings & handling:** the prior modernization already satisfies `require-continue-on-fail`, `missing-paired-item`, `node-operation-error-itemindex`, `require-node-api-error`, `require-node-description-fields`, `credential-test-required`, `valid-peer-dependencies`, `no-runtime-dependencies`, `n8n-object-validation`. Likely remaining are low-severity: `options-sorted-alphabetically` (warn), `resource-operation-pattern` (warn, our node is operation-only by design), possibly `no-console`. Fix real ones; document any intentional downgrade. The implementation plan will run the linter and triage concretely.

---

## 4. Dependency & engine changes (`package.json`)

- `engines.node` → `">=22"`. Remove the stray `engines.pnpm` line (repo uses npm; `package-lock.json` present).
- **devDependencies:**
  - Add: `eslint@^9`, `typescript-eslint@^8`, `@n8n/eslint-plugin-community-nodes` **pinned to an exact version** (e.g. `0.17.0`), and any peer the community plugin requires (e.g. `eslint-plugin-import-x` if needed — confirmed during implementation).
  - Remove: `@typescript-eslint/parser` (superseded by `typescript-eslint`).
  - Keep: `eslint-plugin-n8n-nodes-base`, `gulp`, `jest`, `ts-jest`, `@types/jest`, `n8n-workflow`.
  - Bump: `prettier@^3.8`, `typescript@^5.9.3`.
- `version` → **`0.2.1`** (tooling-only, no runtime change → patch).
- `peerDependencies` stays exactly `{ "n8n-workflow": "*" }`; `dependencies` stays `{}` (the `no-runtime-dependencies` rule).

---

## 5. CI + provenance publishing (GitHub Actions)

Two workflows under `.github/workflows/`.

### `ci.yml` — validate every change
- Triggers: `pull_request`, and `push` to `main`.
- Node 22, `npm ci`, then `npm run lint`, `npm run build`, `npm test`.

### `publish.yml` — provenanced release on tag
- Trigger: `push` of a tag matching `*.*.*`.
- `permissions: { id-token: write, contents: read }` (OIDC).
- Steps: checkout → `setup-node@v4` (Node 22, `registry-url: https://registry.npmjs.org`) → `npm ci` → `npm run build` → `npm publish --provenance --access public`.
- **No `NPM_TOKEN` secret.** Authentication via **npm OIDC Trusted Publisher**, configured once on npmjs.com for `n8n-nodes-creatio` → Trusted Publishers → GitHub Actions → workflow `publish.yml`.

### Release flow (documented, no extra tooling)
1. `npm version patch` (bumps `package.json`, commits, creates a `vX.Y.Z`/`X.Y.Z` tag — tag pattern must match `publish.yml`).
2. `git push --follow-tags`.
3. `publish.yml` runs → publishes to npm with provenance.

> Note: `npm version` defaults to a `v`-prefixed tag. The plan must make the tag trigger pattern and the `npm version` tag format consistent (either configure `publish.yml` to match `v*.*.*`, or set `npm version`'s `tag-version-prefix` to empty). The plan will pick one and make them consistent.

---

## 6. Documentation

- README (or `CONTRIBUTING.md`): a short **## Releasing** section covering the `npm version` → push tag → CI-publish flow, and the **one-time npm Trusted Publisher setup** the maintainer performs on npmjs.com.
- Note that CI requires the repo to be on GitHub with Actions enabled.

---

## 7. Testing / verification

- `npm run lint` passes under the new flat config (warnings allowed; zero errors).
- `npm run build` still emits `dist/nodes/Creatio/Creatio.node.js`, `dist/nodes/Creatio/Creatio.node.json` (codex), icons, and both credentials.
- `npm test` → 19/19 green (Node 22 locally if available).
- Workflow YAML validated with `actionlint` if available; otherwise structural review.
- **Manual (maintainer):** configure the npm Trusted Publisher, then perform one real tagged release to confirm the provenanced publish end-to-end. This cannot be exercised locally and is the one step outside automated verification.

---

## 8. Out of scope (recap)

- `@n8n/node-cli` adoption; bundler; `n8n-node dev` hot-reload convenience.
- MIT relicensing; verified-listing submission; `@n8n/scan-community-package`.
- Runtime/behavioral changes to the node or credentials.

---

## 9. Files touched (summary)

| File | Change |
|---|---|
| `eslint.config.mjs` | **New** — ESLint 9 flat config (community plugin + typescript-eslint + n8n-nodes-base; scoped; ignores dist/test). |
| `.eslintrc.js`, `.eslintrc.prepublish.js` | **Delete** (superseded by flat config). |
| `package.json` | engines.node ≥22; devDeps (eslint 9, typescript-eslint, pinned community plugin; drop @typescript-eslint/parser; bump prettier/typescript); scripts (`lint`/`lint:fix`/`prepublishOnly`); version → 0.2.1. |
| `.github/workflows/ci.yml` | **New** — lint/build/test on PR + push to main (Node 22). |
| `.github/workflows/publish.yml` | **New** — provenanced `npm publish` on tag via OIDC trusted publisher. |
| `README.md` (or `CONTRIBUTING.md`) | **New section** — Releasing + one-time Trusted Publisher setup. |
| node/credential source | Only minimal edits if the new linter surfaces real (non-downgradable) findings. |
