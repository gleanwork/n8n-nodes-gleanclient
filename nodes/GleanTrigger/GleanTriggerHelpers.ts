import {
	type IHookFunctions,
	type IWebhookFunctions,
	type ILoadOptionsFunctions,
	type IHttpRequestMethods,
	type IHttpRequestOptions,
	type IDataObject,
	sleep,
} from 'n8n-workflow';

import { randomUUID } from 'crypto';

import { signWebhookPayload, verifyWebhookSignature } from './webhookSignature';
import {
	CREDENTIAL_API_KEY,
	CREDENTIAL_OAUTH2,
	LIST_EVENTS_PATH,
	REPLAY_DELAY_MS,
	presetPath,
} from './constants';

// Robust 404 check across the shapes n8n/HTTP errors can take.
export function is404(error: unknown): boolean {
	const e = error as {
		httpCode?: string;
		statusCode?: number;
		response?: { statusCode?: number; status?: number };
	};
	return (
		e?.httpCode === '404' ||
		e?.statusCode === 404 ||
		e?.response?.statusCode === 404 ||
		e?.response?.status === 404
	);
}

function resolveCredentialType(
	ctx: IHookFunctions | IWebhookFunctions | ILoadOptionsFunctions,
): string {
	try {
		const auth = ctx.getNodeParameter('authentication', 'oAuth2') as string;
		if (auth === 'oAuth2') return CREDENTIAL_OAUTH2;
	} catch {
		// getNodeParameter can throw in contexts where the node's parameters aren't
		// in scope; default to the API-key credential in that case.
	}
	return CREDENTIAL_API_KEY;
}

// Both trigger credentials carry an explicit baseUrl. Fail loudly if it's
// missing rather than building requests against "undefined/api/...".
function resolveBaseUrl(credentials: IDataObject): string {
	const baseUrl = String(credentials.baseUrl ?? '')
		.trim()
		.replace(/\/+$/, '');
	if (!baseUrl) {
		throw new Error('Glean credential is missing a Base URL');
	}
	return baseUrl;
}

export async function gleanApiRequest(
	this: IHookFunctions | IWebhookFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	path: string,
	body: IDataObject = {},
	qs: IDataObject = {},
): Promise<IDataObject> {
	const credentialType = resolveCredentialType(this);
	const credentials = await this.getCredentials(credentialType);
	const baseUrl = resolveBaseUrl(credentials);

	// Platform trigger endpoints live under /api; client API paths are passed in full.
	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${path.startsWith('/rest/') ? '' : '/api'}${path}`,
		qs,
		json: true,
	};

	if (method !== 'GET' && method !== 'DELETE') {
		options.body = body;
	}

	return (await this.helpers.httpRequestWithAuthentication.call(
		this,
		credentialType,
		options,
	)) as IDataObject;
}

// Delivers the latest matching event, signed, to our own test webhook so testing
// doesn't wait on Glean. Still goes through the real webhook path.
export async function replayRecentEvent(
	this: IHookFunctions,
	webhookUrl: string,
	secret: string,
	presetId: string,
): Promise<void> {
	const presetResponse = await gleanApiRequest.call(this, 'GET', presetPath(presetId));
	const datasource = (presetResponse.trigger_preset as IDataObject | undefined)?.datasource as
		| string
		| undefined;

	const events = await gleanApiRequest.call(this, 'POST', LIST_EVENTS_PATH, {
		filter: datasource ? { datasources: [datasource] } : {},
		requestOptions: { pageSize: 1 },
	});
	const event = (events.events as IDataObject[] | undefined)?.[0];
	if (!event) return;

	const rawBody = JSON.stringify(event);
	const id = `msg_replay_${randomUUID()}`;
	const timestamp = Math.floor(Date.now() / 1000).toString();

	await sleep(REPLAY_DELAY_MS);

	await this.helpers.httpRequest({
		method: 'POST',
		url: webhookUrl,
		body: rawBody,
		headers: {
			'content-type': 'application/json',
			'webhook-id': id,
			'webhook-timestamp': timestamp,
			'webhook-signature': signWebhookPayload(secret, id, timestamp, rawBody),
		},
	});
}

export function verifyStandardWebhookSignature(this: IWebhookFunctions, secret: string): boolean {
	const req = this.getRequestObject();
	const rawBody = req.rawBody;
	const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody ?? '');

	return verifyWebhookSignature({
		id: req.header('webhook-id'),
		timestamp: req.header('webhook-timestamp'),
		signatureHeader: req.header('webhook-signature'),
		rawBody: bodyStr,
		secret,
	});
}
