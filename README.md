# n8n-nodes-gleanclient

This is an n8n community node. It lets you use [Glean](https://www.glean.com/) in your n8n workflows — both to **query** Glean (search) and to **trigger** workflows when content changes across the datasources connected to Glean.

The Glean Work AI platform lets you embed enterprise search, chat, and agent capabilities into your applications while honoring source‑system permissions by default.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)
[Nodes](#nodes)
[Credentials](#credentials)
[Example workflows](#example-workflows)
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
2. **Fill inputs** — each preset advertises the fields it accepts. Required fields are marked **(required)** and must be set; optional fields can be left blank to match broadly. Picklist inputs offer a searchable, live-fetched value list (**From List**); free-text inputs are typed directly (**By Value**).
3. **Publish/activate** — the node registers a trigger with Glean and stores the signing secret; deactivating removes the trigger.
4. **Receive events** — Glean POSTs signed events to the node's webhook URL; the node verifies the signature and passes the event to the rest of your workflow.

Notes:
- **Preview while building** — click **Execute step** to fetch a recent matching event and preview the data you'll receive before going live. Live events appear in the executions list once the workflow is active, not here.
- The n8n instance must be reachable by Glean at a **public HTTPS** URL (n8n Cloud, or self-hosted with `WEBHOOK_URL` set) so events can be delivered.
- Event payloads are thin by default (document metadata + a link), not full document bodies.

## Credentials

**Glean Trigger** node — pick an auth method via the **Authentication** field:

- **Glean OAuth2 API** — recommended. Enter your Glean deployment Base URL and the OAuth Client ID registered on your deployment, then click **Connect** to authorize (PKCE, no secret).
- **Glean Trigger API** — an API token. Enter your Glean deployment Base URL and a Glean API token with the triggers scope.

**Glean** (search) node:

- **Glean Client API** — an API token. Enter your Glean deployment Base URL and a Glean API token with the search scope.

## Example workflows

**Notify Slack when a new Gong call is recorded** (Glean Trigger → Slack):

1. Add a **Glean Trigger** node. In **Trigger**, pick the Gong "New Gong call created" preset.
2. Connect a **Glean OAuth2 API** credential (enter your deployment URL, click **Connect**), then **publish/activate** the workflow — the node registers the trigger with Glean and stores the signing secret.
3. Add a **Slack → Send message** node after the trigger and map the call's title + link into the message.

When a new call is recorded in Gong, Glean POSTs a signed event to the node's webhook URL; the node verifies the HMAC signature and passes the event downstream, posting to Slack.

**Query Glean on demand** (Manual Trigger → Glean action node):

1. Add a **Manual Trigger** (or any trigger).
2. Add the **Glean** action node, connect a **Glean Client API** credential, and enter a search query.
3. Run the workflow — the node returns Glean results you can feed into downstream nodes or an AI Agent (the action node is usable as an AI Agent tool).

## Compatibility

Tested locally against n8n 2.34.6

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Glean Developers](https://developers.glean.com/)
- [Standard Webhooks](https://www.standardwebhooks.com/)

## Version history

See [CHANGELOG.md](CHANGELOG.md) for the full history. Highlights:

- **0.4.0** — Preset input value discovery (searchable value picker) and event preview on manual test.
- **0.3.0** — Glean Trigger node: preset-based, HMAC-verified webhooks.
- **0.2.0** — Glean (search) action node.
