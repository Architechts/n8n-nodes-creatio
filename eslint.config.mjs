import tseslint from 'typescript-eslint';
import community from '@n8n/eslint-plugin-community-nodes';
import n8nNodesBase from 'eslint-plugin-n8n-nodes-base';

export default tseslint.config(
	{ ignores: ['dist/**', 'node_modules/**', 'test/**', '**/*.js', '**/*.mjs'] },
	...tseslint.configs.recommended,
	{
		// n8n community-node rule set: deprecations, structure, AI-readiness, package.json checks.
		files: ['nodes/**/*.ts', 'credentials/**/*.ts'],
		plugins: community.configs.recommended.plugins,
		rules: community.configs.recommended.rules,
	},
	{
		// Legacy n8n-nodes-base node rules (granular description/param style checks).
		files: ['nodes/**/*.ts'],
		plugins: { 'n8n-nodes-base': n8nNodesBase },
		rules: n8nNodesBase.configs.nodes.rules,
	},
	{
		// Legacy n8n-nodes-base credential rules.
		files: ['credentials/**/*.ts'],
		plugins: { 'n8n-nodes-base': n8nNodesBase },
		rules: {
			...n8nNodesBase.configs.credentials.rules,
			// Preserve the project's prior override: this rule false-positives on the
			// correctly-cased `documentationUrl` field. Disabled in the old .eslintrc too.
			'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
		},
	},
	{
		// Creatio's OData responses and n8n error objects are dynamically shaped;
		// `any` is intentional and was accepted in code review.
		files: ['nodes/**/*.ts', 'credentials/**/*.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},
);
