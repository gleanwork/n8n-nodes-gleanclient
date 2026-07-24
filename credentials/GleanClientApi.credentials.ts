import {
  IAuthenticateGeneric,
  ICredentialType,
  INodeProperties,
  ICredentialTestRequest,
} from 'n8n-workflow';

export class GleanClientApi implements ICredentialType {
  name = 'gleanClientApi';
  displayName = 'Glean Client API';
  documentationUrl = 'https://developers.glean.com/api-info/client/getting-started/overview';
  properties: INodeProperties[] = [
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      // exp-QE base; the host and the /qe-glean-exp/<pod> path change per deployment.
      default: 'https://scio-prod-be.glean.com/qe-glean-exp/707',
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
      url: '/api/trigger-presets',
      method: 'GET',
    },
  };
}
