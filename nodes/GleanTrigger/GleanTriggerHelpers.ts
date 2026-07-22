import { createHmac, timingSafeEqual } from 'crypto';
import type {
	IHookFunctions,
	IWebhookFunctions,
	ILoadOptionsFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	IDataObject,
} from 'n8n-workflow';

// Resolve which credential the node is configured to use (API key or OAuth2).
function resolveCredentialType(
	ctx: IHookFunctions | IWebhookFunctions | ILoadOptionsFunctions,
): string {
	try {
		const auth = ctx.getNodeParameter('authentication', 'oAuth2') as string;
		if (auth === 'oAuth2') return 'gleanOAuth2Api';
	} catch {
		// authentication param not available in this context; fall through to default
	}
	return 'gleanClientApi';
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
	const baseUrl = String(credentials.baseUrl).replace(/\/$/, '');

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}/api${path}`,
		headers: { 'Content-Type': 'application/json' },
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

// Standard Webhooks verification: HMAC-SHA256 over `{id}.{timestamp}.{rawBody}`,
// secret is `whsec_<base64>` (strip prefix, base64-decode for the key), header is
// a space-delimited list of `v1,<base64>` signatures.
export function verifyStandardWebhookSignature(this: IWebhookFunctions, secret: string): boolean {
	if (!secret.startsWith('whsec_')) return false;
	const keyBytes = Buffer.from(secret.slice('whsec_'.length), 'base64');

	const req = this.getRequestObject();
	const id = req.header('webhook-id');
	const ts = req.header('webhook-timestamp');
	const sigHeader = req.header('webhook-signature');
	if (!id || !ts || !sigHeader) return false;

	// Replay protection: reject deliveries older than 5 minutes.
	const now = Math.floor(Date.now() / 1000);
	if (Math.abs(now - parseInt(ts, 10)) > 300) return false;

	const rawBody = req.rawBody;
	if (!rawBody) return false;
	const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);

	const signedString = `${id}.${ts}.${bodyStr}`;
	const expected = createHmac('sha256', keyBytes).update(signedString).digest('base64');
	const expectedToken = `v1,${expected}`;
	const expectedBuf = Buffer.from(expectedToken);

	for (const token of sigHeader.split(' ')) {
		const tokenBuf = Buffer.from(token);
		if (tokenBuf.length === expectedBuf.length && timingSafeEqual(tokenBuf, expectedBuf)) {
			return true;
		}
	}
	return false;
}
