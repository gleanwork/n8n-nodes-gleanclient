import {
	type IHookFunctions,
	type IWebhookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookResponseData,
	type IDataObject,
	type JsonObject,
	NodeConnectionTypes,
	NodeApiError,
	NodeOperationError,
} from 'n8n-workflow';

import { gleanApiRequest, verifyStandardWebhookSignature, is404 } from './GleanClientTriggerHelpers';
import {
	searchPresets,
	getRequiredPresetInputs,
	getOptionalPresetInputs,
} from './GleanClientTriggerLoadOptions';
import {
	TRIGGERS_PATH,
	WEBHOOK_RESPONSES,
	triggerPath,
	presetPath,
	TIME_OFFSET_FIELD,
} from './constants';

export class GleanClientTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Glean Trigger',
		name: 'gleanClientTrigger',
		icon: { light: 'file:../../icons/glean.svg', dark: 'file:../../icons/glean-dark.svg' },
		group: ['trigger'],
		version: 1,
		usableAsTool: true,
		subtitle: '={{$parameter["preset"]["value"] || $parameter["preset"]}}',
		description: 'Starts the workflow when a Glean content trigger fires',
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
				displayName: 'Required Inputs',
				name: 'requiredInputs',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				placeholder: 'Add Required Input',
				description: 'Values for the required fields this trigger needs',
				options: [
					{
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
									loadOptionsMethod: 'getRequiredPresetInputs',
									loadOptionsDependsOn: ['preset'],
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
				displayName: 'Optional Inputs',
				name: 'optionalInputs',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				placeholder: 'Add Optional Input',
				description: 'Values for optional fields to further narrow this trigger',
				options: [
					{
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
									loadOptionsMethod: 'getOptionalPresetInputs',
									loadOptionsDependsOn: ['preset'],
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
		],
	};

	methods = {
		listSearch: {
			searchPresets,
		},
		loadOptions: {
			getRequiredPresetInputs,
			getOptionalPresetInputs,
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
					} catch {
						// ignore
					}
					delete webhookData.triggerId;
					delete webhookData.secret;
				}

				const webhookUrl = this.getNodeWebhookUrl('default');
				const preset = this.getNodeParameter('preset', undefined, { extractValue: true }) as string;
				const requiredRaw = this.getNodeParameter('requiredInputs', {}) as {
					input?: Array<{ field: string; value: string }>;
				};
				const optionalRaw = this.getNodeParameter('optionalInputs', {}) as {
					input?: Array<{ field: string; value: string }>;
				};
				const inputs: IDataObject = {};
				for (const i of [...(requiredRaw.input ?? []), ...(optionalRaw.input ?? [])]) {
					inputs[i.field] = i.value;
				}

				// Fail fast with a clear message if a required input is missing, rather than a backend 400.
				const presetResp = await gleanApiRequest.call(this, 'GET', presetPath(preset));
				const presetSchema =
					(presetResp.trigger_preset as {
						inputs?: Array<{ field: string; label?: string; required?: boolean }>;
						time_offsets?: number[];
					}) ?? {};
				const required = (presetSchema.inputs ?? [])
					.filter((i) => i.required && i.field !== TIME_OFFSET_FIELD)
					.map((i) => ({ field: i.field, label: i.label || i.field }));
				if ((presetSchema.time_offsets ?? []).length > 0) {
					required.push({ field: TIME_OFFSET_FIELD, label: 'Time Before Event' });
				}
				const missing = required.filter((r) => !inputs[r.field]).map((r) => r.label);
				if (missing.length > 0) {
					throw new NodeOperationError(
						this.getNode(),
						`Missing required input(s) for this trigger: ${missing.join(', ')}`,
					);
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
