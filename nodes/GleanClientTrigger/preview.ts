import type { IHookFunctions, IDataObject, JsonObject } from 'n8n-workflow';
import { sleep, NodeApiError } from 'n8n-workflow';
import { randomBytes, randomUUID } from 'crypto';

import { gleanApiRequest } from './apiClient';
import { signWebhookPayload, WEBHOOK_HEADERS } from './webhookSignature';
import {
	APPLICATION_JSON,
	CONTENT_TYPE_HEADER,
	EVENTS_SEARCH_PAGE_SIZE,
	PREVIEW_DELIVERY_ATTEMPTS,
	PREVIEW_EVENT_ID_PREFIX,
	SELF_DELIVER_DELAY_MS,
	presetEventsSearchPath,
} from './constants';

// Standard Webhooks secret (`whsec_<base64>`), minted locally for a test self-delivery so the
// webhook handler can verify it exactly as it would a real Glean-issued secret.
export function generateEphemeralSecret(): string {
	return `whsec_${randomBytes(32).toString('base64')}`;
}

// Search the preset's recent events (last 7 days). Returns the newest matches, or [] if none.
// Awaited in create() so an API error or empty result fails the Execute fast instead of hanging.
export async function fetchRecentPresetEvents(
	this: IHookFunctions,
	presetId: string,
	inputs: IDataObject,
): Promise<IDataObject[]> {
	const response = await gleanApiRequest.call(this, 'POST', presetEventsSearchPath(presetId), {
		inputs,
		page_size: EVENTS_SEARCH_PAGE_SIZE,
	});
	return (response.results as IDataObject[] | undefined) ?? [];
}

// HMAC-sign one recent event and POST it to n8n's own test webhook so the manual Execute resolves
// with a real sample (a single object, matching a live delivery). n8n only activates the test route
// after create() returns, so this runs fire-and-forget and retries until the route is live; the
// final failure propagates so the caller can surface it rather than hanging silently.
export async function deliverPreviewEvent(
	this: IHookFunctions,
	webhookUrl: string,
	secret: string,
	event: IDataObject,
): Promise<void> {
	const rawBody = JSON.stringify(event);
	const id = `${PREVIEW_EVENT_ID_PREFIX}${randomUUID()}`;
	const timestamp = Math.floor(Date.now() / 1000).toString();
	const headers = {
		[CONTENT_TYPE_HEADER]: APPLICATION_JSON,
		[WEBHOOK_HEADERS.id]: id,
		[WEBHOOK_HEADERS.timestamp]: timestamp,
		[WEBHOOK_HEADERS.signature]: signWebhookPayload(secret, id, timestamp, rawBody),
	};

	for (let attempt = 1; attempt <= PREVIEW_DELIVERY_ATTEMPTS; attempt++) {
		await sleep(SELF_DELIVER_DELAY_MS);
		try {
			await this.helpers.httpRequest({ method: 'POST', url: webhookUrl, body: rawBody, headers });
			return;
		} catch (error) {
			if (attempt === PREVIEW_DELIVERY_ATTEMPTS) {
				throw new NodeApiError(this.getNode(), error as JsonObject);
			}
		}
	}
}
