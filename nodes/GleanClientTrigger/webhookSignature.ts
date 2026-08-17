import type { IWebhookFunctions } from 'n8n-workflow';
import { createHmac, timingSafeEqual } from 'crypto';

const SECRET_PREFIX = 'whsec_';
const SIGNATURE_VERSION = 'v1';

// Standard Webhooks header names — used both to sign outbound and to verify inbound deliveries.
export const WEBHOOK_HEADERS = {
	id: 'webhook-id',
	timestamp: 'webhook-timestamp',
	signature: 'webhook-signature',
} as const;
// Recommended replay window is 5 minutes (Standard Webhooks spec).
const DEFAULT_TOLERANCE_SECONDS = 300;

interface WebhookSignatureInput {
	id?: string;
	timestamp?: string;
	// Space-delimited list of `v1,<base64>` signatures (the `webhook-signature` header).
	signatureHeader?: string;
	rawBody: string;
	// Standard Webhooks secret: `whsec_<base64>`.
	secret: string;
	// Replay window in seconds; deliveries outside it are rejected.
	toleranceSeconds?: number;
}

// HMAC-SHA256 over `{id}.{timestamp}.{rawBody}`, base64 — the shared core of sign and verify.
function computeSignature(secret: string, id: string, timestamp: string, rawBody: string): string {
	const keyBytes = Buffer.from(secret.slice(SECRET_PREFIX.length), 'base64');
	return createHmac('sha256', keyBytes).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
}

// Builds a Standard Webhooks signature header value for self-delivering a preview event to n8n's
// own test webhook. Mirrors the verifier below.
export function signWebhookPayload(
	secret: string,
	id: string,
	timestamp: string,
	rawBody: string,
): string {
	return `${SIGNATURE_VERSION},${computeSignature(secret, id, timestamp, rawBody)}`;
}

// Verifies a Standard Webhooks signature: HMAC-SHA256 over `{id}.{timestamp}.{rawBody}`.
function verifyWebhookSignature(input: WebhookSignatureInput): boolean {
	const {
		id,
		timestamp,
		signatureHeader,
		rawBody,
		secret,
		toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
	} = input;

	if (!secret.startsWith(SECRET_PREFIX)) return false;
	if (!id || !timestamp || !signatureHeader) return false;
	if (!rawBody) return false;

	// A non-numeric timestamp must fail closed — NaN comparisons are always false,
	// which would otherwise silently skip the replay-window check.
	const ts = parseInt(timestamp, 10);
	if (Number.isNaN(ts)) return false;
	const now = Math.floor(Date.now() / 1000);
	if (Math.abs(now - ts) > toleranceSeconds) return false;

	const expected = computeSignature(secret, id, timestamp, rawBody);
	const expectedBuf = Buffer.from(`${SIGNATURE_VERSION},${expected}`);

	for (const token of signatureHeader.split(' ')) {
		const tokenBuf = Buffer.from(token);
		if (tokenBuf.length === expectedBuf.length && timingSafeEqual(tokenBuf, expectedBuf)) {
			return true;
		}
	}
	return false;
}

// Verifies the Standard Webhooks headers on an incoming n8n webhook request.
export function verifyStandardWebhookSignature(this: IWebhookFunctions, secret: string): boolean {
	const req = this.getRequestObject();
	const rawBody = req.rawBody;
	const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody ?? '');

	return verifyWebhookSignature({
		id: req.header(WEBHOOK_HEADERS.id),
		timestamp: req.header(WEBHOOK_HEADERS.timestamp),
		signatureHeader: req.header(WEBHOOK_HEADERS.signature),
		rawBody: bodyStr,
		secret,
	});
}
