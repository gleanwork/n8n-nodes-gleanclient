import parser from '@typescript-eslint/parser';
import { n8nCommunityNodesPlugin } from '@n8n/eslint-plugin-community-nodes';

export default [
	{
		files: ['nodes/**/*.ts', 'credentials/**/*.ts'],
		languageOptions: { parser },
	},
	n8nCommunityNodesPlugin.configs.recommended,
];
