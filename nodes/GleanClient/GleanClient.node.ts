import { INodeType, INodeTypeDescription, NodeConnectionType } from 'n8n-workflow';

export class GleanClient implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Glean',
    name: 'gleanClient',
    icon: 'file:glean.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: 'Retrieve results from the Glean index for the given query and filters',
    defaults: {
      name: 'Glean',
    },
    usableAsTool: true,
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    credentials: [
      {
        name: 'gleanClientApi',
        required: true,
      },
    ],
    requestDefaults: {
      baseURL: '={{ $credentials.baseUrl.replace(new RegExp("/$"), "") }}',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    },
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Search Glean',
            value: 'searchGlean',
          },
        ],
        default: 'searchGlean',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['searchGlean'],
          },
        },
        options: [
          {
            name: 'Search Glean',
            value: 'post',
            action: 'Search',
            description: 'Retrieve results from the index for the given query',
            routing: {
              request: {
                method: 'POST',
                url: '/rest/api/v1/search',
                body: {
                  query: '={{$parameter["query"]}}',
                  trackingToken: '1',
                  pageSize: 10,
                },
              },
            },
          },
        ],
        default: 'post',
      },
      {
        displayName: 'Query',
        name: 'query',
        type: 'string',
        default: '',
        placeholder: 'Enter your query here',
      },
    ],
  };
}
