import {
  IAuthenticateGeneric,
  ICredentialType,
  INodeProperties,
  ICredentialTestRequest,
  Icon,
} from 'n8n-workflow';

export class GleanClientApi implements ICredentialType {
  name = 'gleanClientApi';
  displayName = 'Glean Client API';
  icon: Icon = { light: 'file:../icons/glean.svg', dark: 'file:../icons/glean-dark.svg' };
  documentationUrl = 'https://developers.glean.com/api-info/client/getting-started/overview';
  properties: INodeProperties[] = [
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: '',
      placeholder: 'https://instance-be.glean.com',
      description: 'Your Glean deployment base URL',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
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
      url: '/rest/api/v1/search',
      method: 'POST',
    },
  };
}
