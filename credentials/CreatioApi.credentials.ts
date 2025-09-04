import { Icon, IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class CreatioApi implements ICredentialType {
	displayName = 'Creatio API';
	name = 'creatioApi';
	icon: Icon = 'file:Creatio.svg';
	documentationUrl = 'https://community.creatio.com';
	properties: INodeProperties[] = [
		{
			displayName: 'Creatio URL',
			name: 'creatioUrl',
			type: 'string',
			default: '',
			description: 'The URL of your Creatio instance (e.g., https://your-instance.creatio.com)',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
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
