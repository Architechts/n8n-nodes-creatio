// Copyright 2025 Architechts
//
// Use of this software is governed by the Business Source License
// included in the file LICENSE.md.
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0, included in the file
// licenses/APL.txt.

import { Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class CreatioApi implements ICredentialType {
	displayName = 'Creatio API - Additional license costs may apply.';
	name = 'creatioApi';
	icon: Icon = 'file:Creatio.svg';
	documentationUrl = 'https://github.com/Architechts/n8n-nodes-creatio';
	properties: INodeProperties[] = [
		{
			displayName: 'Creatio URL',
			name: 'creatioUrl',
			type: 'string',
			default: '',
			description: 'The URL of your Creatio instance (e.g., https://your-instance.creatio.com)',
			hint: 'This is the URL of your Creatio instance, without the trailing slash',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			hint: 'This is usually not the email address, but the username you use to log in to Creatio',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
		},
	];
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.creatioUrl}}',
			url: '/ServiceModel/AuthService.svc/Login',
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				ForceUseSession: 'true',
			},
			body: {
				UserName: '={{$credentials.username}}',
				UserPassword: '={{$credentials.password}}',
			},
			json: true,
		},
	};
}
