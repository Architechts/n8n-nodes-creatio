# Creatio Node

This node allows you connect N8N to Creatio, the popular Agentic Nocode Platform with an excellent CRM. 
## Table of Contents

- [Installation](#installation)
- [Features](#features)
- [Usage](#usage)
- [Authentication](#authentication)
- [Resources](#resources)
- [License](#license)

---

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

---

### Features

- Connect n8n to your Creatio instance
- Create, read, update, and delete records in any Creatio entity
- Upload and download file attachments
- Select entities and fields dynamically
- Execute custom methods on Creatio models
- Store and manage multiple Creatio credentials

### Usage

#### Resource & Operation (node version 2+)

New Creatio nodes follow n8n's conventional **Resource → Operation** structure. The stable parameter names are `resource` and `operation`:

| Resource | Operation (`operation` value) | Equivalent in v1 |
| --- | --- | --- |
| `record` | `get` / `create` / `update` / `delete` | `GET` / `POST` / `PATCH` / `DELETE` |
| `file` | `upload` / `download` | `UPLOAD` / `DOWNLOAD` |
| `schema` | `getFields` / `listTables` | `METADATA` / `TABLES` |

All other parameter names (`subpath`, `id`, `fields`, `select`, `top`, `filter`, `expand`, `useBody`, `body`, `appendRequest`, the file parameters, etc.) are unchanged and stable, so programmatic edits that set `parameters.<name>` by node id are predictable.

**Backward compatibility:** workflows created before v2 are stored at `typeVersion: 1` and keep the flat uppercase `operation` values (`GET`, `POST`, `PATCH`, …). They continue to execute unchanged — the node maps both shapes to the same internal handlers. You do **not** need to migrate existing workflows.

The operation descriptions below use the v1 names; the v2 mapping is in the table above.

#### GET
- Choose your Creatio subPath and target fields from the dropdown menus or add manually using an Expression
- Use the optional Filter, Top and Expand filters

#### POST
- Choose your Creatio subPath from the dropdown menu or add manually using an Expression
- Enter JSON with the data you want to add

#### PATCH
- Choose your Creatio subPath from the dropdown menu or add manually using an Expression
- Enter ID of record to update
- Enter JSON with the data you want to update

#### DELETE
- Choose your Creatio subPath from the dropdown menu or add manually using an Expression
- Enter ID of record to delete

#### Upload File
- Set the **Input Binary Field** that holds the file (default `data`)
- Set the **Entity Schema Name** (the file entity, e.g. `ContactFile`, `AccountFile` or `SysFile`)
- Set **Parent Column Name** / **Parent Column Value** to link the file to its parent record (e.g. `Contact` and the contact's GUID)
- A new file ID GUID is generated automatically; override it (or the file name, MIME type, and `AdditionalParams`) under **Options** if needed
- Uploads in a single request — suitable for files up to ~30 MB. Larger files would require chunked upload (not yet supported)

#### Download File
- Set the **Entity Schema Name** and the **File ID** (GUID of the file record)
- The file is written to the binary output field set in **Put Output File in Field** (default `data`)


**Example use cases:**
- Add new leads or contacts automatically
- Sync data between Creatio and other platforms
- Update records based on external triggers
- Retrieve and process Creatio data for reporting or AI agents

### Authentication

Authentication is required. Store your Creatio API credentials securely in n8n before using the node.
It is possible that the selected user is not allowed to delete records.

### Using this node as an AI Agent tool

This node is exposed to the n8n AI Agent (`usableAsTool`). To make community nodes available as Agent tools, the n8n instance must be started with:

```
N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true
```

This is a deployment setting on the n8n host (it cannot be configured from inside the package).

### OAuth2 (recommended)

Set **Authentication** to **OAuth2** and create a *Creatio OAuth2 API* credential:

- **Creatio URL** — your instance base URL, e.g. `https://your-instance.creatio.com`
- **Access Token URL** — the Identity Service token endpoint, e.g. `https://your-instance-is.creatio.com/connect/token`
- **Client ID** / **Client Secret** — from the OAuth client registered in Creatio

n8n fetches and refreshes the access token automatically. Legacy username/password authentication remains available by setting **Authentication** to **Username & Password**.

### Moving workflows between environments

n8n stores a credential reference on each node as an `{ id, name }` pair (e.g. `creatioOAuth2Api: { id: "37", name: "Creatio (prod)" }`). The **id** is environment-specific, so a workflow exported from one n8n instance points at a credential id that does not exist on another.

To push a workflow between environments without hand-editing ids:

- **Match by name.** Create the Creatio credential with the **same display name** in each environment. When you import a workflow whose credential id is unknown, n8n resolves it by name if a credential of the same type and name exists.
- The node does not hard-code any credential id; it only references the two credential **types** (`creatioOAuth2Api`, `creatioApi`). The id lives in the workflow JSON, not in the node.
- When updating a workflow via the public API, send the credential block as `{ id, name }` for the target environment's credential.

### Behavioral notes

- **Empty (zero-row) GET results return 0 items.** A list `GET` that matches no rows outputs an empty array, not a `{}` placeholder. If you enable the node's **Always Output Data** setting, n8n core (not this node) re-adds a single empty item — that is the defined purpose of that setting and cannot be overridden from inside the node. For a truly empty downstream branch, leave **Always Output Data** off, or guard downstream on a real field (e.g. `Id`).
- **PATCH sends explicit empty strings.** A field with an empty value (`fieldValue: ''`) is sent in the PATCH body and clears the column. Only fields that are genuinely not provided (`undefined`) are skipped. You no longer need to send a single space `' '` to clear a text column.

### Input

The node accepts:
- Storing credentials
- Creatio Tenant selection
- Creatio Entity selection
- Creatio model method execution body parameters

### Output

- Output from Creatio

### Authentication

All fields required

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)

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

## License

This project is licensed under the **Business Source License 1.1**.
- ✅ Free for personal, educational, and non-commercial use.  
- 💼 Commercial use (including providing services, SaaS, or selling products that substantially derive value from this software) requires a separate license agreement with **Architechts NV**.  

For questions or licensing inquiries, please contact: finance@architechts.nl
