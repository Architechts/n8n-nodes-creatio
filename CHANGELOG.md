# Changelog

All notable changes to this project are documented here.

## 0.4.0

### Added

- **Conventional `resource` + `operation` structure (node typeVersion 2).** New Creatio
  nodes follow n8n's standard Resource → Operation shape:
  - `record` → `get` / `create` / `update` / `delete`
  - `file` → `upload` / `download`
  - `schema` → `getFields` / `listTables`

  Parameter names (`subpath`, `id`, `fields`, `select`, `top`, `filter`, `expand`,
  `useBody`, `body`, `appendRequest`, file/download params) are stable and documented,
  making programmatic edits (`parameters.<name>` by node id) predictable for the n8n
  public API and n8n-mcp tooling.

### Fixed

- **Zero-row GET no longer emits a placeholder item.** A list `GET` that matches no rows
  now outputs an empty array (0 items). A `GET` returning an empty/no-content body is also
  normalized to 0 items instead of a `{ json: '' }`/`{ json: {} }` placeholder.
  Note: the **Always Output Data** node setting still causes n8n core to inject one empty
  item — that is core behavior and is independent of this node (see README → Behavioral
  notes).
- **PATCH now sends explicit empty strings.** A field with `fieldValue: ''` is included in
  the PATCH body and clears the column. Only genuinely-absent fields (`undefined`) are
  skipped. The previous workaround of sending a single space `' '` is no longer needed.

### Compatibility

- Existing workflows are stored at `typeVersion: 1` and keep the legacy flat uppercase
  `operation` values (`GET`, `POST`, `PATCH`, `DELETE`, `METADATA`, `TABLES`, `UPLOAD`,
  `DOWNLOAD`). They execute unchanged — both shapes map to the same internal handlers.
  No migration is required.
