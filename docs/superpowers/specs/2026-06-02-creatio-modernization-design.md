# n8n-nodes-creatio Modernization — Design Spec

**Date:** 2026-06-02
**Status:** Approved for planning
**Scope:** Targeted modernization now, structured to be verification-ready later (B-ready). License stays BSL-1.1 by decision (see §8).

---

## 1. Goals

1. **Compatibility** — bring the node up to n8n's latest community-node patterns by removing deprecated APIs.
2. **OAuth2 auth** — add OAuth2 (client-credentials via Creatio Identity Service) as the **default** authentication method, keeping legacy username/password available.
3. **Friendly errors** — replace raw/silent error handling with clear, actionable messages, especially for stale/invalid credentials.
4. **Fix the broken credential test** — entering a wrong password currently shows a green "OK" bar; it must show failure.
5. **Fix the credentials-screen logo** — the Creatio icon is missing on the credentials listing screen in production.
6. **AI-friendliness** — make the node easy for n8n's AI Agent (tool use) and AI workflow builder to discover, select, and configure.

Backward compatibility with existing saved workflows is **explicitly out of scope** (per decision). No node versioning.

---

## 2. Current State (baseline)

- `n8n-nodes-creatio` v0.1.18, node API v1, license **BSL-1.1**.
- Single credential `creatioApi` — `creatioUrl`, `username`, `password`. Forms auth against `/ServiceModel/AuthService.svc/Login`, manual cookie + `BPMCSRF` parsing, **re-authenticates on every call**.
- `nodes/Creatio/Creatio.node.ts` (~921 lines): declarative `INodeTypeDescription` + a large programmatic `execute` switch. `usableAsTool: true` already set.
- Uses the **deprecated `this.helpers.request`** throughout.
- Error handling is minimal: a `401` silently returns `[]`; other errors are thrown raw.
- `utils/Descriptions.ts` — unused, copy-pasted AI-tool helpers (dead code).
- `nodes/Creatio/Baserow.node.json` — stale codex (wrong node id, dead doc links, filename mismatch).
- Credential icon reference `file:Creatio.svg` (capital C) but file is `credentials/creatio.svg` (lowercase) → logo missing on case-sensitive Linux.
- Tests: 2 (URL build for GET, PATCH empty-field filtering).
- Toolchain: gulp + tsc, `eslint-plugin-n8n-nodes-base`, Node ≥18.

### Key technical facts driving the design

- **Creatio OAuth2 = client-credentials grant** via the Identity Service: register an OAuth client → `client_id`/`client_secret` → token from `/connect/token` → `Bearer` token on OData calls. No cookies or CSRF needed on this path. n8n's `oAuth2Api` base supports `grantType: clientCredentials` and handles token fetch + refresh.
- **`AuthService.svc/Login` returns HTTP 200 even on bad credentials**, signaling failure only in the response body (`Code: 1` = failure, `Code: 0` = success). n8n's credential test only checks HTTP status, which is why a wrong password shows green. Fix: response-body validation rule.

---

## 3. Architecture

Three structural changes:

1. **Single node, no versioning.** `Creatio.node.ts` remains one `INodeType` with one description. It gains an **Authentication** dropdown at the top of the properties (`OAuth2` default / `Username & Password`). The node's `credentials[]` uses `displayOptions` to require the matching credential based on the dropdown value.

2. **New transport layer** — `nodes/Creatio/GenericFunctions.ts`. One auth-aware request function shared by `execute` and `loadOptions`. Replaces every `this.helpers.request` call with `this.helpers.httpRequest` / `this.helpers.httpRequestWithAuthentication`. Houses the central error mapper.

3. **Dead code removed** — delete `utils/Descriptions.ts`.

```
nodes/Creatio/
  Creatio.node.ts        # description (incl. Authentication dropdown) + execute/loadOptions, delegates HTTP to transport
  GenericFunctions.ts    # creatioApiRequest(...) auth-aware transport + error mapper
  Creatio.svg
credentials/
  CreatioApi.credentials.ts        # legacy username/password, test fixed
  CreatioOAuth2Api.credentials.ts  # new, extends oAuth2Api (client credentials), default
```

---

## 4. Credentials

### 4.1 `creatioApi` (legacy username/password — kept)

Fields unchanged: `creatioUrl`, `username`, `password` (password field keeps `typeOptions: { password: true }`).

**Test fix:** keep the `POST /ServiceModel/AuthService.svc/Login` request, but add a response-body validation rule so a failure `Code` is treated as an error:

```ts
test: ICredentialTestRequest = {
  request: { /* existing Login POST */ },
  rules: [
    {
      type: 'responseSuccessBody',
      properties: {
        key: 'Code',
        value: 1, // Creatio returns Code: 1 on invalid credentials
        message: 'Authentication failed: check your Creatio username and password.',
      },
    },
  ],
};
```

