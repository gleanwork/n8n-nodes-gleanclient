// Must match each credential class's `name`.
export const CREDENTIAL_OAUTH2 = 'gleanOAuth2Api';
export const CREDENTIAL_API_KEY = 'gleanTriggerApi';

export const TRIGGERS_PATH = '/triggers';
export const TRIGGER_PRESETS_PATH = '/trigger-presets';

export const triggerPath = (triggerId: string): string => `${TRIGGERS_PATH}/${triggerId}`;
export const presetPath = (presetId: string): string => `${TRIGGER_PRESETS_PATH}/${presetId}`;
export const presetInputValuesPath = (presetId: string): string =>
	`${presetPath(presetId)}/input-values`;

export const PRESET_PAGE_SIZE = 100;
// Safety cap against a misbehaving has_more.
export const MAX_PRESET_PAGES = 50;

export const WEBHOOK_RESPONSES = {
	unprovisioned: {
		status: 500,
		message: 'Webhook is not provisioned yet — re-activate the workflow',
	},
	invalidSignature: { status: 401, message: 'Invalid webhook signature' },
} as const;
