// Copyright 2025 Architechts
//
// Use of this software is governed by the Business Source License
// included in the file LICENSE.md.

import { Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class CreatioOAuth2Api implements ICredentialType {
	name = 'creatioOAuth2Api';
	extends = ['oAuth2Api'];
	displayName = 'Creatio OAuth2 API';
	icon: Icon = 'file:Creatio.svg';
	documentationUrl = 'https://github.com/Architechts/n8n-nodes-creatio';
	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'clientCredentials',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Creatio URL',
			name: 'creatioUrl',
			type: 'string',
			default: '',
			required: true,
			description:
				'The base URL of your Creatio instance (e.g., https://your-instance.creatio.com), without a trailing slash',
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'string',
			default: '',
			required: true,
			description:
				'The Creatio Identity Service token endpoint, e.g. https://your-instance-is.creatio.com/connect/token',
			hint: 'This is the Identity Service URL, usually different from the Creatio app URL',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
		},
	];
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.creatioUrl}}',
			url: '/0/odata/$metadata',
			method: 'GET',
			headers: {
				Accept: 'application/xml',
			},
		},
	};
}
