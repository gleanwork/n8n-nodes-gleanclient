import {
	type IHookFunctions,
	type IWebhookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookResponseData,
	type IDataObject,
	type INodePropertyCollection,
	type JsonObject,
	NodeConnectionTypes,
	NodeApiError,
	NodeOperationError,
} from 'n8n-workflow';

import { gleanApiRequest, is404 } from './apiClient';
import { verifyStandardWebhookSignature } from './webhookSignature';
import { generateEphemeralSecret, fetchRecentPresetEvents, deliverPreviewEvent } from './preview';
import {
	searchPresets,
	getPresetInputFields,
	searchInputValues,
} from './GleanClientTriggerLoadOptions';
import {
	TRIGGERS_PATH,
	WEBHOOK_RESPONSES,
	triggerPath,
	presetPath,
	MANUAL_MODE,
} from './constants';
import type { Preset, PresetInput } from './types';

// One input row: choose a field, then search or type its value.
function inputRow(): INodePropertyCollection {
	return {
		name: 'input',
		displayName: 'Input',
		values: [
			{
				displayName: 'Field Name or ID',
				name: 'field',
				type: 'options',
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				typeOptions: {
					loadOptionsMethod: 'getPresetInputFields',
					loadOptionsDependsOn: ['preset.value'],
				},
			},
			{
				displayName: 'Value',
				name: 'value',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				description: 'The value to match on. Search the list, or enter a value directly.',
				// Re-query when the sibling field changes, so the value list isn't served from the
				// cache populated before a field was picked.
				typeOptions: {
					loadOptionsDependsOn: ['&field', 'preset.value'],
				},
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'searchInputValues',
							searchable: true,
						},
					},
					{
						displayName: 'By Value',
						name: 'value',
						type: 'string',
					},
				],
			},
		],
	};
}

// Flatten the input collection into { field: value }. resourceLocator values arrive as
// { __rl, mode, value }; plain modes as a string.
function collectInputs(ctx: IHookFunctions): IDataObject {
	const inputs: IDataObject = {};
	const rows = ctx.getNodeParameter('inputs', {}) as {
		input?: Array<{ field: string; value: string | { value?: string } }>;
	};
	for (const i of rows.input ?? []) {
		if (!i.field) continue;
		const value = typeof i.value === 'object' ? (i.value?.value ?? '') : i.value;
		// Skip blanks: an added-but-unset row (or a free-text value typed but never picked from
		// the list) must not be sent as an empty filter that silently matches nothing.
		if (value === '') continue;
		inputs[i.field] = value;
	}
	return inputs;
}

// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool -- omitted: trigger nodes can't be AI tools; suppresses node-cli's stale 0.28.0 lint that still requires it
export class GleanClientTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Glean Trigger',
		name: 'gleanClientTrigger',
		icon: { light: 'file:../../icons/glean.svg', dark: 'file:../../icons/glean-dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["preset"]["cachedResultName"] || $parameter["preset"]["value"] || $parameter["preset"]}}',
		description: '[Experimental] Starts the workflow when a Glean content trigger fires',
		triggerPanel: {
			header: 'Preview a recent Glean event',
			executionsHelp: {
				inactive:
					"Click 'execute step' to preview a recent matching event so you can map the document shape for the next step. Nothing is registered and no live delivery happens here.<br /><br />Once published, every matching event triggers an execution — those appear in the <a data-key='executions'>executions list</a>, not here.",
				active:
					"Click 'execute step' to preview a recent matching event.<br /><br />This workflow is published, so live events also trigger executions — those appear in the <a data-key='executions'>executions list</a>, not here.",
			},
			activationHint: 'Publish the workflow to receive live Glean events as they happen.',
		},
		defaults: {
			name: 'Glean Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'gleanTriggerApi',
				required: true,
				displayOptions: { show: { authentication: ['apiKey'] } },
			},
			{
				name: 'gleanOAuth2Api',
				required: true,
				displayOptions: { show: { authentication: ['oAuth2'] } },
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
				// URL is registered with Glean internally, never copied by the user — hide the panel.
				ndvHideUrl: true,
			},
		],
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{ name: 'OAuth2', value: 'oAuth2' },
					{ name: 'API Key', value: 'apiKey' },
				],
				default: 'oAuth2',
			},
			{
				displayName: 'Trigger',
				name: 'preset',
				type: 'resourceLocator',
				required: true,
				default: { mode: 'list', value: '' },
				description: 'The Glean event to trigger on',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'searchPresets',
							searchable: true,
						},
					},
				],
			},
			{
				displayName: 'Inputs',
				name: 'inputs',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				placeholder: 'Add Input',
				description:
					'Filters for this trigger. Required fields are marked "(required)" and must all be set.',
				options: [inputRow()],
			},
		],
	};

	methods = {
		listSearch: {
			searchPresets,
			searchInputValues,
		},
		loadOptions: {
			getPresetInputFields,
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				if (!webhookData.triggerId) {
					return false;
				}
				try {
					await gleanApiRequest.call(this, 'GET', triggerPath(webhookData.triggerId as string));
					return true;
				} catch (error) {
					if (is404(error)) {
						delete webhookData.triggerId;
						delete webhookData.secret;
						return false;
					}
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				// Self-heal: drop any leftover trigger from a prior failed cleanup before creating a new one.
				if (webhookData.triggerId) {
					try {
						await gleanApiRequest.call(this, 'DELETE', triggerPath(webhookData.triggerId as string));
					} catch (error) {
						this.logger.warn(`Glean Trigger: failed to delete stale trigger before re-create: ${error}`);
					}
					delete webhookData.triggerId;
					delete webhookData.secret;
				}

				const webhookUrl = this.getNodeWebhookUrl('default');
				const preset = this.getNodeParameter('preset', undefined, { extractValue: true }) as string;
				const inputs = collectInputs(this);

				const presetResp = await gleanApiRequest.call(this, 'GET', presetPath(preset));
				const presetInputs: PresetInput[] = (presetResp.trigger_preset as Preset)?.inputs ?? [];
				const validFields = new Set(presetInputs.map((i) => i.field));

				// Switching the Trigger leaves stale rows from the old preset in the collection. Reject
				// any input the selected preset doesn't define.
				const unsupported = Object.keys(inputs).filter((f) => !validFields.has(f));
				if (unsupported.length > 0) {
					throw new NodeOperationError(
						this.getNode(),
						`These inputs aren't part of the selected trigger — remove them: ${unsupported.join(', ')}`,
					);
				}

				// Fail fast with a clear message if a required input is missing, rather than a backend 400.
				const missing = presetInputs
					.filter((i) => i.is_required && !inputs[i.field])
					.map((i) => i.display_name || i.field);
				if (missing.length > 0) {
					throw new NodeOperationError(
						this.getNode(),
						`Missing required input(s) for this trigger: ${missing.join(', ')}`,
					);
				}

				// n8n has no "return sample data" hook for a webhook trigger; on manual Execute we preview
				// by searching the preset's recent events and self-delivering the newest to our own test
				// webhook. Search first (awaited) so a bad input or no match fails fast instead of hanging.
				if (this.getMode() === MANUAL_MODE) {
					if (!webhookUrl) {
						throw new NodeOperationError(
							this.getNode(),
							'Cannot preview: n8n did not provide a test webhook URL.',
						);
					}
					const events = await fetchRecentPresetEvents.call(this, preset, inputs);
					if (events.length === 0) {
						throw new NodeOperationError(
							this.getNode(),
							'No matching Glean events found to preview. Check the inputs above, or activate the workflow to receive live events.',
						);
					}
					const secret = generateEphemeralSecret();
					webhookData.secret = secret;
					// Fire-and-forget: n8n only starts listening after create() returns, so the (retrying)
					// delivery must run after we return.
					void deliverPreviewEvent
						.call(this, webhookUrl, secret, events[0])
						.catch((error) =>
							this.logger.error(`Glean Trigger: event preview delivery failed: ${error}`),
						);
					return true;
				}

				const body: IDataObject = {
					preset_id: preset,
					inputs,
					delivery: { webhook_url: webhookUrl },
				};

				const response = await gleanApiRequest.call(this, 'POST', TRIGGERS_PATH, body);
				const trigger = response.trigger as IDataObject | undefined;
				// TriggerCreateResponse: { trigger: TriggerWithSecret }. signing_secret is on
				// the trigger object and returned only at creation.
				const signingSecret = trigger?.signing_secret as string | undefined;

				if (!trigger?.trigger_id || !signingSecret) {
					throw new NodeOperationError(
						this.getNode(),
						'Glean trigger creation response did not contain the expected trigger_id and signing secret',
					);
				}

				webhookData.triggerId = trigger.trigger_id as string;
				webhookData.secret = signingSecret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				if (!webhookData.triggerId) {
					// Manual test leaves only an ephemeral secret behind; clear it.
					delete webhookData.secret;
					return true;
				}
				try {
					await gleanApiRequest.call(this, 'DELETE', triggerPath(webhookData.triggerId as string));
				} catch (error) {
					// 404 = already gone; anything else is a real failure worth surfacing.
					if (!is404(error)) {
						throw new NodeApiError(this.getNode(), error as JsonObject);
					}
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
			const { status, message } = WEBHOOK_RESPONSES.unprovisioned;
			this.getResponseObject().status(status).send(message).end();
			return { noWebhookResponse: true };
		}

		if (!verifyStandardWebhookSignature.call(this, secret)) {
			const { status, message } = WEBHOOK_RESPONSES.invalidSignature;
			this.getResponseObject().status(status).send(message).end();
			return { noWebhookResponse: true };
		}

		const bodyData = this.getBodyData();
		return {
			workflowData: [this.helpers.returnJsonArray(bodyData)],
		};
	}
}