This makes a wrong password show red in the UI.

### 4.2 `creatioOAuth2Api` (new — default)

```ts
extends = ['oAuth2Api'];
```

- `grantType` = `clientCredentials` (hidden).
- `accessTokenUrl` — the Identity Service `/connect/token` endpoint (user-supplied; hint/placeholder explains it is the Identity Service URL, distinct from the Creatio app URL).
- `creatioUrl` — OData base URL (added property, used by the transport for request URLs).
- `clientId` / `clientSecret` — supplied by the `oAuth2Api` base UI.
- `scope` — optional (default empty; Creatio client-credentials typically needs none).
- `authentication` — `body` (Creatio token endpoint expects credentials in the form body).

n8n's base handles token acquisition, caching, and refresh.

**Test:** a lightweight authenticated `GET` to `={{$credentials.creatioUrl}}/0/odata/$metadata`. A bad client secret → 401 → red in the UI.

`documentationUrl` set on both credentials pointing to the repo README auth section.

### 4.3 Credentials-screen logo fix

`CreatioApi.credentials.ts` declares `icon: 'file:Creatio.svg'` (capital **C**), but the actual file is `credentials/creatio.svg` (lowercase). On case-insensitive macOS this renders in dev, but n8n production runs on **case-sensitive Linux/Docker**, so the icon is missing on the credentials listing screen.

**Fix:** rename `credentials/creatio.svg` → `credentials/Creatio.svg` to match the reference (SVG content is identical to the node icon; only the filename casing is wrong). The new `creatioOAuth2Api` credential reuses the same `file:Creatio.svg`. Verify the gulp/build step copies it into `dist/credentials/Creatio.svg`.

---

## 5. Authentication & data flow

The transport function `creatioApiRequest` branches on the node's Authentication dropdown value:

- **OAuth2:**
  `this.helpers.httpRequestWithAuthentication.call(this, 'creatioOAuth2Api', options)`.
  n8n injects the `Bearer` token and auto-refreshes on expiry. No cookies, no CSRF. Base URL from the credential's `creatioUrl`.

- **Username & Password (legacy):**
  1. `POST` to `AuthService.svc/Login` via `httpRequest` (full response) to obtain `Set-Cookie`.
  2. Extract `.ASPXAUTH`, `BPMCSRF`, `BPMLOADER`, `BPMSESSIONID` cookies.
  3. Attach `Cookie` header + `BPMCSRF` header to the OData request via `httpRequest`.
  Re-authentication still happens per call (current behavior preserved). Session caching is noted as a **future optimization, out of scope**.

`loadOptions` (entity/field dropdowns) uses the same transport so both auth modes work for dynamic option loading.

---

## 6. Error handling

A central error mapper lives in the transport layer. The silent `401 → []` behavior is **removed**. Mapping:

| Condition | Surfaced as |
|---|---|
| `401` / `403`, or legacy login `Code ≠ 0` | `NodeApiError` — *"Your Creatio credentials appear to be invalid or expired. Check the credential's Client ID/Secret (OAuth2) or username/password, then reconnect."* |
| `404` | `NodeApiError` — *"The requested Creatio entity or record was not found."* |
| `5xx` | `NodeApiError` — *"Creatio returned a server error. Please try again or check your instance."* |
| Network / timeout | `NodeApiError` — friendly connectivity message. |
| Other / unknown | `NodeApiError` wrapping the original response (never a raw throw). |

Additional rules:
- All errors thrown inside the `execute` item loop include `{ itemIndex }` so the UI links the error to the offending item.
- `this.continueOnFail()` is honored: on failure, push a per-item error result (`{ json: { error }, pairedItem: { item: i } }`) instead of throwing.
- Errors carry a useful `description` where it aids the user (e.g. which operation/entity failed).

---

## 7. AI-friendliness

Goal: the node should be easy for n8n's **AI Agent** (using it as a tool) and the **AI workflow builder** (generating flows) to discover, select, and configure. Both reason over the node's *definition + parameter metadata*; credentials are never sent to the model.

**Already in place (keep):** `usableAsTool: true`; intent-named operations with the `action` field (e.g. "Create a record"); `$fromAI()` per-field filling is automatic when the node is wired to an Agent — authors don't write it.

**Changes:**

1. **Replace the broken codex file.** Delete `nodes/Creatio/Baserow.node.json` (stale: wrong node id `n8n-nodes-base.baserow`, dead Baserow doc links, filename mismatch). Add `nodes/Creatio/Creatio.node.json`:
   ```json
   {
     "node": "n8n-nodes-creatio.creatio",
     "nodeVersion": "1.0",
     "codexVersion": "1.0",
     "categories": ["Sales", "Data & Storage"],
     "alias": ["crm", "creatio", "contact", "account", "lead", "opportunity", "odata"],
     "resources": {
       "primaryDocumentation": [{ "url": "https://github.com/Architechts/n8n-nodes-creatio" }],
       "credentialDocumentation": [{ "url": "https://github.com/Architechts/n8n-nodes-creatio" }]
     }
   }
   ```
   The codex drives nodes-panel discovery/search (categories + `alias`), which is how the builder finds the node.

