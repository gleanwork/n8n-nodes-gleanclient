# AGENTS.md

## Project Overview

This is an n8n community node package that integrates the Glean Client API into n8n workflows. It enables n8n users to query the Glean Work AI platform's search index directly within their automation workflows.

**Type**: n8n Community Node Package
**Language**: TypeScript (strict mode)
**Package Manager**: pnpm (not npm)

## Code Conventions & Standards

### TypeScript & Type Safety

- **Strict mode enforced**: All files must pass TypeScript strict type checking
- **No implicit any**: Type all parameters, return values, and object shapes explicitly
- **Use n8n interfaces**: Implement `INodeType`, `ICredentialType`, and related interfaces from `n8n-workflow`
- **No type assertions**: Avoid `as` casts; if types don't align, fix the source

### Package Management

- **Use pnpm, not npm**: This project uses pnpm exclusively
- **Why pnpm**: More efficient disk usage, faster installations, better monorepo support, strict dependency resolution
- **Install**: `pnpm install` (not `npm install`)
- **Add packages**: `pnpm add` (not `npm install`)
- **Lock file**: `pnpm-lock.yaml` is authoritative; commit it

### Code Quality Standards

#### Linting & Formatting

- **Linter**: ESLint with n8n-specific rules (`eslint-plugin-n8n-nodes-base`)
- **Always run before commit**: `pnpm run lint:fix`
- **Prepublish validation**: Stricter ESLint rules apply via `.eslintrc.prepublish.js`
- **Formatter**: Prettier for consistent style
- **Format before committing**: `pnpm run format`

#### Build & Compilation

- **Always build before testing**: `pnpm run build`
- **TypeScript output goes to `dist/`**: This is what gets published
- **Watch mode available**: `pnpm run dev` for development iteration
- **Verify clean builds**: After code changes, ensure no build errors

## Architecture & Extensibility

### Node Design Pattern

This package follows a **single-node, single-operation** pattern for simplicity:

- One node class (`GleanClient`) implements `INodeType`
- One credential type (`GleanClientApi`) implements `ICredentialType`
- Operations are defined as routing options within the node

**When adding features**: Follow this structure consistently. Don't split into multiple node files unless there's a compelling reason.

### Credentials & Authentication

The credential type handles three responsibilities:

1. **Configuration fields**: Where users input base URL and API key
2. **Authentication injection**: Automatically adds Bearer token to all requests
3. **Credential validation**: Tests credentials on save

This means new operations inherit authentication automatically without duplicating auth logic.

### n8n Tool Integration

The node is marked as `usableAsTool: true`, enabling use by n8n's AI Agent features. This requires:

- Clear, well-named parameters (e.g., `query` is descriptive)
- Predictable, structured output from the API
- Documentation of what the node does (via `description` field)

When extending with new operations, maintain this property and ensure new parameters are clear.

## Development Workflow

### Making Changes

1. **Make code changes**: Write TypeScript with strict typing
2. **Format & lint**: `pnpm run format && pnpm run lint:fix`
3. **Build**: `pnpm run build` (verifies TypeScript compilation)
4. **Test**: Verify in n8n environment or with test harness

### Adding a New Operation

1. Define a new routing option in the `properties` array of `GleanClient.node.ts`
2. Specify the HTTP method, URL path, and request body shape
3. Use `displayOptions` to conditionally show parameters
4. Run `pnpm run build` to verify TypeScript compilation
5. Test in n8n UI to ensure routing works end-to-end

### Modifying Credentials

1. Update the `properties` array in `GleanClientApi.credentials.ts` for UI fields
2. Update `IAuthenticateGeneric` if the auth method changes
3. Update `ICredentialTestRequest` if the test endpoint changes
4. Verify types are explicit and correct

### Adding Dependencies

Only add packages that are necessary. Justify new dependencies as they increase bundle size.

- **Peer dependencies**: `n8n-workflow` (required for n8n framework interfaces)
- **Dev dependencies**: Only for build, lint, and type checking tools
- **Avoid runtime dependencies**: Keep the package lightweight for community distribution

## Testing & Publishing

### Pre-publish Checklist

- **Automatic on publish**: `prepublishOnly` runs automatically when you run `pnpm publish`
- **Manual validation** (optional, recommended): Run `pnpm run prepublishOnly` beforehand to catch errors early
  - Full TypeScript build
  - ESLint validation with stricter prepublish rules
- Verify `dist/` folder contains compiled `.js` and `.d.ts` files
- Check that no linting errors appear

### Publishing to npm

Only the `dist/` folder is published (configured in `files` field of `package.json`). Manually update the `version` field in `package.json` before publishing (this project has no automated versioning).

## File Organization Rationale

- **`credentials/`**: All `ICredentialType` implementations
- **`nodes/`**: All `INodeType` implementations (one folder per node)
- **`dist/`**: Generated output, not committed (except initial setup)
- **`n8n` field in `package.json`**: Entry points for n8n to discover nodes and credentials

This structure follows n8n community node conventions for discoverability and compatibility.

## Integration with n8n

### How It Works

- n8n reads the `n8n` field in `package.json` to discover this package's nodes and credentials
- The compiled files in `dist/` are loaded at runtime
- Credentials are registered globally; nodes can reference them by name
- The routing definition in each node tells n8n how to construct HTTP requests

### Extending for n8n Features

When adding features that leverage n8n's framework:

- Use n8n's expression language (`{{$parameter.fieldName}}`) for dynamic values
- Leverage n8n's request handling via routing definitions
- Keep operations simple; let n8n handle HTTP details

## Key Principles

1. **Simple and focused**: One node, clear purpose, easy to understand and maintain
2. **Type-safe**: Strict TypeScript throughout; no implicit any
3. **Consistent tooling**: pnpm, ESLint, Prettier—use them consistently
4. **n8n first**: Follow n8n patterns and interfaces; don't reinvent
5. **Minimal dependencies**: Keep the package lightweight for distribution
6. **Clear code**: No overly specific comments (code should be self-documenting); explain _why_, not _what_
