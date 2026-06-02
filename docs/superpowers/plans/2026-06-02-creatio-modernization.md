# Creatio Node Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize the n8n-nodes-creatio community node: add OAuth2 (client-credentials) as the default auth alongside legacy username/password, replace deprecated HTTP helpers with a friendly-error transport layer, fix the broken credential test and credentials-screen logo, and improve AI-friendliness.

**Architecture:** A single (non-versioned) `INodeType` gains an **Authentication** dropdown (`OAuth2` default / `Username & Password`) that selects one of two credential types. All HTTP goes through a new `GenericFunctions.ts` transport that branches on auth mode — OAuth2 uses `httpRequestWithAuthentication` (n8n injects/refreshes the Bearer token), legacy performs the existing forms-login + cookie/CSRF flow via `httpRequest`. A central error mapper turns HTTP failures into friendly `NodeApiError`s, the execute loop honors `continueOnFail()` and emits `pairedItem`.

**Tech Stack:** TypeScript 5.9 (CommonJS, ES2019), n8n-workflow (peer), Jest + ts-jest, gulp (asset copy), ESLint (`eslint-plugin-n8n-nodes-base`).

**Reference spec:** `docs/superpowers/specs/2026-06-02-creatio-modernization-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `nodes/Creatio/GenericFunctions.ts` | **New.** Transport: `creatioApiRequest`, `getCreatioBaseUrl`, `getCreatioLegacySession`, `mapCreatioError`, auth-error constants, `CreatioAuthentication` type. |
| `nodes/Creatio/Creatio.node.ts` | Node description (auth dropdown, WHEN-oriented description), `loadOptions`, and `execute` — all HTTP delegated to the transport. |
| `nodes/Creatio/Creatio.node.json` | **New.** Codex metadata (categories, alias, doc URLs). |
| `nodes/Creatio/Baserow.node.json` | **Delete** (stale). |
| `credentials/CreatioApi.credentials.ts` | Legacy username/password; credential test fixed with a response-body rule. |
| `credentials/CreatioOAuth2Api.credentials.ts` | **New.** Extends `oAuth2Api`, client-credentials grant, `creatioUrl` + Identity Service `accessTokenUrl`. |
| `credentials/Creatio.svg` | **Renamed** from `creatio.svg` (case fix). |
| `gulpfile.js` | Also copy `*.json` codex files into `dist`. |
| `utils/Descriptions.ts` | **Delete** (unused dead code). |
| `package.json` | Register the OAuth2 credential; bump version. |
| `README.md` | Document `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE`. |
| `test/*.test.ts` | Credential, transport, error-mapper, and migrated node tests. |

**Build order rationale:** Tasks 1–4 are independent prep (assets, credentials). Tasks 5–6 build the transport (node still works on its old code). Task 7 swaps the node onto the transport and adds the auth dropdown. Tasks 8–9 are docs and final verification. Every task leaves the build green.

---

## Task 1: Fix the credentials-screen logo (icon case-sensitivity)

The credential references `file:Creatio.svg` but the file is `credentials/creatio.svg`. macOS is case-insensitive (works in dev); n8n on Linux/Docker is case-sensitive (logo missing).

**Files:**
- Rename: `credentials/creatio.svg` → `credentials/Creatio.svg`

- [ ] **Step 1: Rename the file (two-step, because macOS FS is case-insensitive)**

```bash
git mv credentials/creatio.svg credentials/Creatio.svg.tmp
git mv credentials/Creatio.svg.tmp credentials/Creatio.svg
```

- [ ] **Step 2: Verify the file now matches the reference casing**

Run: `ls credentials/*.svg && grep -n "file:Creatio.svg" credentials/CreatioApi.credentials.ts`
Expected: `credentials/Creatio.svg` exists; grep prints the matching `icon` line.

- [ ] **Step 3: Commit**

```bash
git add -A credentials/
git commit -m "fix: correct credential icon filename casing for Linux"
```

---

## Task 2: Replace stale codex file and ship codex in build

The repo ships `Baserow.node.json` (wrong node id, dead links, filename mismatch) and the gulp build only copies `*.png/*.svg`, so codex files never reach `dist`.

**Files:**
- Delete: `nodes/Creatio/Baserow.node.json`
- Create: `nodes/Creatio/Creatio.node.json`
- Modify: `gulpfile.js:7` (asset glob)

- [ ] **Step 1: Delete the stale codex and the dead utils file**

`utils/Descriptions.ts` is unused copy-pasted AI-tool helper code (only referenced by the now-removed commented imports in the node) and is not in the TypeScript `include` set. Remove both dead files.

```bash
git rm nodes/Creatio/Baserow.node.json utils/Descriptions.ts
```

- [ ] **Step 2: Create `nodes/Creatio/Creatio.node.json`**

```json
{
	"node": "n8n-nodes-creatio.creatio",
	"nodeVersion": "1.0",
	"codexVersion": "1.0",
	"categories": ["Sales", "Data & Storage"],
	"alias": ["crm", "creatio", "contact", "account", "lead", "opportunity", "odata"],
	"resources": {
		"primaryDocumentation": [
			{ "url": "https://github.com/Architechts/n8n-nodes-creatio" }
		],
		"credentialDocumentation": [
			{ "url": "https://github.com/Architechts/n8n-nodes-creatio" }
		]
	}
}
```

- [ ] **Step 3: Extend the gulp asset glob to copy codex JSON files**

In `gulpfile.js`, change the `nodeSource` glob (line 7) so codex JSON is copied to `dist`:

```javascript
function copyIcons() {
	const nodeSource = path.resolve('nodes', '**', '*.{png,svg,json}');
	const nodeDestination = path.resolve('dist', 'nodes');

	src(nodeSource).pipe(dest(nodeDestination));

	const credSource = path.resolve('credentials', '**', '*.{png,svg}');
	const credDestination = path.resolve('dist', 'credentials');

	return src(credSource).pipe(dest(credDestination));
}
```

- [ ] **Step 4: Build and verify the codex lands in dist**

Run: `npm run build && ls dist/nodes/Creatio/Creatio.node.json`
Expected: build succeeds; `dist/nodes/Creatio/Creatio.node.json` exists.

- [ ] **Step 5: Commit**

```bash
git add -A nodes/Creatio/ gulpfile.js utils/
git commit -m "chore: replace stale codex, copy codex in build, remove dead utils"
```

---

## Task 3: Fix the broken `creatioApi` credential test

`AuthService.svc/Login` returns HTTP 200 even on bad credentials (`Code: 1` in body), so n8n shows green. Add a `responseSuccessBody` rule so `Code: 1` is treated as failure.

**Files:**
- Modify: `credentials/CreatioApi.credentials.ts:39-55`
- Test: `test/CreatioApi.credentials.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/CreatioApi.credentials.test.ts`:

```typescript
import { CreatioApi } from '../credentials/CreatioApi.credentials';

describe('CreatioApi credential', () => {
	const cred = new CreatioApi();

	test('credential test rejects invalid credentials via response-body rule', () => {
		expect(cred.test.rules).toBeDefined();
		const rule = cred.test.rules!.find((r) => r.type === 'responseSuccessBody');
		expect(rule).toBeDefined();
		// @ts-expect-error narrow to the rule's properties for assertion
		expect(rule.properties.key).toBe('Code');
		// @ts-expect-error narrow to the rule's properties for assertion
		expect(rule.properties.value).toBe(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/CreatioApi.credentials.test.ts -v`
Expected: FAIL — `cred.test.rules` is `undefined`.

- [ ] **Step 3: Add the rule to the credential test**

In `credentials/CreatioApi.credentials.ts`, replace the `test` block (lines 39-55) with:

```typescript
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.creatioUrl}}',
			url: '/ServiceModel/AuthService.svc/Login',
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				ForceUseSession: 'true',
			},
			body: {
				UserName: '={{$credentials.username}}',
				UserPassword: '={{$credentials.password}}',
			},
			json: true,
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'Code',
					value: 1,
					message: 'Authentication failed: check your Creatio username and password.',
				},
			},
		],
	};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/CreatioApi.credentials.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add credentials/CreatioApi.credentials.ts test/CreatioApi.credentials.test.ts
git commit -m "fix: reject invalid creatioApi credentials in credential test"
```

---

## Task 4: Add the `creatioOAuth2Api` credential

New OAuth2 credential extending n8n's `oAuth2Api` base, configured for Creatio's client-credentials Identity Service flow.

**Files:**
- Create: `credentials/CreatioOAuth2Api.credentials.ts`
- Modify: `package.json:41-46` (register credential, bump version)
- Test: `test/CreatioOAuth2Api.credentials.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/CreatioOAuth2Api.credentials.test.ts`:

```typescript
import { CreatioOAuth2Api } from '../credentials/CreatioOAuth2Api.credentials';

describe('CreatioOAuth2Api credential', () => {
	const cred = new CreatioOAuth2Api();

	test('extends the oAuth2Api base', () => {
		expect(cred.extends).toContain('oAuth2Api');
	});

	test('uses the client-credentials grant', () => {
		const grant = cred.properties.find((p) => p.name === 'grantType');
		expect(grant?.default).toBe('clientCredentials');
	});

	test('exposes a creatioUrl property for the OData base', () => {
		expect(cred.properties.some((p) => p.name === 'creatioUrl')).toBe(true);
	});

	test('defines a credential test', () => {
		expect(cred.test).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/CreatioOAuth2Api.credentials.test.ts -v`
Expected: FAIL — cannot find module `../credentials/CreatioOAuth2Api.credentials`.

- [ ] **Step 3: Create the credential**

Create `credentials/CreatioOAuth2Api.credentials.ts`:

```typescript
// Copyright 2025 Architechts
//
// Use of this software is governed by the Business Source License
// included in the file LICENSE.md.

import { Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class CreatioOAuth2Api implements ICredentialType {
	name = 'creatioOAuth2Api';
	extends = ['oAuth2Api'];
	displayName = 'Creatio OAuth2 API';
	icon: Icon = 'file:Creatio.svg';
	documentationUrl = 'https://github.com/Architechts/n8n-nodes-creatio';
	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'clientCredentials',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Creatio URL',
			name: 'creatioUrl',
			type: 'string',
			default: '',
			required: true,
			description:
				'The base URL of your Creatio instance (e.g., https://your-instance.creatio.com), without a trailing slash',
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'string',
			default: '',
			required: true,
			description:
				'The Creatio Identity Service token endpoint, e.g. https://your-instance-is.creatio.com/connect/token',
			hint: 'This is the Identity Service URL, usually different from the Creatio app URL',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
		},
	];
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.creatioUrl}}',
			url: '/0/odata/$metadata',
			method: 'GET',
			headers: {
				Accept: 'application/xml',
			},
		},
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/CreatioOAuth2Api.credentials.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Register the credential and bump version in `package.json`**

Replace the `version` (line 3) and the `n8n.credentials` array (lines 41-43):

```json
  "version": "0.2.0",
```

```json
    "credentials": [
      "dist/credentials/CreatioApi.credentials.js",
      "dist/credentials/CreatioOAuth2Api.credentials.js"
    ],
```

- [ ] **Step 6: Build to verify both credentials compile and are wired**

Run: `npm run build && ls dist/credentials/CreatioOAuth2Api.credentials.js`
Expected: build succeeds; the compiled credential exists.

- [ ] **Step 7: Commit**

```bash
git add credentials/CreatioOAuth2Api.credentials.ts test/CreatioOAuth2Api.credentials.test.ts package.json
git commit -m "feat: add Creatio OAuth2 (client-credentials) credential"
```

---

## Task 5: Transport — error mapper

Build the friendly-error mapper first; the rest of the transport depends on it.

**Files:**
- Create: `nodes/Creatio/GenericFunctions.ts`
- Test: `test/GenericFunctions.error.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/GenericFunctions.error.test.ts`:

```typescript
import { NodeApiError } from 'n8n-workflow';
import {
	mapCreatioError,
	CREATIO_AUTH_ERROR_MESSAGE,
} from '../nodes/Creatio/GenericFunctions';

const fakeNode = { name: 'Creatio', type: 'creatio', typeVersion: 1, position: [0, 0], parameters: {} } as any;

describe('mapCreatioError', () => {
	test('401 maps to a friendly stale-credential message', () => {
		const err = mapCreatioError(fakeNode, { statusCode: 401, message: 'Unauthorized' });
		expect(err).toBeInstanceOf(NodeApiError);
		expect(err.message).toContain(CREATIO_AUTH_ERROR_MESSAGE);
	});

	test('403 maps to the stale-credential message', () => {
		const err = mapCreatioError(fakeNode, { statusCode: 403, message: 'Forbidden' });
		expect(err.message).toContain(CREATIO_AUTH_ERROR_MESSAGE);
	});

	test('404 maps to a not-found message', () => {
		const err = mapCreatioError(fakeNode, { statusCode: 404, message: 'Not Found' });
		expect(err.message).toContain('not found');
	});

	test('500 maps to a server-error message', () => {
		const err = mapCreatioError(fakeNode, { statusCode: 503, message: 'Boom' });
		expect(err.message).toContain('server error');
	});

	test('always returns a NodeApiError for unknown errors', () => {
		const err = mapCreatioError(fakeNode, { message: 'weird' });
		expect(err).toBeInstanceOf(NodeApiError);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/GenericFunctions.error.test.ts -v`
Expected: FAIL — cannot find module `../nodes/Creatio/GenericFunctions`.

- [ ] **Step 3: Create `GenericFunctions.ts` with the mapper and constants**

Create `nodes/Creatio/GenericFunctions.ts`:

```typescript
// Copyright 2025 Architechts
//
// Use of this software is governed by the Business Source License
// included in the file LICENSE.md.

import type { INode, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export type CreatioAuthentication = 'oAuth2' | 'usernamePassword';

export const CREATIO_AUTH_ERROR_MESSAGE = 'Creatio authentication failed';
export const CREATIO_AUTH_ERROR_DESCRIPTION =
	"Your Creatio credentials appear to be invalid or expired. Check the credential's Client ID/Secret (OAuth2) or username/password, then reconnect.";

function getStatusCode(error: any): number | undefined {
	return (
		error?.statusCode ??
		error?.httpCode ??
		error?.response?.statusCode ??
		error?.cause?.statusCode
	);
}

export function mapCreatioError(node: INode, error: any, itemIndex?: number): NodeApiError {
	const statusCode = getStatusCode(error);
	const options: { message?: string; description?: string; itemIndex?: number } = {};
	if (itemIndex !== undefined) {
		options.itemIndex = itemIndex;
	}

	if (statusCode === 401 || statusCode === 403) {
		options.message = CREATIO_AUTH_ERROR_MESSAGE;
		options.description = CREATIO_AUTH_ERROR_DESCRIPTION;
	} else if (statusCode === 404) {
		options.message = 'Creatio resource not found';
		options.description =
			'The requested Creatio entity or record was not found. Check the entity (subpath) name and record ID.';
	} else if (typeof statusCode === 'number' && statusCode >= 500) {
		options.message = 'Creatio server error';
		options.description =
			'Creatio returned a server error. Please try again, or check that your Creatio instance is available.';
	}

	return new NodeApiError(node, error as JsonObject, options);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/GenericFunctions.error.test.ts -v`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add nodes/Creatio/GenericFunctions.ts test/GenericFunctions.error.test.ts
git commit -m "feat: add Creatio transport error mapper with friendly messages"
```

---

## Task 6: Transport — base URL, legacy session, and request function

Add the auth-aware request function and its helpers to `GenericFunctions.ts`.

**Files:**
- Modify: `nodes/Creatio/GenericFunctions.ts`
- Test: `test/GenericFunctions.request.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/GenericFunctions.request.test.ts`:

```typescript
import {
	creatioApiRequest,
	getCreatioLegacySession,
	CREATIO_AUTH_ERROR_MESSAGE,
} from '../nodes/Creatio/GenericFunctions';

function makeContext() {
	return {
		getNode: jest.fn().mockReturnValue({ name: 'Creatio', type: 'creatio', typeVersion: 1 }),
		getCredentials: jest.fn(),
		helpers: {
			httpRequest: jest.fn(),
			httpRequestWithAuthentication: jest.fn(),
		},
	} as any;
}

describe('creatioApiRequest (OAuth2)', () => {
	test('routes through httpRequestWithAuthentication with the OAuth2 credential', async () => {
		const ctx = makeContext();
		ctx.getCredentials.mockResolvedValue({ creatioUrl: 'https://test.creatio.com/' });
		ctx.helpers.httpRequestWithAuthentication.mockResolvedValue({ value: [{ Id: '1' }] });

		const result = await creatioApiRequest.call(
			ctx,
			'oAuth2',
			'GET',
			'/0/odata/Contact',
			undefined,
			{ itemIndex: 0 },
		);

		expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
			'creatioOAuth2Api',
			expect.objectContaining({
				method: 'GET',
				url: 'https://test.creatio.com/0/odata/Contact',
			}),
		);
		expect(result.value[0].Id).toBe('1');
	});
});

describe('getCreatioLegacySession', () => {
	test('builds a cookie header and CSRF token from Set-Cookie', async () => {
		const ctx = makeContext();
		ctx.getCredentials.mockResolvedValue({ username: 'u', password: 'p' });
		ctx.helpers.httpRequest.mockResolvedValue({
			body: { Code: 0 },
			headers: {
				'set-cookie': [
					'.ASPXAUTH=auth123; path=/; HttpOnly',
					'BPMCSRF=csrf456; path=/',
					'BPMLOADER=loader789; path=/',
					'BPMSESSIONID=sess000; path=/',
				],
			},
		});

		const session = await getCreatioLegacySession(ctx, 'https://test.creatio.com');

		expect(session.csrfToken).toBe('csrf456');
		expect(session.cookieHeader).toContain('.ASPXAUTH=auth123');
		expect(session.cookieHeader).toContain('BPMCSRF=csrf456');
		expect(session.cookieHeader).toContain('UserType=General');
	});

	test('throws a friendly error when login returns Code != 0', async () => {
		const ctx = makeContext();
		ctx.getCredentials.mockResolvedValue({ username: 'u', password: 'bad' });
		ctx.helpers.httpRequest.mockResolvedValue({
			body: { Code: 1, Message: 'wrong' },
			headers: {},
		});

		await expect(getCreatioLegacySession(ctx, 'https://test.creatio.com')).rejects.toThrow(
			CREATIO_AUTH_ERROR_MESSAGE,
		);
	});
});

describe('creatioApiRequest (legacy)', () => {
	test('logs in then sends cookie + BPMCSRF headers on the data request', async () => {
		const ctx = makeContext();
		ctx.getCredentials.mockResolvedValue({
			creatioUrl: 'https://test.creatio.com',
			username: 'u',
			password: 'p',
		});
		ctx.helpers.httpRequest
			.mockResolvedValueOnce({
				body: { Code: 0 },
				headers: { 'set-cookie': ['.ASPXAUTH=a; path=/', 'BPMCSRF=c; path=/'] },
			})
			.mockResolvedValueOnce({ value: [] });

		await creatioApiRequest.call(ctx, 'usernamePassword', 'GET', '/0/odata/Contact', undefined, {
			itemIndex: 0,
		});

		const dataCall = ctx.helpers.httpRequest.mock.calls[1][0];
		expect(dataCall.url).toBe('https://test.creatio.com/0/odata/Contact');
		expect(dataCall.headers.BPMCSRF).toBe('c');
		expect(dataCall.headers.Cookie).toContain('.ASPXAUTH=a');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/GenericFunctions.request.test.ts -v`
Expected: FAIL — `creatioApiRequest`/`getCreatioLegacySession` are not exported.

- [ ] **Step 3: Add the request function and helpers to `GenericFunctions.ts`**

Append to `nodes/Creatio/GenericFunctions.ts` (and extend the imports at the top):

Replace the import block at the top of the file with:

```typescript
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
```

Then append at the end of the file:

```typescript
export interface CreatioRequestOptions {
	json?: boolean;
	accept?: string;
	itemIndex?: number;
}

export async function getCreatioBaseUrl(
	context: IExecuteFunctions | ILoadOptionsFunctions,
	authentication: CreatioAuthentication,
): Promise<string> {
	const credName = authentication === 'oAuth2' ? 'creatioOAuth2Api' : 'creatioApi';
	const credentials = await context.getCredentials(credName);
	return (credentials.creatioUrl as string).trim().replace(/\/$/, '');
}

export async function getCreatioLegacySession(
	context: IExecuteFunctions | ILoadOptionsFunctions,
	baseUrl: string,
): Promise<{ cookieHeader: string; csrfToken: string }> {
	const credentials = await context.getCredentials('creatioApi');

	const response = await context.helpers.httpRequest({
		method: 'POST',
		url: `${baseUrl}/ServiceModel/AuthService.svc/Login`,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			ForceUseSession: 'true',
		},
		body: {
			UserName: credentials.username as string,
			UserPassword: credentials.password as string,
		},
		json: true,
		returnFullResponse: true,
	});

	const loginBody = (response.body ?? {}) as IDataObject;
	if (typeof loginBody.Code === 'number' && loginBody.Code !== 0) {
		throw new NodeApiError(context.getNode(), loginBody as JsonObject, {
			message: CREATIO_AUTH_ERROR_MESSAGE,
			description: CREATIO_AUTH_ERROR_DESCRIPTION,
		});
	}

	const setCookie = response.headers['set-cookie'] as string[] | undefined;
	if (!setCookie || setCookie.length === 0) {
		throw new NodeApiError(context.getNode(), (response.body ?? {}) as JsonObject, {
			message: CREATIO_AUTH_ERROR_MESSAGE,
			description: CREATIO_AUTH_ERROR_DESCRIPTION,
		});
	}

	const pick = (prefix: string) => setCookie.find((c) => c.startsWith(prefix))?.split(';')[0];
	const cookieHeader = [
		pick('BPMSESSIONID='),
		pick('.ASPXAUTH='),
		pick('BPMCSRF='),
		pick('BPMLOADER='),
		'UserType=General',
	]
		.filter(Boolean)
		.join('; ');

	const csrfRaw = setCookie.find((c) => c.startsWith('BPMCSRF='));
	const csrfToken = csrfRaw ? csrfRaw.split('=')[1].split(';')[0] : '';

	return { cookieHeader, csrfToken };
}

export async function creatioApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	authentication: CreatioAuthentication,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject | string,
	options: CreatioRequestOptions = {},
): Promise<any> {
	const json = options.json ?? true;
	const accept = options.accept ?? 'application/json';
	const baseUrl = await getCreatioBaseUrl(this, authentication);
	const url = `${baseUrl}${endpoint}`;

	try {
		if (authentication === 'oAuth2') {
			const requestOptions: IHttpRequestOptions = {
				method,
				url,
				headers: { Accept: accept },
				json,
			};
			if (body !== undefined) {
				requestOptions.body = body;
			}
			return await this.helpers.httpRequestWithAuthentication.call(
				this,
				'creatioOAuth2Api',
				requestOptions,
			);
		}

		const { cookieHeader, csrfToken } = await getCreatioLegacySession(this, baseUrl);
		const requestOptions: IHttpRequestOptions = {
			method,
			url,
			headers: {
				Accept: accept,
				Cookie: cookieHeader,
				BPMCSRF: csrfToken,
			},
			json,
		};
		if (body !== undefined) {
			requestOptions.body = body;
		}
		return await this.helpers.httpRequest(requestOptions);
	} catch (error) {
		// Re-wrap our own friendly auth errors unchanged; map raw HTTP errors.
		if (error instanceof NodeApiError) {
			throw error;
		}
		throw mapCreatioError((this as IExecuteFunctions).getNode(), error, options.itemIndex);
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/GenericFunctions.request.test.ts -v`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Run the full transport test suite and build**

Run: `npx jest test/GenericFunctions.error.test.ts test/GenericFunctions.request.test.ts && npm run build`
Expected: all transport tests PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add nodes/Creatio/GenericFunctions.ts test/GenericFunctions.request.test.ts
git commit -m "feat: add auth-aware Creatio request transport (OAuth2 + legacy)"
```

---

## Task 7: Refactor the node onto the transport (auth dropdown, errors, pairedItem)

Swap the node off the deprecated `helpers.request` + static cookie method onto the transport, add the Authentication dropdown + OAuth2 credential, a WHEN-oriented description, and `continueOnFail`/`pairedItem`/`itemIndex` handling. Migrate the two existing tests and add a `continueOnFail` test.

**Files:**
- Modify: `nodes/Creatio/Creatio.node.ts` (imports, `methods`, remove static method, `description`, `execute`)
- Modify: `test/Creatio.node.test.ts`

- [ ] **Step 1: Replace the import block and remove the commented dead imports**

Replace lines 1-34 of `nodes/Creatio/Creatio.node.ts` with:

```typescript
// Copyright 2025 Architechts
//
// Use of this software is governed by the Business Source License
// included in the file LICENSE.md.

import {
	INodeType,
	INodeTypeDescription,
	IExecuteFunctions,
	INodeExecutionData,
	IDataObject,
	NodeConnectionType,
	ILoadOptionsFunctions,
} from 'n8n-workflow';

import { creatioApiRequest, CreatioAuthentication } from './GenericFunctions';
```

- [ ] **Step 2: Replace the static method + `methods` block (old lines 36-169) with the transport-based class opening + loadOptions**

Replace from `export class Creatio implements INodeType {` through the end of the `methods` block (old line 169) with:

```typescript
export class Creatio implements INodeType {
	methods = {
		loadOptions: {
			async getODataEntities(this: ILoadOptionsFunctions) {
				const authentication = this.getNodeParameter(
					'authentication',
					'oAuth2',
				) as CreatioAuthentication;
				const metadataXml = (await creatioApiRequest.call(
					this,
					authentication,
					'GET',
					'/0/odata/$metadata',
					undefined,
					{ json: false, accept: 'application/xml' },
				)) as string;

				const entityNames: string[] = [];
				const entityTypeRegex = /<EntityType Name="([^"]+)"/g;
				let match;
				while ((match = entityTypeRegex.exec(metadataXml)) !== null) {
					entityNames.push(match[1]);
				}
				return entityNames.map((name) => ({ name, value: name }));
			},
			async getODataEntityFields(this: ILoadOptionsFunctions) {
				const subpath = this.getCurrentNodeParameter('subpath') as string;
				if (!subpath) {
					return [];
				}
				const authentication = this.getNodeParameter(
					'authentication',
					'oAuth2',
				) as CreatioAuthentication;
				const metadataXml = (await creatioApiRequest.call(
					this,
					authentication,
					'GET',
					'/0/odata/$metadata',
					undefined,
					{ json: false, accept: 'application/xml' },
				)) as string;

				const entityRegex = new RegExp(
					`<EntityType Name="${subpath}"[\\s\\S]*?<\\/EntityType>`,
					'g',
				);
				const entityMatch = entityRegex.exec(metadataXml);
				if (!entityMatch) {
					return [];
				}
				const propertyRegex = /<Property Name="([^"]+)"/g;
				const fields: { name: string; value: string }[] = [];
				let match;
				while ((match = propertyRegex.exec(entityMatch[0])) !== null) {
					fields.push({ name: match[1], value: match[1] });
				}
				return fields;
			},
		},
	};
```

> Note: the old `static authenticateAndGetCookies` is intentionally removed — session handling now lives in `GenericFunctions.getCreatioLegacySession`.

- [ ] **Step 3: Update the `description` header — WHEN-oriented description, auth dropdown, dual credentials**

In `nodes/Creatio/Creatio.node.ts`, change the `description` field (old line 177) to:

```typescript
		description:
			'Read and write records in Creatio CRM (contacts, accounts, leads, opportunities, custom objects) via OData. Use to look up, create, update, or delete Creatio CRM data.',
```

Replace the `credentials` array (old lines 183-188) with:

```typescript
		credentials: [
			{
				name: 'creatioOAuth2Api',
				required: true,
				displayOptions: {
					show: {
						authentication: ['oAuth2'],
					},
				},
			},
			{
				name: 'creatioApi',
				required: true,
				displayOptions: {
					show: {
						authentication: ['usernamePassword'],
					},
				},
			},
		],
```

Then add the Authentication dropdown as the **first** entry of the `properties` array (immediately after `properties: [`, before the `Operation` property):

```typescript
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'OAuth2',
						value: 'oAuth2',
					},
					{
						name: 'Username & Password',
						value: 'usernamePassword',
					},
				],
				default: 'oAuth2',
			},
```

- [ ] **Step 4: Replace the entire `execute` method (old lines 640-919) with the transport-based version**

```typescript
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const authentication = this.getNodeParameter(
					'authentication',
					i,
					'oAuth2',
				) as CreatioAuthentication;
				const operation = this.getNodeParameter('operation', i) as string;
				let response: any;

				switch (operation) {
					case 'GET': {
						const subpath = this.getNodeParameter('subpath', i) as string;
						const selectParam = this.getNodeParameter('select', i) as string[] | string;
						const select = Array.isArray(selectParam)
							? selectParam
							: selectParam
								? selectParam.split(',').map((s) => s.trim())
								: [];
						const top = this.getNodeParameter('top', i) as number;
						const filter = this.getNodeParameter('filter', i) as string;
						const expand = this.getNodeParameter('expand', i) as string;

						const queryParams: string[] = [];
						if (select && select.length > 0) {
							queryParams.push(`$select=${encodeURIComponent(select.join(','))}`);
						}
						if (top) {
							queryParams.push(`$top=${top}`);
						}
						if (filter) {
							queryParams.push(`$filter=${encodeURIComponent(filter)}`);
						}
						if (expand) {
							queryParams.push(`$expand=${encodeURIComponent(expand)}`);
						}
						let endpoint = `/0/odata/${subpath}`;
						if (queryParams.length > 0) {
							endpoint += `?${queryParams.join('&')}`;
						}

						response = await creatioApiRequest.call(this, authentication, 'GET', endpoint, undefined, {
							itemIndex: i,
						});
						if (response && response.value) {
							response = response.value;
						}
						break;
					}
					case 'METADATA': {
						const subpath = this.getNodeParameter('subpath', i) as string;
						const metadataXml = (await creatioApiRequest.call(
							this,
							authentication,
							'GET',
							'/0/odata/$metadata',
							undefined,
							{ json: false, accept: 'application/xml', itemIndex: i },
						)) as string;

						const entityRegex = new RegExp(
							`<EntityType Name="${subpath}"[\\s\\S]*?<\\/EntityType>`,
							'g',
						);
						const entityMatch = entityRegex.exec(metadataXml);
						const fields: { fieldName: string }[] = [];
						if (entityMatch) {
							const propertyRegex = /<Property Name="([^"]+)"/g;
							let match;
							while ((match = propertyRegex.exec(entityMatch[0])) !== null) {
								fields.push({ fieldName: match[1] });
							}
						}
						response = fields;
						break;
					}
					case 'TABLES': {
						const result = await creatioApiRequest.call(
							this,
							authentication,
							'GET',
							'/0/odata/',
							undefined,
							{ itemIndex: i },
						);
						response = (result.value || [])
							.filter((item: any) => {
								const name = (item.name as string).toLowerCase();
								return (
									!name.startsWith('vw') &&
									!name.startsWith('sys') &&
									!name.startsWith('oauth') &&
									!name.startsWith('web')
								);
							})
							.map((item: any) => ({ tableName: item.name }));
						break;
					}
					case 'POST': {
						const subpath = this.getNodeParameter('subpath', i) as string;
						const useBody = this.getNodeParameter('useBody', i, false) as boolean;
						let requestBody: IDataObject = {};
						if (useBody) {
							requestBody = this.getNodeParameter('body', i) as IDataObject;
						} else {
							const fields = this.getNodeParameter('fields', i, {}) as {
								field?: { fieldName: string; fieldValue: string }[];
							};
							if (fields.field) {
								for (const fieldData of fields.field) {
									requestBody[fieldData.fieldName] = fieldData.fieldValue;
								}
							}
						}
						response = await creatioApiRequest.call(
							this,
							authentication,
							'POST',
							`/0/odata/${subpath}`,
							requestBody,
							{ accept: '*/*', itemIndex: i },
						);
						break;
					}
					case 'PATCH': {
						const subpath = this.getNodeParameter('subpath', i) as string;
						const id = this.getNodeParameter('id', i, '') as string;
						const useBody = this.getNodeParameter('useBody', i, false) as boolean;
						let requestBody: IDataObject = {};
						if (useBody) {
							requestBody = this.getNodeParameter('body', i) as IDataObject;
						} else {
							const fields = this.getNodeParameter('fields', i, {}) as {
								field?: { fieldName: string; fieldValue: string }[];
							};
							if (fields.field) {
								for (const fieldData of fields.field) {
									if (
										fieldData.fieldValue !== '' &&
										fieldData.fieldValue !== null &&
										fieldData.fieldValue !== undefined
									) {
										requestBody[fieldData.fieldName] = fieldData.fieldValue;
									}
								}
							}
						}
						let endpoint = `/0/odata/${subpath}`;
						if (id) {
							endpoint = `/0/odata/${subpath}(${id})`;
						}
						response = await creatioApiRequest.call(
							this,
							authentication,
							'PATCH',
							endpoint,
							requestBody,
							{ accept: '*/*', itemIndex: i },
						);
						break;
					}
					case 'DELETE': {
						const subpath = this.getNodeParameter('subpath', i) as string;
						const id = this.getNodeParameter('id', i, '') as string;
						let endpoint = `/0/odata/${subpath}`;
						if (id) {
							endpoint = `/0/odata/${subpath}(${id})`;
						}
						response = await creatioApiRequest.call(
							this,
							authentication,
							'DELETE',
							endpoint,
							undefined,
							{ accept: '*/*', itemIndex: i },
						);
						if (response === '' || response === undefined || response === null) {
							response = { deleted: true };
						}
						break;
					}
				}

				const appendRequest = this.getNodeParameter('appendRequest', i, false) as boolean;
				if (appendRequest && ['GET', 'POST', 'PATCH'].includes(operation)) {
					const requestFields: IDataObject = { operation };
					requestFields.subpath = this.getNodeParameter('subpath', i, '');
					if (operation === 'GET') {
						requestFields.select = this.getNodeParameter('select', i, []);
						requestFields.top = this.getNodeParameter('top', i, 10);
						requestFields.filter = this.getNodeParameter('filter', i, '');
						requestFields.expand = this.getNodeParameter('expand', i, '');
					}
					if (operation === 'PATCH') {
						requestFields.id = this.getNodeParameter('id', i, '');
					}
					if (['POST', 'PATCH'].includes(operation)) {
						requestFields.body = this.getNodeParameter('body', i, {});
					}
					returnData.push({ json: { ...requestFields, response }, pairedItem: { item: i } });
				} else if (Array.isArray(response)) {
					for (const entry of response) {
						returnData.push({ json: entry as IDataObject, pairedItem: { item: i } });
					}
				} else {
					returnData.push({ json: (response ?? {}) as IDataObject, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
```

- [ ] **Step 5: Migrate the two existing node tests and add a `continueOnFail` test**

Replace the entire contents of `test/Creatio.node.test.ts` with:

```typescript
import { Creatio } from '../nodes/Creatio/Creatio.node';
import { IExecuteFunctions } from 'n8n-workflow';

function makeExecuteMock(params: Record<string, any>) {
	const getNodeParameter = jest.fn(
		(name: string, _i?: number, fallback?: any) =>
			params[name] !== undefined ? params[name] : fallback,
	);
	return {
		getInputData: jest.fn().mockReturnValue([{ json: {} }]),
		getNodeParameter,
		continueOnFail: jest.fn().mockReturnValue(false),
		getNode: jest
			.fn()
			.mockReturnValue({ name: 'Creatio', type: 'creatio', typeVersion: 1, parameters: {} }),
		getCredentials: jest.fn().mockResolvedValue({ creatioUrl: 'https://test.creatio.com' }),
		helpers: {
			httpRequest: jest.fn(),
			httpRequestWithAuthentication: jest.fn(),
		},
	} as unknown as IExecuteFunctions;
}

describe('Creatio Node', () => {
	let creatioNode: Creatio;

	beforeEach(() => {
		creatioNode = new Creatio();
	});

	test('builds the correct URL for a GET via the OAuth2 transport', async () => {
		const ctx = makeExecuteMock({
			authentication: 'oAuth2',
			operation: 'GET',
			subpath: 'Contact',
			select: ['Name', 'Email'],
			top: 10,
			filter: '',
			expand: '',
			appendRequest: false,
		});
		(ctx.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({
			value: [{ Name: 'Test', Email: 'test@test.com' }],
		});

		await creatioNode.execute.call(ctx);

		expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
			'creatioOAuth2Api',
			expect.objectContaining({
				method: 'GET',
				url: 'https://test.creatio.com/0/odata/Contact?$select=Name%2CEmail&$top=10',
			}),
		);
	});

	test('filters empty fields in a PATCH operation', async () => {
		const ctx = makeExecuteMock({
			authentication: 'oAuth2',
			operation: 'PATCH',
			subpath: 'Contact',
			id: '123',
			useBody: false,
			fields: {
				field: [
					{ fieldName: 'Name', fieldValue: 'John Doe' },
					{ fieldName: 'Email', fieldValue: '' },
				],
			},
			appendRequest: false,
		});
		(ctx.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({});

		await creatioNode.execute.call(ctx);

		expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
			'creatioOAuth2Api',
			expect.objectContaining({
				method: 'PATCH',
				body: { Name: 'John Doe' },
			}),
		);
	});

	test('continueOnFail emits an error item instead of throwing', async () => {
		const ctx = makeExecuteMock({
			authentication: 'oAuth2',
			operation: 'GET',
			subpath: 'Contact',
			select: [],
			top: 10,
			filter: '',
			expand: '',
			appendRequest: false,
		});
		(ctx.continueOnFail as jest.Mock).mockReturnValue(true);
		(ctx.helpers.httpRequestWithAuthentication as jest.Mock).mockRejectedValue(
			Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
		);

		const result = await creatioNode.execute.call(ctx);

		expect(result[0][0].json.error).toBeDefined();
		expect(result[0][0].pairedItem).toEqual({ item: 0 });
	});
});
```

- [ ] **Step 6: Run the node tests to verify they pass**

Run: `npx jest test/Creatio.node.test.ts -v`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the full suite, build, and lint**

Run: `npm test && npm run build && npm run lint`
Expected: all tests PASS; build succeeds; lint reports no errors.

- [ ] **Step 8: Commit**

```bash
git add nodes/Creatio/Creatio.node.ts test/Creatio.node.test.ts
git commit -m "feat: route Creatio node through transport with OAuth2 default and friendly errors"
```

---

## Task 8: README env-var note and `name`-field audit

**Files:**
- Modify: `README.md` (Authentication section, around line 55)

- [ ] **Step 1: Audit for any parameter literally named `name` (the ✦ button bug)**

Run: `grep -rn "name: 'name'" nodes/ credentials/`
Expected: **no matches.** (The node's parameters are `authentication`, `operation`, `subpath`, `select`, `top`, `filter`, `expand`, `appendRequest`, `id`, `fields`, `fieldName`, `fieldValue`, `useBody`, `body` — none is literally `name`.) If a match appears in future, rename that parameter (e.g. to `recordName`) and update all `getNodeParameter`/`displayOptions` references.

- [ ] **Step 2: Document the community-node tool-usage prerequisite in the README**

In `README.md`, under the `### Authentication` section (around line 55), add:

```markdown
### Using this node as an AI Agent tool

This node is exposed to the n8n AI Agent (`usableAsTool`). To make community nodes
available as Agent tools, the n8n instance must be started with:

```
N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true
```

This is a deployment setting on the n8n host (it cannot be configured from inside the package).

### OAuth2 (recommended)

Set **Authentication** to **OAuth2** and create a *Creatio OAuth2 API* credential:

- **Creatio URL** — your instance base URL, e.g. `https://your-instance.creatio.com`
- **Access Token URL** — the Identity Service token endpoint, e.g. `https://your-instance-is.creatio.com/connect/token`
- **Client ID** / **Client Secret** — from the OAuth client registered in Creatio

n8n fetches and refreshes the access token automatically. Legacy username/password
authentication remains available by setting **Authentication** to **Username & Password**.
```

- [ ] **Step 3: Verify the README renders the new sections**

Run: `grep -n "N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE\|OAuth2 (recommended)" README.md`
Expected: both lines found.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document OAuth2 setup and AI tool-usage env var"
```

---

## Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full clean build, lint, and test**

Run: `npm run build && npm run lint && npm test`
Expected: build succeeds; lint clean; all test suites PASS.

- [ ] **Step 2: Verify the published dist contains all artifacts**

Run: `ls dist/nodes/Creatio/Creatio.node.js dist/nodes/Creatio/Creatio.node.json dist/nodes/Creatio/Creatio.svg dist/credentials/CreatioApi.credentials.js dist/credentials/CreatioOAuth2Api.credentials.js dist/credentials/Creatio.svg`
Expected: every file exists. (Confirms the icon casing fix and codex copy reach `dist`.)

- [ ] **Step 3: Manual smoke test in a local n8n (no automated coverage for live API)**

Document the result of these manual checks (requires a real Creatio instance):
1. Add the Creatio node; confirm **Authentication** defaults to **OAuth2** and the OAuth2 credential is requested.
2. Create a *Creatio OAuth2 API* credential with a valid client id/secret; click **Test** → green.
3. Enter a wrong client secret → **Test** shows red.
4. Switch to **Username & Password**; create a *Creatio API* credential; enter a wrong password → **Test** shows red (the §Task 3 fix).
5. Confirm the Creatio logo renders on the credentials listing screen.
6. Run a GET against a known entity (e.g. `Contact`) with both auth modes; confirm records return.
7. With an expired/invalid credential, run the node → confirm the friendly "credentials appear to be invalid or expired" error (not a raw 401).

- [ ] **Step 4: Final commit (if any doc notes were added) and summary**

```bash
git add -A
git commit -m "chore: finalize Creatio modernization" --allow-empty
```

---

## Notes for the implementer

- **Re-auth per call (legacy)** is intentional and preserved — `getCreatioLegacySession` runs on every legacy request. Session caching is explicitly out of scope.
- **Legacy cookie set** now always includes `BPMSESSIONID` (previously only on writes). Sending it on reads is harmless and simplifies the transport to a single path.
- **Output shape** changed from the old (buggy) `returnJsonArray` behavior to proper per-record `INodeExecutionData` items with `pairedItem`. This is a deliberate correctness improvement; backward compatibility of output is out of scope per the spec.
- **Do not change the license** (stays BSL-1.1) and **do not migrate the toolchain** (`@n8n/node-cli`, ESLint 9, Node 22) — those are deferred B-readiness items in the spec, not part of this plan.
