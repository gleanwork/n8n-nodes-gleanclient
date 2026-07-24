# n8n-nodes-gleanclient

This is an n8n community node. It lets you use [Glean](https://www.glean.com/) in your n8n workflows — both to **query** Glean (search) and to **trigger** workflows when content changes across the datasources connected to Glean.

The Glean Work AI platform lets you embed enterprise search, chat, and agent capabilities into your applications while honoring source‑system permissions by default.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)
[Nodes](#nodes)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Resources](#resources)
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Nodes

### Glean (action node)

Runs the Glean Client API search endpoint against your Glean instance, so a workflow can query enterprise content. Usable as an AI Agent tool.

### Glean Trigger

Starts a workflow when a Glean content-trigger event fires (e.g. a new high-priority Jira ticket, a Salesforce opportunity moving to Closed Won, a new email). Events are delivered from Glean to n8n over webhooks and verified with an HMAC signature ([Standard Webhooks](https://www.standardwebhooks.com/)).

How it works:

1. **Pick a Trigger** — choose a curated preset from the searchable dropdown (grouped by datasource). The list is fetched live from Glean, so it always reflects what your deployment supports.
2. **Fill inputs** (optional) — each preset advertises the fields it accepts (e.g. a Jira project); leave them blank to match broadly.
3. **Activate** — on activation the node registers a trigger with Glean and stores the signing secret; on deactivation it removes the trigger.
4. **Receive events** — Glean POSTs signed events to the node's webhook URL; the node verifies the signature and passes the event to the rest of your workflow.

Notes:
- The n8n instance must be reachable by Glean at a **public HTTPS** URL (n8n Cloud, or self-hosted with `WEBHOOK_URL` set) so events can be delivered.
- Event payloads are thin by default (document metadata + a link), not full document bodies.

## Credentials

The nodes support two authentication methods (selectable on the trigger node via the **Authentication** field):

- **Glean OAuth2 API** — recommended for the trigger node. You enter your Glean deployment URL and click **Connect** to authorize; no API key handling.
- **Glean Client API** — an API token. Enter your Glean deployment base URL and an API token. A Glean account with the appropriate scope is required.

## Compatibility

Tested locally against n8n 1.105.x and 2.x.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Glean Developers](https://developers.glean.com/)
- [Standard Webhooks](https://www.standardwebhooks.com/)

## Version history

- August 8, 2025 - 0.1.2 - First.
- August 8, 2025 - 0.1.3 - Fixed AI Agent tool usage.
- August 9, 2025 - 0.1.4 - Updated names and added credential test.
- August 9, 2025 - 0.1.5 - Fixed query body to pass the correct value.
- 0.2.0 - Added the Glean Trigger node (preset-based content triggers) with OAuth2 + API key auth.
