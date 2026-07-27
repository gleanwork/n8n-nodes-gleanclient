import { ICredentialType, INodeProperties, Icon } from 'n8n-workflow';

// OAuth (PKCE public client) for the Trigger node; clients are per-deployment, so the user supplies base URL + client ID.
export class GleanOAuth2Api implements ICredentialType {
  name = 'gleanOAuth2Api';
  extends = ['oAuth2Api'];
  displayName = 'Glean OAuth2 API';
  icon: Icon = { light: 'file:../icons/glean.svg', dark: 'file:../icons/glean-dark.svg' };
  documentationUrl = 'https://developers.glean.com/api-info/client/authentication/oauth';
  properties: INodeProperties[] = [
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: '',
      required: true,
      placeholder: 'https://instance-be.glean.com',
      description:
        'Your Glean deployment base URL. The API and OAuth endpoints are derived from it (e.g. {baseUrl}/oauth/authorize).',
    },
    {
      displayName: 'Client ID',
      name: 'clientId',
      type: 'string',
      default: '',
      required: true,
      description:
        'OAuth client ID registered for n8n on your Glean deployment (Glean admin console or Dynamic Client Registration)',
    },
    // ---- derived from the base URL / fixed; hidden from the user ----
    {
      displayName: 'Grant Type',
      name: 'grantType',
      type: 'hidden',
      default: 'pkce',
    },
    {
      displayName: 'Authorization URL',
      name: 'authUrl',
      type: 'hidden',
      // trim trailing slash(es) so we never build "host//oauth/authorize"
      default: '={{$self["baseUrl"].replace(/\\/+$/, "")}}/oauth/authorize',
    },
    {
      displayName: 'Access Token URL',
      name: 'accessTokenUrl',
      type: 'hidden',
      default: '={{$self["baseUrl"].replace(/\\/+$/, "")}}/oauth/token',
    },
    {
      displayName: 'Client Secret',
      name: 'clientSecret',
      type: 'hidden',
      typeOptions: { password: true },
      default: '',
    },
    // 'agents' maps to the platform TRIGGERS_READ/WRITE scopes the trigger APIs require.
    {
      displayName: 'Scope',
      name: 'scope',
      type: 'hidden',
      default: 'agents',
    },
    {
      displayName: 'Auth URI Query Parameters',
      name: 'authQueryParameters',
      type: 'hidden',
      // force the consent screen so re-connecting is visible even with an active SSO session
      default: 'prompt=consent',
    },
    {
      displayName: 'Authentication',
      name: 'authentication',
      type: 'hidden',
      default: 'header',
    },
  ];
}
