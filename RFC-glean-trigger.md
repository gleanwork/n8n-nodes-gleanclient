# [RFC] Glean Trigger node for n8n

**Status**: Draft
**Author**: ashish.kumar2@glean.com
**Created**: 2026-06-08
**Companion repo**: this one — `@gleanwork/n8n-nodes-gleanclient`

## TL;DR

Extend this community node package with a **Glean Trigger** node that turns Glean content triggers into native n8n workflow triggers. User drags "Glean Trigger" into a workflow, picks data source + conditions, hits Activate — n8n calls Glean's API to register the trigger, stores the auto-generated secret invisibly, and HMAC-verifies every inbound delivery. No URL copy-paste, no manual secret handling, no hand-written verification code.

Equivalent UX to Stripe Trigger / Linear Trigger / GitHub Trigger in n8n today.

## Why now

Per the [external webhook spec](https://docs.google.com/document/d/1yfg4-AMsZQlUD1ZtpmAXtCM4g2T5qBC6_rsoGPtFOVE/edit) and June 2026 sync notes, n8n is the lighthouse partner for Glean's outbound webhook delivery story. The cleanest UX is "inverted setup" — user never leaves n8n, never sees URLs/secrets — which requires a partner-built integration node, exactly what this RFC specifies.

## Current state of this repo

- One node (`GleanClient`) with one action (`Search Glean`)
- One credential (`GleanClientApi`) using Bearer-token auth (base URL + API key)
- TypeScript strict mode, pnpm, eslint with `n8n-nodes-base` rules
- Pattern: declarative `routing` for HTTP calls (no procedural code)
- Marked `usableAsTool: true` for AI Agent integration

## Architecture overview

```
┌─ User in n8n ──────────────────────────────────────────────────────────┐
│                                                                         │
│   1. Drag "Glean Trigger" into workflow                                │
│   2. Connect Glean credential (reuses existing GleanClientApi)         │
│   3. Pick datasource (Jira/Gmail/Slack/...) — dropdown loaded via      │
│      loadOptions calling GET /triggers/templates                        │
│   4. Pick event reason (Created/Updated/...) — dropdown loaded via     │
│      loadOptions, scoped to selected datasource                         │
│   5. Add conditions (project=ENG, priority=P0, ...) — dynamic fields   │
│      hydrated to user's actual data access                              │
│   6. Pick payload mode (Standard/Thin/Fat)                              │
│   7. Click Activate                                                     │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ n8n calls webhookMethods.default.create()
                                  ▼
┌─ Inside the node, on activation ───────────────────────────────────────┐
│                                                                         │
│   const url    = this.getNodeWebhookUrl('default');                    │
│   const params = { datasource, reason, conditions, payload_mode };     │
│                                                                         │
│   POST {baseUrl}/rest/api/v1/triggers                                  │
│     Authorization: Bearer {apiKey}                                      │
│     Body: { name, watch: {...params}, delivery: { webhook: { url } } } │
│                                                                         │
│   Response: { id: "tr_abc", secret: "whsec_..." }                      │
│                                                                         │
│   Store both in workflowStaticData → never shown to user               │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
                                  │
        (later, on every matching event in Glean)
                                  │
                                  ▼
┌─ Glean → n8n delivery ────────────────────────────────────────────────┐
│                                                                         │
│   POST {n8n webhook URL}                                                │
│     webhook-id:        01HX...                                          │
│     webhook-timestamp: 1781002...                                       │
│     webhook-signature: v1,<base64-HMAC-SHA256(secret, id.ts.body)>     │
│     Body: { event payload per spec }                                    │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─ Node's webhook() handler ─────────────────────────────────────────────┐
│                                                                         │
│   const secret = workflowStaticData.secret;                            │
│   verify HMAC over {id}.{ts}.{raw body} → if invalid: return 401      │
│   timestamp freshness check (5min window)                              │
│   return { workflowData: [returnJsonArray(bodyData)] }                  │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                  Downstream n8n workflow nodes run
```

## Glean API prerequisites

The node depends on Glean exposing these public REST endpoints. **None exist publicly today**; tracking them here is the gating dependency.

| Endpoint | Purpose | Used by |
|---|---|---|
| `POST   /rest/api/v1/triggers` | Create trigger; returns `{id, secret}` | `webhookMethods.create` |
| `GET    /rest/api/v1/triggers/{id}` | Check trigger still exists | `webhookMethods.checkExists` |
| `DELETE /rest/api/v1/triggers/{id}` | Delete trigger | `webhookMethods.delete` |
| `GET    /rest/api/v1/triggers/templates` | List supported datasources + their event reasons | `loadOptions.getDatasources` |
| `GET    /rest/api/v1/triggers/templates?datasource={ds}` | List event reasons + condition schema + condition values for a datasource | `loadOptions.getEventReasons`, `getConditionKeys`, `getConditionValues` |
| `POST   /rest/api/v1/triggers/{id}/test` (optional) | Trigger a synthetic delivery using last N matching docs | n8n's "Listen for test event" button (later) |

Request/response shapes follow the external webhook spec. Required Bearer-token scope: `triggers:manage` (new scope).

## File structure to add

```
nodes/
  GleanClient/                  ← existing, untouched
    GleanClient.node.ts
    GleanClient.node.json
    glean.svg
  GleanTrigger/                 ← NEW
    GleanTrigger.node.ts        ← main node class (~250 LOC)
    GleanTrigger.node.json      ← n8n metadata for marketplace
    GleanTriggerHelpers.ts      ← HMAC verify + API helpers (~80 LOC)
    GleanTriggerLoadOptions.ts  ← loadOptions methods (~150 LOC)
    glean.svg                   ← icon (symlink or copy)
credentials/
  GleanClientApi.credentials.ts ← existing, reused
package.json                    ← add GleanTrigger to n8n.nodes array
```

Total new code: ~500 LOC.

## Skeleton code

### `nodes/GleanTrigger/GleanTrigger.node.ts`

```typescript
import {
  type IHookFunctions,
  type IWebhookFunctions,
  type ILoadOptionsFunctions,
  type INodePropertyOptions,
  type INodeType,
  type INodeTypeDescription,
  type IWebhookResponseData,
  NodeConnectionTypes,
} from 'n8n-workflow';

import { gleanApiRequest, verifyStandardWebhookSignature } from './GleanTriggerHelpers';
import {
  getDatasources,
  getEventReasons,
  getConditionKeys,
  getConditionValues,
} from './GleanTriggerLoadOptions';

export class GleanTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Glean Trigger',
    name: 'gleanTrigger',
    icon: 'file:glean.svg',
    group: ['trigger'],
    version: 1,
    subtitle: '={{$parameter["datasource"] + ": " + $parameter["eventReason"]}}',
    description: 'Starts the workflow when Glean content trigger events occur',
    defaults: { name: 'Glean Trigger' },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      { name: 'gleanClientApi', required: true },
    ],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        path: 'webhook',
      },
    ],
    properties: [
      {
        displayName: 'Data Source Name or ID',
        name: 'datasource',
        type: 'options',
        required: true,
        default: '',
        description:
          'Choose from the list of data sources connected to your Glean deployment',
        typeOptions: { loadOptionsMethod: 'getDatasources' },
      },
      {
        displayName: 'Event Reason Name or ID',
        name: 'eventReason',
        type: 'options',
        required: true,
        default: '',
        typeOptions: {
          loadOptionsMethod: 'getEventReasons',
          loadOptionsDependsOn: ['datasource'],
        },
      },
      {
        displayName: 'Conditions',
        name: 'conditions',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        default: {},
        placeholder: 'Add Condition',
        options: [
          {
            name: 'condition',
            displayName: 'Condition',
            values: [
              {
                displayName: 'Key Name or ID',
                name: 'key',
                type: 'options',
                default: '',
                typeOptions: {
                  loadOptionsMethod: 'getConditionKeys',
                  loadOptionsDependsOn: ['datasource'],
                },
              },
              {
                displayName: 'Value',
                name: 'value',
                type: 'string',
                default: '',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Payload Mode',
        name: 'payloadMode',
        type: 'options',
        options: [
          { name: 'Standard (recommended)', value: 'standard' },
          { name: 'Thin (URL + fetch links)', value: 'thin' },
          { name: 'Fat (full content; requires DPA)', value: 'fat' },
        ],
        default: 'standard',
      },
      {
        displayName: 'Trigger Name (Optional)',
        name: 'triggerName',
        type: 'string',
        default: '',
        placeholder: 'e.g. "P0 Bugs in ENG"',
        description: 'Human-friendly label visible in your Glean admin UI',
      },
    ],
  };

  methods = {
    loadOptions: {
      getDatasources,
      getEventReasons,
      getConditionKeys,
      getConditionValues,
    },
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');
        if (!webhookData.triggerId) return false;

        try {
          await gleanApiRequest.call(this, 'GET', `/triggers/${webhookData.triggerId}`);
          return true;
        } catch (error) {
          if (error.httpCode === '404') {
            delete webhookData.triggerId;
            delete webhookData.secret;
            return false;
          }
          throw error;
        }
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default');
        const datasource = this.getNodeParameter('datasource') as string;
        const eventReason = this.getNodeParameter('eventReason') as string;
        const conditionsRaw = this.getNodeParameter('conditions', {}) as {
          condition?: Array<{ key: string; value: string }>;
        };
        const payloadMode = this.getNodeParameter('payloadMode') as string;
        const name =
          (this.getNodeParameter('triggerName') as string) ||
          `n8n: ${datasource} ${eventReason}`;

        // Flatten condition array into a simple key/value object
        const conditions = (conditionsRaw.condition || []).reduce<Record<string, string>>(
          (acc, { key, value }) => {
            acc[key] = value;
            return acc;
          },
          {},
        );

        const body = {
          name,
          watch: { datasource, reason: eventReason, conditions },
          delivery: {
            webhook: { url: webhookUrl, payload_mode: payloadMode },
          },
        };

        const response = await gleanApiRequest.call(this, 'POST', '/triggers', body);

        if (!response.id || !response.delivery?.webhook?.secret) {
          throw new Error('Glean trigger creation response missing expected fields');
        }

        const webhookData = this.getWorkflowStaticData('node');
        webhookData.triggerId = response.id as string;
        webhookData.secret = response.delivery.webhook.secret as string;
        return true;
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');
        if (!webhookData.triggerId) return true;

        try {
          await gleanApiRequest.call(this, 'DELETE', `/triggers/${webhookData.triggerId}`);
        } catch (error) {
          // Best-effort cleanup; don't block workflow deletion
          return false;
        }

        delete webhookData.triggerId;
        delete webhookData.secret;
        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const webhookData = this.getWorkflowStaticData('node');
    const secret = webhookData.secret as string | undefined;

    if (!secret) {
      const res = this.getResponseObject();
      res.status(500).send('Webhook not provisioned').end();
      return { noWebhookResponse: true };
    }

    const valid = await verifyStandardWebhookSignature.call(this, secret);
    if (!valid) {
      const res = this.getResponseObject();
      res.status(401).send('Invalid signature').end();
      return { noWebhookResponse: true };
    }

    const bodyData = this.getBodyData();
    return {
      workflowData: [this.helpers.returnJsonArray(bodyData)],
    };
  }
}
```

### `nodes/GleanTrigger/GleanTriggerHelpers.ts`

```typescript
import { createHmac, timingSafeEqual } from 'crypto';
import type {
  IHookFunctions,
  IWebhookFunctions,
  ILoadOptionsFunctions,
  IHttpRequestMethods,
  IDataObject,
} from 'n8n-workflow';

/**
 * Wrapper around Glean's REST API. Reuses gleanClientApi credentials for
 * Bearer-token auth; baseUrl comes from credentials.
 */
export async function gleanApiRequest(
  this: IHookFunctions | IWebhookFunctions | ILoadOptionsFunctions,
  method: IHttpRequestMethods,
  path: string,
  body: IDataObject = {},
  qs: IDataObject = {},
): Promise<any> {
  const credentials = await this.getCredentials('gleanClientApi');
  const baseUrl = String(credentials.baseUrl).replace(/\/$/, '');

  const options = {
    method,
    url: `${baseUrl}/rest/api/v1${path}`,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' || method === 'DELETE' ? undefined : body,
    qs,
    json: true,
  };

  return await this.helpers.requestWithAuthentication.call(this, 'gleanClientApi', options);
}

/**
 * Standard Webhooks signature verification.
 * Signed string = `{webhook-id}.{webhook-timestamp}.{raw body bytes}`
 * Signature header = `v1,<base64> [v1,<rotated-base64>]`  (space-delimited)
 * Secret format    = `whsec_<base64>` — strip prefix and base64-decode for HMAC key.
 */
export async function verifyStandardWebhookSignature(
  this: IWebhookFunctions,
  secret: string,
): Promise<boolean> {
  if (!secret.startsWith('whsec_')) return false;
  const keyBytes = Buffer.from(secret.slice('whsec_'.length), 'base64');

  const req = this.getRequestObject();
  const id = req.header('webhook-id');
  const ts = req.header('webhook-timestamp');
  const sigHeader = req.header('webhook-signature');
  if (!id || !ts || !sigHeader) return false;

  // Freshness check (5 min replay window)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(String(ts), 10)) > 300) return false;

  // Raw body bytes — n8n preserves these on the request object
  const rawBody = req.rawBody;
  if (!rawBody) return false;
  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);

  const signedString = `${id}.${ts}.${bodyStr}`;
  const expected = createHmac('sha256', keyBytes).update(signedString).digest('base64');
  const expectedToken = `v1,${expected}`;
  const expectedBuf = Buffer.from(expectedToken);

  for (const token of String(sigHeader).split(' ')) {
    const tokenBuf = Buffer.from(token);
    if (tokenBuf.length === expectedBuf.length && timingSafeEqual(tokenBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}
```

### `nodes/GleanTrigger/GleanTriggerLoadOptions.ts`

```typescript
import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { gleanApiRequest } from './GleanTriggerHelpers';

export async function getDatasources(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  const response = await gleanApiRequest.call(this, 'GET', '/triggers/templates');
  return (response.datasources || []).map((ds: { name: string; displayName: string }) => ({
    name: ds.displayName,
    value: ds.name,
  }));
}

export async function getEventReasons(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  const datasource = this.getCurrentNodeParameter('datasource') as string;
  if (!datasource) return [];

  const response = await gleanApiRequest.call(
    this,
    'GET',
    '/triggers/templates',
    {},
    { datasource },
  );
  return (response.reasons || []).map((r: string) => ({ name: r, value: r }));
}

export async function getConditionKeys(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  const datasource = this.getCurrentNodeParameter('datasource') as string;
  if (!datasource) return [];

  const response = await gleanApiRequest.call(
    this,
    'GET',
    '/triggers/templates',
    {},
    { datasource },
  );
  return (response.conditions || []).map(
    (c: { key: string; displayName?: string }) => ({
      name: c.displayName || c.key,
      value: c.key,
    }),
  );
}

export async function getConditionValues(
  this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
  // Reserved for future PICKLIST-typed conditions — Glean returns enumerated values
  // per (datasource, conditionKey). For now condition values are free-text via the
  // `value` field; this loader is wired up for the future enhancement.
  return [];
}
```

## Design decisions

### D1. Reuse `GleanClientApi` credential, don't fork

The existing `GleanClientApi` is base URL + Bearer-token API key. The trigger node's lifecycle calls (`/triggers` CRUD) use the same auth. No need for a separate credential type. Future enhancement: add an OAuth2 credential alongside (similar to how Linear has both `linearApi` and `linearOAuth2Api`).

### D2. Stripe model for secret handling (Glean generates)

n8n calls `POST /triggers` with no secret → Glean generates `whsec_...` → returns it in the response → n8n stores in `workflowStaticData.secret` → user never sees it. Same pattern Stripe Trigger uses.

This requires Glean's `POST /triggers` API to support both "customer-supplied secret" and "auto-generate secret" modes (per the spec doc Appendix E recommendation).

### D3. Verify on receive, return 401 on mismatch

Mirrors Stripe Trigger and Linear Trigger. `webhook()` method:
1. Look up stored secret from `workflowStaticData`
2. Run Standard Webhooks verification over raw body
3. Invalid → return 401 to Glean → Glean stops retrying (4xx = permanent failure per spec)
4. Valid → return `{workflowData: [...]}` → downstream nodes execute

### D4. Inline HMAC verification, no `standardwebhooks` npm dependency

Per `AGENTS.md`: "Avoid runtime dependencies: Keep the package lightweight for community distribution." The Standard Webhooks math is ~20 lines of Node `crypto` — implement inline rather than add a runtime dep.

Tradeoff: if Standard Webhooks spec changes (e.g., adds asymmetric `v1a` signatures), we have to track it ourselves. Acceptable for V1; revisit if the spec evolves.

### D5. `loadOptions` for dropdowns, not free-text

Datasource, event reason, and condition keys are picklists hydrated from Glean's API. This is what makes the UX magical:
- User picks "Jira" → "Project" dropdown shows their actual Jira projects, not a text field
- Eliminates the "type the wrong project name → trigger never matches" failure mode
- Parallels Linear's `getTeams` loadOption

`loadOptionsDependsOn: ['datasource']` makes the dropdowns reactive — change datasource, dropdowns re-fetch.

### D6. `fixedCollection` for conditions, not a single object

n8n's `fixedCollection` lets the user add N condition rows dynamically — same UI as Linear's "Resources to listen to" or Stripe's "Events". Each condition is `{key, value}`. Simpler to reason about than a deeply-nested object.

### D7. Payload mode picker

Three options matching the spec doc (Standard / Thin / Fat). Default Standard. The node passes the choice through to Glean's `POST /triggers` body as `delivery.webhook.payload_mode`.

Fat option should be visually marked as "requires DPA" — could implement via a `notice`-type property that conditionally renders.

### D8. Don't try to test from inside the node

n8n's built-in "Listen for test event" + "Execute workflow" buttons already handle test-event reception. We don't need to add a Glean-side "send test event" button to the node — the user clicks n8n's native test button, then triggers a real Glean event from somewhere (or, post-API-V2, calls `POST /triggers/{id}/test` to synthesize one).

## Test plan

### Unit / integration (TS-side)

1. **HMAC verification** with the [Standard Webhooks spec test vector](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md) — secret `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSwsoHZAcOQ`, expected signature should match.
2. **Body-tampering rejection**: same test vector but one byte changed in body → `verifyStandardWebhookSignature` returns false.
3. **Stale timestamp rejection**: timestamp 6 min ago → returns false.
4. **Multi-signature rotation**: header with `v1,old v1,new` where new matches → returns true.
5. **Missing headers**: any of webhook-id / -timestamp / -signature missing → returns false.

### End-to-end with a real Glean deployment

1. Install this node into a local n8n instance (`npm link` or `pnpm install` from local path).
2. Add Glean credential pointing at a dev Glean deployment.
3. Drag in Glean Trigger node → pick `JIRA` / `CREATED` / no conditions → Activate workflow.
4. Verify in Glean's admin: a new trigger exists with the n8n webhook URL.
5. Create a real Jira ticket in the connected Jira instance.
6. Verify n8n workflow execution shows the event payload.
7. Deactivate workflow → verify Glean's trigger is deleted.
8. Tamper test: manually POST a request with a wrong signature to the n8n webhook URL → 401 returned.

### eslint + build

- `pnpm run lint:fix` should pass
- `pnpm run prepublishOnly` should pass (stricter prepublish rules)
- `pnpm run build` should produce `dist/nodes/GleanTrigger/GleanTrigger.node.js`

## Phased rollout

### Phase 0 (gating dependency — Glean side)
Ship the `POST/GET/DELETE /rest/api/v1/triggers` + `/triggers/templates` endpoints publicly. Owner: triggers infra team. Timeline TBD.

### Phase 1 (this RFC)
Build the Glean Trigger node in this repo. Internal pilot with 2-3 friendly customers using a manually-installed build.

### Phase 2 (post-pilot)
Publish to npm + submit to n8n's community-nodes verification list. Once verified, the node shows up under "Glean Trigger" in n8n's node catalog.

### Phase 3 (future)
- OAuth2 credential alongside Bearer-token (proper marketplace install flow)
- `getConditionValues` populated for PICKLIST conditions
- Multi-trigger node: pick N (datasource, reason) pairs in one node instead of one node per trigger
- "Test trigger" button using `POST /triggers/{id}/test` once that API ships
- Templates published to n8n.io workflow library showing common patterns (Glean Jira P0 → Slack, Glean Gmail urgent → Linear)

## Open questions

1. **Should the trigger node prompt for the `triggerName` or auto-generate?**
   Stripe auto-generates a description like "Created by n8n for workflow ID X." Linear lets users name it. We could do both — auto-default to "n8n: {datasource} {reason}" but allow override.

2. **What's the failure mode when Glean is unreachable during workflow activation?**
   Currently the `create()` throws → n8n marks the workflow as "failed to activate" with the API error. Acceptable but could be friendlier (retry, queue, etc.).

3. **What's the failure mode when a Glean credential is revoked while triggers exist?**
   Glean side: triggers keep firing but deliveries succeed (HMAC is independent of API auth). n8n side: the user can't deactivate (delete fails). Need to handle "credential gone but trigger still exists" — perhaps allow force-delete from n8n side that drops local state without calling Glean.

4. **Multi-user n8n instances and credential scoping**
   If two users in the same n8n instance install Glean Trigger with their own credentials, do triggers cross-pollinate? n8n's `workflowStaticData` is per-workflow, so no — each workflow has its own triggerId+secret. But worth documenting.

5. **Renaming or moving the n8n instance — does the webhook URL change?**
   Yes. `this.getNodeWebhookUrl()` is bound to the n8n instance's external URL. If that URL changes, all existing Glean triggers point at a dead URL. n8n's `checkExists` model handles this transparently (we'd PATCH or recreate on next activation), but we should document the operational implication.

6. **Should we support multiple triggers per node?**
   No for V1. One node = one trigger. Matches Linear / Stripe convention. Users who want N triggers add N nodes.

7. **Polling fallback for early adopters who don't have webhook delivery enabled in their Glean deployment?**
   Out of scope for V1. The trigger node is webhook-only; customers who can't use webhooks should stick with the Search action node.

## Cross-references

- External webhook spec: https://docs.google.com/document/d/1yfg4-AMsZQlUD1ZtpmAXtCM4g2T5qBC6_rsoGPtFOVE/edit
- Aaryan's [RFC] Triggers as a Platform: https://docs.google.com/document/d/1ehPvssBFahVMa76NV4Z2svN8064FFFE9HensSyHEvtI/edit
- Brain notes:
  - `~/brain/1-projects/content-triggers-channels/external-webhook-spec-doc.md`
  - `~/brain/1-projects/content-triggers-channels/platform-integration-recipes.md`
  - `~/brain/1-projects/content-triggers-channels/webhook-product-design-jun5.md`
- Reference implementations studied:
  - Linear Trigger: https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Linear/LinearTrigger.node.ts
  - Stripe Trigger: https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Stripe/StripeTrigger.node.ts
  - GitHub Trigger: https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Github/GithubTrigger.node.ts
- n8n community node docs: https://docs.n8n.io/integrations/creating-nodes/build/declarative-style-node/
- Standard Webhooks spec: https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md

## Appendix — Glean API request/response shapes (proposed)

### `POST /rest/api/v1/triggers`

**Request body:**
```json
{
  "name": "n8n: JIRA CREATED",
  "watch": {
    "datasource": "JIRA",
    "reason": "CREATED",
    "conditions": { "project": "ENG", "priority": "P0" }
  },
  "delivery": {
    "webhook": {
      "url": "https://acme.app.n8n.cloud/webhook/abc-def-ghi",
      "payload_mode": "standard"
      // secret omitted → Glean generates
    }
  }
}
```

**Response (201):**
```json
{
  "id": "tr_01HX...",
  "name": "n8n: JIRA CREATED",
  "watch": { /* echoed */ },
  "delivery": {
    "webhook": {
      "url": "https://acme.app.n8n.cloud/webhook/abc-def-ghi",
      "payload_mode": "standard",
      "secret": "whsec_K3vMRzwsKgKkInOSO+OCQwIYlYgvtkfdQqOgBgcdMmD=",
      "secret_display_expires_at": "2026-06-08T12:00:00Z"
    }
  },
  "created_at": "2026-06-08T11:50:00Z"
}
```

### `GET /rest/api/v1/triggers/templates`

**Response:**
```json
{
  "datasources": [
    { "name": "JIRA", "displayName": "Jira" },
    { "name": "GMAIL", "displayName": "Gmail" },
    { "name": "SLACK2", "displayName": "Slack" }
  ]
}
```

### `GET /rest/api/v1/triggers/templates?datasource=JIRA`

**Response:**
```json
{
  "datasource": "JIRA",
  "reasons": ["CREATED", "UPDATED", "COMMENTED"],
  "conditions": [
    { "key": "project", "displayName": "Project", "type": "PICKLIST",
      "values": ["ENG", "SALES", "INFRA"] },
    { "key": "priority", "displayName": "Priority", "type": "PICKLIST",
      "values": ["P0", "P1", "P2", "P3"] },
    { "key": "assignee", "displayName": "Assignee", "type": "USER" },
    { "key": "label", "displayName": "Label", "type": "TEXT" }
  ]
}
```

Condition values for PICKLIST types should be hydrated to the authenticated user's actual access (their Jira projects, their Gmail labels, etc.), not deployment-global lists.
