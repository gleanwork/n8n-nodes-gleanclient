import {
	type IHookFunctions,
	type IWebhookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookResponseData,
	type IDataObject,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

import { gleanApiRequest, verifyStandardWebhookSignature } from './GleanTriggerHelpers';
import { searchPresets, getPresetInputs } from './GleanTriggerLoadOptions';

export class GleanTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Glean Trigger',
		name: 'gleanTrigger',
		icon: 'file:glean.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["preset"]["cachedResultName"] || $parameter["preset"]["value"] || $parameter["preset"]}}',
		description: 'Starts the workflow when a Glean content trigger fires',
		defaults: {
			name: 'Glean Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'gleanClientApi',
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
				displayName: 'Inputs',
				name: 'inputs',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				placeholder: 'Add Input',
				description: 'Values for the fields this preset accepts',
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
									loadOptionsMethod: 'getPresetInputs',
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
				displayName: 'Description',
				name: 'triggerDescription',
				type: 'string',
				default: '',
				placeholder: 'e.g. High-priority Jira bugs in ENG',
				description: 'Human-friendly label stored on the trigger in Glean. Auto-generated if left blank.',
			},
		],
	};

	methods = {
		listSearch: {
			searchPresets,
		},
		loadOptions: {
			getPresetInputs,
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
					await gleanApiRequest.call(this, 'GET', `/triggers/${webhookData.triggerId}`);
					return true;
				} catch (error) {
					if (error.httpCode === '404') {
						delete webhookData.triggerId;
						delete webhookData.secret;
						return false;
					}
					throw error;
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const preset = this.getNodeParameter('preset', undefined, { extractValue: true }) as string;
				const inputsRaw = this.getNodeParameter('inputs', {}) as {
					input?: Array<{ field: string; value: string }>;
				};
				const description = this.getNodeParameter('triggerDescription', '') as string;

				const inputs: IDataObject = {};
				for (const i of inputsRaw.input ?? []) {
					inputs[i.field] = i.value;
				}

				const body: IDataObject = {
					preset_id: preset,
					inputs,
					delivery: { webhook_url: webhookUrl },
				};
				if (description) {
					body.description = description;
				}

				const response = await gleanApiRequest.call(this, 'POST', '/triggers', body);
				const trigger = response.trigger as IDataObject | undefined;
				const secret = response.secret as IDataObject | undefined;
				const signingSecret = secret?.signing_secret as string | undefined;

				if (!trigger?.trigger_id || !signingSecret) {
					throw new NodeOperationError(
						this.getNode(),
						'Glean trigger creation response did not contain the expected trigger_id and signing secret',
					);
				}

				const webhookData = this.getWorkflowStaticData('node');
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
					await gleanApiRequest.call(this, 'DELETE', `/triggers/${webhookData.triggerId}`);
				} catch (error) {
					return false;
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
			const res = this.getResponseObject();
			res.status(500).send('Webhook not provisioned').end();
			return { noWebhookResponse: true };
		}

		if (!verifyStandardWebhookSignature.call(this, secret)) {
			const res = this.getResponseObject();
			res.status(401).send('Invalid signature').end();
			return { noWebhookResponse: true };
		}

		const bodyData = this.getBodyData();
		return {
			workflowData: [this.helpers.returnJsonArray(bodyData)],
		};
	}
}
