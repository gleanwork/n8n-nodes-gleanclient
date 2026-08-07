# Changelog

## 0.3.1

- Log (instead of silently swallowing) errors when cleaning up a stale trigger during re-creation, satisfying n8n's community-node scanner (`no-silent-error-swallowing`).

## 0.3.0

- Introduce the Glean Trigger node (preset-based, HMAC-verified webhooks) and its credentials (Glean OAuth2 and Glean Trigger API).
- Group the Glean Trigger under the Glean app in the node creator and mark it experimental.

## 0.2.0

- Initial Glean Client (search) node and Glean Client API credential.