2. **Ship codex files in the build.** `gulpfile.js` currently copies only `*.png`/`*.svg` into `dist`; a correct `Creatio.node.json` would not be published. Extend the copy glob to include `*.node.json` (→ `dist/nodes/Creatio/Creatio.node.json`).

3. **Rewrite the node `description` to be WHEN-oriented** for tool selection. Replace `'Consume Creatio API'` with, e.g.: *"Read and write records in Creatio CRM (contacts, accounts, leads, opportunities, custom objects) via OData. Use to look up, create, update, or delete Creatio CRM data."*

4. **Audit field names for a literal `name`.** Known n8n bug: the "let the model fill this" ✦ button is not shown for a parameter named `name`. If any node parameter is named `name`, rename it (e.g. `recordName`).

5. **Document the tool-usage prerequisite in the README.** Community nodes are usable as Agent tools only when the self-hoster sets `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` (off by default). This is a deployer setting, not bakeable into the package.

**Synergy:** the §6 friendly errors and returning structured JSON from `execute()` both help agents self-correct and read observations — no extra work needed there.

> Builder caveat: n8n's AI workflow builder is Beta and its support for community nodes is undocumented/best-effort. These changes maximize discoverability and configurability but cannot guarantee the builder selects the node.

---

## 8. B-readiness & licensing (documented, not built now)

The node stays on **BSL-1.1 by decision**. Because n8n's *verified* community-node listing hard-requires an MIT license, the node will **not** be eligible for the verified listing while on BSL-1.1. It will still install and run as a self-hosted/unverified community node.

The following verification-readiness items are intentionally **deferred** and left as clean seams (not implemented in this work):

- Migrate toolchain to `@n8n/node-cli` (`n8n-node build/dev/lint/release`), replacing gulp/tsc scripts.
- Adopt ESLint 9 + `@n8n/eslint-plugin-community-nodes`; run `npx @n8n/scan-community-package`.
- Bump Node engine to ≥22, set `n8n.strict: true`, `peerDependencies` to exactly `{ "n8n-workflow": "*" }`, zero runtime `dependencies`.
- GitHub Actions provenance publishing.

These are recorded here so a future pass can pick them up without rework.

---

## 9. Testing

Keep the 2 existing tests (GET URL construction, PATCH empty-field filtering). Add:

- **Credential test rules** — `creatioApi` test includes the `responseSuccessBody` rule for `Code: 1`; `creatioOAuth2Api` test targets `/0/odata/$metadata`.
- **Transport auth-mode selection** — OAuth2 mode calls `httpRequestWithAuthentication` with `creatioOAuth2Api`; legacy mode performs the Login + cookie/CSRF path.
- **Error mapper** — `401`/`403` → stale-credential message; `404` → not-found message; `5xx` → server-error message; legacy `Code ≠ 0` → stale-credential message.
- **`continueOnFail`** — failing item produces a per-item error output with `pairedItem` instead of throwing.

---

## 10. Out of scope

- Backward compatibility / node versioning for existing saved workflows.
- Legacy session caching (re-auth-per-call retained).
- MIT relicensing and the n8n verified-listing submission.
- Refactoring the operation dispatch beyond what the transport extraction requires.

---

## 11. Files touched (summary)

| File | Change |
|---|---|
| `nodes/Creatio/Creatio.node.ts` | Add Authentication dropdown + credential `displayOptions`; route HTTP through transport; modern error handling, `itemIndex`, `continueOnFail`; WHEN-oriented `description`; audit/rename any `name` param. |
| `nodes/Creatio/GenericFunctions.ts` | **New** — auth-aware `creatioApiRequest` + error mapper. |
| `nodes/Creatio/Creatio.node.json` | **New** — codex (categories, alias, doc URLs). |
| `nodes/Creatio/Baserow.node.json` | **Delete** (stale codex). |
| `credentials/CreatioApi.credentials.ts` | Add `responseSuccessBody` test rule; `documentationUrl`. |
| `credentials/CreatioOAuth2Api.credentials.ts` | **New** — `extends ['oAuth2Api']`, client-credentials, `creatioUrl`, test. |
| `credentials/creatio.svg → credentials/Creatio.svg` | **Rename** — fix case-sensitivity so the credentials-screen logo loads on Linux. |
| `utils/Descriptions.ts` | **Delete** (dead code). |
| `gulpfile.js` | Also copy `*.node.json` into `dist`. |
| `package.json` | Register the new credential under `n8n.credentials`. |
| `README.md` | Document `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` for Agent tool usage. |
| `test/` | Add credential-test, transport, and error-mapper tests. |
