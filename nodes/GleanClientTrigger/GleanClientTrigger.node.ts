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
	getOptionalInputFields,
	getOptionalInputValues,
} from './GleanClientTriggerLoadOptions';
import { TRIGGERS_PATH, WEBHOOK_RESPONSES, triggerPath, presetPath } from './constants';

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
				type: 'resourceMapper',
				default: {
					mappingMode: 'defineBelow',
					value: null,
				},
				required: true,
				noDataExpression: true,
				typeOptions: {
					// Refresh the field list whenever the selected preset changes.
					loadOptionsDependsOn: ['preset.value'],
					resourceMapper: {
						resourceMapperMethod: 'getRequiredPresetInputs',
						mode: 'add',
						fieldWords: {
							singular: 'required input',
							plural: 'required inputs',
						},
						// All required inputs render expanded.
						addAllFields: true,
						supportAutoMap: false,
					},
				},
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
				description: 'Optional fields to further narrow this trigger',
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
								description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
								typeOptions: {
									loadOptionsMethod: 'getOptionalInputFields',
									loadOptionsDependsOn: ['preset.value'],
								},
							},
							{
								displayName: 'Value Name or ID',
								name: 'value',
								type: 'options',
								default: '',
								description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
								typeOptions: {
									loadOptionsMethod: 'getOptionalInputValues',
									loadOptionsDependsOn: ['&field'],
								},
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
		resourceMapping: {
			getRequiredPresetInputs,
		},
		loadOptions: {
			getOptionalInputFields,
			getOptionalInputValues,
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
				// resourceMapper stores mapped values under `.value`, keyed by field id.
				const requiredMapped = this.getNodeParameter('requiredInputs', {}) as { value?: IDataObject };
				const optionalRaw = this.getNodeParameter('optionalInputs', {}) as {
					input?: Array<{ field: string; value: string }>;
				};
				const inputs: IDataObject = { ...(requiredMapped.value ?? {}) };
				for (const i of optionalRaw.input ?? []) {
					inputs[i.field] = i.value;
				}

				// Fail fast with a clear message if a required input is missing, rather than a backend 400.
				const presetResp = await gleanApiRequest.call(this, 'GET', presetPath(preset));
				const presetSchema =
					(presetResp.trigger_preset as {
						inputs?: Array<{ field: string; label?: string; required?: boolean }>;
					}) ?? {};
				const required = (presetSchema.inputs ?? [])
					.filter((i) => i.required)
					.map((i) => ({ field: i.field, label: i.label || i.field }));
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
