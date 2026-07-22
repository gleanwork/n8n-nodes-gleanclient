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
      default: 'https://scio-prod-be.glean.com',
      description: 'Your Glean deployment URL (used for the trigger API calls and OAuth endpoints)',
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
    // triggers:read/write don't exist on real Glean yet; use a real granted scope for the demo token.
    {
      displayName: 'Scope',
      name: 'scope',
      type: 'hidden',
      default: 'search',
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
