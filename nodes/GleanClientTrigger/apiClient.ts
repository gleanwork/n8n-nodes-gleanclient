import type {
	IHookFunctions,
	IWebhookFunctions,
	ILoadOptionsFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	IDataObject,
} from 'n8n-workflow';

import { CREDENTIAL_API_KEY, CREDENTIAL_OAUTH2 } from './constants';

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

// Robust 400 check across the shapes n8n/HTTP errors can take.
export function is400(error: unknown): boolean {
	const e = error as {
		httpCode?: string;
		statusCode?: number;
		response?: { statusCode?: number; status?: number };
	};
	return (
		e?.httpCode === '400' ||
		e?.statusCode === 400 ||
		e?.response?.statusCode === 400 ||
		e?.response?.status === 400
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

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}/api${path}`,
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
