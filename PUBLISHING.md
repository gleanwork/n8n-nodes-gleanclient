# Publishing Guide for @gleanwork/n8n-nodes-gleanclient

This document outlines the steps to publish the n8n-nodes-gleanclient package under the @gleanwork npm organization.

## Prerequisites

1. **npm Organization Access**: The publisher must be added to the @gleanwork npm organization with publish permissions.
2. **npm Authentication**: The publisher must be logged in to npm with proper credentials.

## One-Time Setup

### 1. Add Publisher to @gleanwork npm Organization

This requires an npm organization admin to:
1. Log in to https://www.npmjs.com/
2. Navigate to the @gleanwork organization
3. Go to Members/Teams
4. Add the user (e.g., `dejim-juang-glean`) with publish permissions

### 2. Authenticate with npm

```bash
npm login
```

Follow the prompts to log in with your npm account that has access to the @gleanwork organization.

### 3. Verify Organization Access

```bash
npm org ls @gleanwork
```

This should list you as a member with appropriate permissions.

## Publishing Process

### 1. Prepare for Release

Ensure all changes are committed and the version is updated:

```bash
# Update version in package.json (if not already done)
npm version patch  # or minor, or major

# Build the project
npm run build

# Run linting
npm run lint
```

### 2. Publish to npm

For the first publish of a scoped package, you need to specify public access:

```bash
npm publish --access public
```

For subsequent publishes:

```bash
npm publish
```

### 3. Verify Publication

Check that the package is available:

```bash
npm view @gleanwork/n8n-nodes-gleanclient
```

Or visit: https://www.npmjs.com/package/@gleanwork/n8n-nodes-gleanclient

## Migration from Old Package

After successfully publishing `@gleanwork/n8n-nodes-gleanclient`, the old `n8n-nodes-gleanclient` package should be deprecated:

### 1. Deprecate the Old Package

```bash
npm deprecate n8n-nodes-gleanclient "This package has been moved to @gleanwork/n8n-nodes-gleanclient. Please update your dependencies."
```

### 2. Update Documentation

Ensure the following are updated:
- README.md (if it mentions the package name)
- n8n community nodes listing
- Any Glean documentation referencing the package

## Automated Publishing (Future Enhancement)

Consider setting up GitHub Actions for automated publishing:

1. Create a `.github/workflows/publish.yml` workflow
2. Use GitHub Secrets to store NPM_TOKEN
3. Trigger on version tags (e.g., `v*`)
4. Run build and publish steps automatically

Example workflow structure:
```yaml
name: Publish to npm
on:
  push:
    tags:
      - 'v*'
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm run lint
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Troubleshooting

### Permission Denied
If you get a 403 error, verify:
- You're logged in to npm (`npm whoami`)
- You're a member of @gleanwork org (`npm org ls @gleanwork`)
- The organization admin has granted you publish permissions

### Package Already Exists
If the package already exists and you don't have permissions, contact the @gleanwork npm org admin.

### Build Failures
Ensure all dependencies are installed and the build passes locally before publishing:
```bash
npm ci
npm run build
npm run lint
```

## Support

For issues with:
- npm organization access: Contact Glean IT or the npm org admin
- Publishing workflow: Contact the repository maintainers
- Package bugs: Open an issue on https://github.com/gleanwork/n8n-nodes-gleanclient
