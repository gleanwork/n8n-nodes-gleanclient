// Must match each credential class's `name`.
export const CREDENTIAL_OAUTH2 = 'gleanOAuth2Api';
export const CREDENTIAL_API_KEY = 'gleanTriggerApi';

export const TRIGGERS_PATH = '/triggers';
export const TRIGGER_PRESETS_PATH = '/trigger-presets';

export const triggerPath = (triggerId: string): string => `${TRIGGERS_PATH}/${triggerId}`;
export const presetPath = (presetId: string): string => `${TRIGGER_PRESETS_PATH}/${presetId}`;
export const presetInputValuesPath = (presetId: string): string =>
	`${presetPath(presetId)}/input-values`;
export const presetEventsSearchPath = (presetId: string): string =>
	`${presetPath(presetId)}/events/search`;

export const PRESET_PAGE_SIZE = 100;
// Safety cap against a misbehaving has_more.
export const MAX_PRESET_PAGES = 50;

// The only input type /input-values can enumerate; everything else is free text.
export const INPUT_TYPE_PICKLIST = 'PICKLIST';
// Both load-options hooks re-fetch the same preset while a user fills one node in — the field
// dropdown once, the value locator on every keystroke. Long enough to collapse that burst, short
// enough that an edited preset shows up without restarting n8n.
export const PRESET_CACHE_TTL_MS = 15_000;

// Recent event pulled to preview a preset's document shape on manual test (one, like production).
export const EVENTS_SEARCH_PAGE_SIZE = 1;
// Give n8n a moment to register the test webhook before self-delivering to it.
export const SELF_DELIVER_DELAY_MS = 500;
// Retry the self-delivery: n8n only activates the test route after create() returns.
export const PREVIEW_DELIVERY_ATTEMPTS = 5;
export const CONTENT_TYPE_HEADER = 'content-type';
export const APPLICATION_JSON = 'application/json';
// The triggers API is x-glean-experimental; without this opt-in the backend 404s.
export const INCLUDE_EXPERIMENTAL_HEADER = 'X-Glean-Include-Experimental';
// Prefix for the synthetic webhook-id of a self-delivered preview event.
export const PREVIEW_EVENT_ID_PREFIX = 'msg_test_';
// n8n execution mode for editor "Execute" runs (vs 'trigger' for an active workflow).
export const MANUAL_MODE = 'manual';

export const WEBHOOK_RESPONSES = {
	unprovisioned: {
		status: 500,
		message: 'Webhook is not provisioned yet — re-activate the workflow',
	},
	invalidSignature: { status: 401, message: 'Invalid webhook signature' },
} as const;
