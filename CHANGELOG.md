# Changelog

## 0.4.2

- Glean Trigger: send `X-Glean-Include-Experimental: true` on Platform API calls and the credential test. Without it the experimental triggers endpoints 404.

## 0.4.1

- Glean Trigger: no longer declares `usableAsTool` — trigger nodes can't be invoked as AI tools, so it's kept out of the AI tool picker (satisfies the n8n community-node scanner's `node-usable-as-tool`). Bumps `@n8n/eslint-plugin-community-nodes` and `@n8n/node-cli` so `lint:community` enforces this pre-merge.

## 0.4.0

- Glean Trigger: preset input **value discovery** — picklist inputs offer a searchable, live-fetched value list; free-text inputs are entered directly ("By Value").
- Glean Trigger: **event preview** on manual _Execute step_ — fetches a recent matching event and delivers it to the node (HMAC-verified) so you can preview the data before activating.

## 0.3.2

- Scope the codex `node` ids to the npm package name (`@gleanwork/n8n-nodes-gleanclient.*`), addressing n8n review feedback.
- Remove the hardcoded internal Base URL default from the Glean Client API credential; use an empty default with a placeholder, matching the Glean Trigger API credential.

## 0.3.1

- Log (instead of silently swallowing) errors when cleaning up a stale trigger during re-creation, satisfying n8n's community-node scanner (`no-silent-error-swallowing`).

## 0.3.0

- Introduce the Glean Trigger node (preset-based, HMAC-verified webhooks) and its credentials (Glean OAuth2 and Glean Trigger API).
- Group the Glean Trigger under the Glean app in the node creator and mark it experimental.

## 0.2.0

- Initial Glean Client (search) node and Glean Client API credential.
