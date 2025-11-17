# Migration Checklist: n8n-nodes-gleanclient → @gleanwork/n8n-nodes-gleanclient

This checklist tracks the migration of the n8n-nodes-gleanclient package from a personal npm package to the official @gleanwork organization.

## Completed ✓

- [x] Move repository from djuang1/n8n-nodes-gleanclient to gleanwork/n8n-nodes-gleanclient
- [x] Update LICENSE to MIT with Glean Work, Inc. as copyright holder
- [x] Update package.json name to @gleanwork/n8n-nodes-gleanclient
- [x] Update package.json repository URL to point to gleanwork org
- [x] Bump version to 0.2.0 for the migration
- [x] Update README.md with new package name and migration notice
- [x] Create PUBLISHING.md with comprehensive publishing instructions
- [x] Update version history in README.md

## Pending - Manual Steps Required

### npm Organization Setup

- [ ] **Add user to @gleanwork npm organization**
  - Action: npm org admin must add `dejim-juang-glean` (or appropriate user) to @gleanwork organization
  - Who: npm organization administrator for @gleanwork
  - How: See PUBLISHING.md section "Add Publisher to @gleanwork npm Organization"

### Package Publishing

- [ ] **Publish @gleanwork/n8n-nodes-gleanclient to npm**
  - Action: Run `npm publish --access public` after building
  - Who: User with @gleanwork npm org publish permissions
  - Prerequisite: Must be added to org first
  - How: See PUBLISHING.md section "Publishing Process"

- [ ] **Verify package publication**
  - Action: Visit https://www.npmjs.com/package/@gleanwork/n8n-nodes-gleanclient
  - Action: Run `npm view @gleanwork/n8n-nodes-gleanclient`

### Legacy Package Deprecation

- [ ] **Deprecate old n8n-nodes-gleanclient package**
  - Action: Run deprecation command for the old package
  - Who: Original package owner (dejim-juang-glean or account with access)
  - Command: `npm deprecate n8n-nodes-gleanclient "This package has been moved to @gleanwork/n8n-nodes-gleanclient. Please update your dependencies."`

### Documentation and Communication

- [ ] **Update n8n community nodes listing**
  - Action: Update any n8n community registry entries to point to new package
  - Where: https://www.npmjs.com/package/n8n-nodes-gleanclient (update description/readme)

- [ ] **Notify customers**
  - Action: Respond to the escalation ticket (via Samir Aljabar)
  - Message template: "The n8n-nodes-gleanclient package has been successfully migrated to the official @gleanwork GitHub organization and will be published to npm as @gleanwork/n8n-nodes-gleanclient. Users should update their dependencies to use the new scoped package name."

- [ ] **Update Glean internal documentation**
  - Action: Update any internal docs that reference the old package name
  - Action: Add migration guide for existing users

### Future Enhancements (Optional)

- [ ] **Set up automated publishing workflow**
  - Action: Create GitHub Actions workflow for npm publishing
  - Reference: See PUBLISHING.md section "Automated Publishing"

- [ ] **Configure npm provenance**
  - Action: Enable npm provenance for supply chain security
  - How: Use `--provenance` flag when publishing or configure in workflow

## Responsible Parties

- **Repository Migration**: Dejim Juang ✓ (Completed)
- **npm Org Access**: @gleanwork npm org administrator
- **Package Publishing**: Dejim Juang (after org access granted)
- **Old Package Deprecation**: Dejim Juang
- **Customer Communication**: Samir Aljabar / Customer Success team

## Timeline

- **Repository Migration**: Completed November 17, 2025
- **Target for npm Publishing**: TBD (pending org access)
- **Target for Customer Notification**: Within 24 hours of npm publication

## References

- GitHub Repository: https://github.com/gleanwork/n8n-nodes-gleanclient
- npm Package (new): https://www.npmjs.com/package/@gleanwork/n8n-nodes-gleanclient (pending publication)
- npm Package (old): https://www.npmjs.com/package/n8n-nodes-gleanclient
- Slack Thread: https://askscio.slack.com/archives/C03F3JNP9HP/p1763151812509629
- Publishing Guide: See PUBLISHING.md in this repository
