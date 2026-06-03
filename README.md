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
- Select entities and fields dynamically
- Execute custom methods on Creatio models
- Store and manage multiple Creatio credentials

### Usage

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
