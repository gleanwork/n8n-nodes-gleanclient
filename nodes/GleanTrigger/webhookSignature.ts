import { createHmac, timingSafeEqual } from 'crypto';

const SECRET_PREFIX = 'whsec_';
const SIGNATURE_VERSION = 'v1';
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

// Verifies a Standard Webhooks signature: HMAC-SHA256 over `{id}.{timestamp}.{rawBody}`.
export function verifyWebhookSignature(input: WebhookSignatureInput): boolean {
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

	const keyBytes = Buffer.from(secret.slice(SECRET_PREFIX.length), 'base64');
	const signedString = `${id}.${timestamp}.${rawBody}`;
	const expected = createHmac('sha256', keyBytes).update(signedString).digest('base64');
	const expectedBuf = Buffer.from(`${SIGNATURE_VERSION},${expected}`);

	for (const token of signatureHeader.split(' ')) {
		const tokenBuf = Buffer.from(token);
		if (tokenBuf.length === expectedBuf.length && timingSafeEqual(tokenBuf, expectedBuf)) {
			return true;
		}
	}
	return false;
}
