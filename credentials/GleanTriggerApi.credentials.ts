import {
  IAuthenticateGeneric,
  ICredentialType,
  INodeProperties,
  ICredentialTestRequest,
  Icon,
} from 'n8n-workflow';

// API-key auth for the Trigger node; separate from the search cred so its test hits the triggers API, not search.
export class GleanTriggerApi implements ICredentialType {
  name = 'gleanTriggerApi';
  displayName = 'Glean Trigger API';
  icon: Icon = { light: 'file:../icons/glean.svg', dark: 'file:../icons/glean-dark.svg' };
  documentationUrl = 'https://developers.glean.com/api-info/client/authentication/overview';
  properties: INodeProperties[] = [
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: '',
      required: true,
      placeholder: 'https://instance-be.glean.com',
      description: 'Your Glean deployment base URL. The node calls {baseUrl}/api/...',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
    },
  ];
  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        Authorization: '=Bearer {{$credentials.apiKey}}',
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.baseUrl}}',
      url: '/api/trigger-presets',
      method: 'GET',
      qs: { page_size: 1 },
    },
  };
}
