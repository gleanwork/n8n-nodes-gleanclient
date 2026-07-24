import { ICredentialType, INodeProperties } from 'n8n-workflow';

// Marketplace-style OAuth: the app's client is baked in and PKCE is used (public
// client, no secret). The user only sees the deployment URL + "Connect my account" —
// client ID / secret / auth URLs / scope are hidden defaults, not user input.
export class GleanOAuth2Api implements ICredentialType {
  name = 'gleanOAuth2Api';
  extends = ['oAuth2Api'];
  displayName = 'Glean OAuth2 API';
  documentationUrl = 'https://developers.glean.com/api-info/client/getting-started/overview';
  properties: INodeProperties[] = [
    {
      displayName: 'Glean Deployment URL',
      name: 'baseUrl',
      type: 'string',
      // exp-QE base; the host and the /qe-glean-exp/<pod> path change per deployment.
      default: 'https://scio-prod-be.glean.com/qe-glean-exp/707',
      description: 'Base URL for the trigger API (the node calls {baseUrl}/api/...). Changes per deployment.',
    },
    // ---- everything below is fixed by the app and hidden from the user ----
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
      default: 'https://scio-prod-be.glean.com/oauth/authorize',
    },
    {
      displayName: 'Access Token URL',
      name: 'accessTokenUrl',
      type: 'hidden',
      default: 'https://scio-prod-be.glean.com/oauth/token',
    },
    {
      displayName: 'Client ID',
      name: 'clientId',
      type: 'hidden',
      default: 'n8n_ee765bfc-f24d-4c28-9285-ee0d8f306d80',
    },
    {
      displayName: 'Client Secret',
      name: 'clientSecret',
      type: 'hidden',
      default: '',
    },
    // The trigger APIs require these scopes; Glean must expose them (like the /api/triggers endpoints).
    {
      displayName: 'Scope',
      name: 'scope',
      type: 'hidden',
      default: 'triggers:read triggers:write',
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
