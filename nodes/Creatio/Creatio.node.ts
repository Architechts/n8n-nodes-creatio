import {
	INodeType,
	INodeTypeDescription,
	IExecuteFunctions,
	NodeConnectionType,
	ILoadOptionsFunctions,
	NodeOperationError,
} from 'n8n-workflow';

export class Creatio implements INodeType {
	// Extracted authentication helper as a static method
	static async authenticateAndGetCookies(context: ILoadOptionsFunctions | IExecuteFunctions, credentials: any) {
		let creatioUrl = credentials.creatioUrl as string;
		const username = credentials.username as string;
		const password = credentials.password as string;
		creatioUrl = creatioUrl.trim().replace(/\/$/, '');
		let authResponse;
		try {
			authResponse = await context.helpers.request({
				resolveWithFullResponse: true,
				method: 'POST',
				url: `${creatioUrl}/ServiceModel/AuthService.svc/Login`,
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					ForceUseSession: 'true',
				},
				body: {
					UserName: username,
					UserPassword: password,
				},
				json: true,
				maxRedirects: 5,
			});
		} catch (error: any) {
			console.error('Creatio login failed (authenticateAndGetCookies):', {
				status: error.response?.status,
				headers: error.response?.headers,
				body: error.response?.body,
			});
			throw new NodeOperationError(
				context.getNode(),
				`Failed to authenticate with Creatio: ${error.message}`,
			);
		}
		const cookies = authResponse.headers['set-cookie'];
		const authCookie = cookies.find((c: string) => c.startsWith('.ASPXAUTH='));
		const csrfCookie = cookies.find((c: string) => c.startsWith('BPMCSRF='));
		const bpmLoader = cookies.find((c: string) => c.startsWith('BPMLOADER='));
		const sessionIdCookie = cookies.find((c: string) => c.startsWith('BPMSESSIONID='));
		const userType = 'UserType=General';
		return {
			cookies,
			authCookie,
			csrfCookie,
			bpmLoader,
			sessionIdCookie,
			userType,
			creatioUrl,
		};
	}
	methods = {
		loadOptions: {
			async getODataEntities(this: ILoadOptionsFunctions) {
				try {
					const credentials = await this.getCredentials('creatioApi');
					const {
						authCookie,
						csrfCookie,
						creatioUrl,
					} = await Creatio.authenticateAndGetCookies(this, credentials);
					const cookieHeaderVal = [authCookie?.split(';')[0], csrfCookie?.split(';')[0]]
						.filter(Boolean)
						.join('; ');
					const csrfTokenVal = csrfCookie?.split('=')[1] || '';
					const metadataXml = await this.helpers.request({
						method: 'GET',
						url: `${creatioUrl}/0/odata/$metadata`,
						headers: {
							Accept: 'application/xml',
							Cookie: cookieHeaderVal,
							BPMCSRF: csrfTokenVal,
						},
					});
					const entityNames: string[] = [];
					const entityTypeRegex = /<EntityType Name="([^"]+)"/g;
					let match;
					while ((match = entityTypeRegex.exec(metadataXml)) !== null) {
						entityNames.push(match[1]);
					}
					return entityNames.map((name) => ({
						name,
						value: name,
					}));
				} catch (error: any) {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to load OData entities: ${error.message}`,
					);
				}
			},
			async getODataEntityFields(this: ILoadOptionsFunctions) {
				try {
					const credentials = await this.getCredentials('creatioApi');
					const {
						authCookie,
						csrfCookie,
						creatioUrl,
					} = await Creatio.authenticateAndGetCookies(this, credentials);
					const cookieHeader = [authCookie?.split(';')[0], csrfCookie?.split(';')[0]]
						.filter(Boolean)
						.join('; ');
					const csrfToken = csrfCookie?.split('=')[1] || '';
					const subpath = this.getCurrentNodeParameter('subpath') as string;
					if (!subpath) {
						return [];
					}
					const metadataXml = await this.helpers.request({
						method: 'GET',
						url: `${creatioUrl}/0/odata/$metadata`,
						headers: {
							Accept: 'application/xml',
							Cookie: cookieHeader,
							BPMCSRF: csrfToken,
						},
					});
					const entityRegex = new RegExp(`<EntityType Name="${subpath}"[\\s\\S]*?<\\/EntityType>`, 'g');
					const entityMatch = entityRegex.exec(metadataXml);
					if (!entityMatch) {
						return [];
					}
					const entityXml = entityMatch[0];
					const propertyRegex = /<Property Name="([^"]+)"/g;
					const fields: { name: string; value: string }[] = [];
					let match;
					while ((match = propertyRegex.exec(entityXml)) !== null) {
						fields.push({ name: match[1], value: match[1] });
					}
					return fields;
				} catch (error: any) {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to load OData entity fields: ${error.message}`,
					);
				}
			},
		}
	}
	description: INodeTypeDescription = {
		displayName: 'Creatio',
		name: 'creatio',
		icon: 'file:Creatio.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Consume Creatio API',
		defaults: {
			name: 'Creatio',
		},
		inputs: ['main'] as NodeConnectionType[],
		outputs: ['main'] as NodeConnectionType[],
		credentials: [
			{
				name: 'creatioApi',
				required: true,
			},
		],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'GET',
						description: 'Gets record',
						value: 'GET',
						action: 'Get one or more records',
					},
					{
						name: 'POST',
						description: 'Create record',
						value: 'POST',
						action: 'Create a record',
					},
					{
						name: 'PATCH',
						description: 'Update record',
						value: 'PATCH',
						action: 'Update a record',
					},
				],
				default: 'GET',
			},
			{
				displayName: 'Subpath Name or ID',
				name: 'subpath',
				type: 'options',
				default: '',
				description: 'The OData entity to target (e.g., Account, Contact). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				required: true,
				typeOptions: {
					loadOptionsMethod: 'getODataEntities',
				},
				displayOptions: {
					show: {
						operation: ['GET', 'POST', 'PATCH'],
					},
				},
			},
			{
				displayName: 'Select Field Names or IDs',
				name: 'select',
				type: 'multiOptions',
				default: [],
				description: 'Select one or more fields to include in the result. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				typeOptions: {
					loadOptionsMethod: 'getODataEntityFields',
					loadOptionsDependsOn: ["subpath"],
				},
				displayOptions: {
					show: {
						operation: ['GET'],
					},
				},
			},
			{
				displayName: 'Top',
				name: 'top',
				type: 'number',
				default: 10,
				description: 'Number of records to return',
				displayOptions: {
					show: {
						operation: ['GET'],
					},
				},
			},
			{
				displayName: 'Filter',
				name: 'filter',
				type: 'string',
				default: '',
				description: 'OData filter expression (e.g., "Name eq \'John\'")',
				displayOptions: {
					show: {
						operation: ['GET'],
					},
				},
			},
			{
				displayName: 'Expand',
				name: 'expand',
				type: 'string',
				default: '',
				description: 'Comma-separated list of related entities to expand',
				displayOptions: {
					show: {
						operation: ['GET'],
					},
				},
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				default: '',
				description: 'Resource ID',
				displayOptions: {
					show: {
						operation: ['PATCH'],
					},
				},
			},
			{
				displayName: 'Body',
				name: 'body',
				type: 'json',
				default: '',
				description: 'The JSON body to send',
				required: true,
				displayOptions: {
					show: {
						operation: ['POST', 'PATCH'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions) {
		const items = this.getInputData();
		const returnData = [];
		for (let i = 0; i < items.length; i++) {
			const credentials = await this.getCredentials('creatioApi');
			const operation = this.getNodeParameter('operation', i) as string;
			const {
				authCookie,
				csrfCookie,
				bpmLoader,
				sessionIdCookie,
				userType,
				creatioUrl,
			} = await Creatio.authenticateAndGetCookies(this, credentials);
			let response;
			switch (operation) {
				case 'GET': {
					const subpath = this.getNodeParameter('subpath', i) as string;
					const select = this.getNodeParameter('select', i) as string[];
					const top = this.getNodeParameter('top', i) as number;
					const filter = this.getNodeParameter('filter', i) as string;
					const expand = this.getNodeParameter('expand', i) as string;
					let url = `${creatioUrl}/0/odata/${subpath}`;
					const queryParams: string[] = [];
					if (select && select.length > 0) {
						queryParams.push(`$select=${encodeURIComponent(select.join(','))}`);
					}
					if (top) {
						queryParams.push(`$top=${top}`);
					}
					if (filter) {
						queryParams.push(`$filter=${encodeURIComponent(filter)}`);
					}
					if (expand) {
						queryParams.push(`$expand=${encodeURIComponent(expand)}`);
					}
					if (queryParams.length > 0) {
						url += `?${queryParams.join('&')}`;
					}
					const cookieHeader = [authCookie?.split(';')[0], csrfCookie?.split(';')[0], bpmLoader?.split(';')[0], userType]
						.filter(Boolean)
						.join('; ');
					const csrfToken = csrfCookie?.split('=')[1];
					response = await this.helpers.request({
						method: 'GET',
						url,
						headers: {
							Accept: 'application/json',
							'Content-Type': 'application/json',
							Cookie: cookieHeader,
							BPMCSRF: csrfToken,
						},
						json: true,
					});
					break;
				}
				case 'POST': {
					const cookieHeader = [
						sessionIdCookie?.split(';')[0],
						authCookie?.split(';')[0],
						csrfCookie?.split(';')[0],
						bpmLoader?.split(';')[0],
						userType
					].filter(Boolean).join('; ');
					const csrfToken = csrfCookie?.split('=')[1]?.split(';')[0] || '';
					const subpath = this.getNodeParameter('subpath', i) as string;
					const requestBody = this.getNodeParameter('body', i) as object;
					let url = `${creatioUrl}/0/odata/${subpath}`;
					response = await this.helpers.request({
						method: 'POST',
						url,
						headers: {
							Accept: '*/*',
							'Content-Type': 'application/json',
							Cookie: cookieHeader,
							BPMCSRF: csrfToken,
						},
						body: requestBody,
						json: true,
					});
					break;
				}
				case 'PATCH': {
					const cookieHeader = [
						sessionIdCookie?.split(';')[0],
						authCookie?.split(';')[0],
						csrfCookie?.split(';')[0],
						bpmLoader?.split(';')[0],
						userType
					].filter(Boolean).join('; ');
					const csrfToken = csrfCookie?.split('=')[1]?.split(';')[0] || '';
					const subpath = this.getNodeParameter('subpath', i) as string;
					const id = this.getNodeParameter('id', i, '') as string;
					const requestBody = this.getNodeParameter('body', i) as object;
					let url = `${creatioUrl}/0/odata/${subpath}`;
					if (id) {
						url = `${creatioUrl}/0/odata/${subpath}(${id})`;
					}
					response = await this.helpers.request({
						method: 'PATCH',
						url,
						headers: {
							Accept: '*/*',
							'Content-Type': 'application/json',
							Cookie: cookieHeader,
							BPMCSRF: csrfToken,
						},
						body: requestBody,
						json: true,
					});
					break;
				}
			}
			returnData.push(response);
		}
		return [this.helpers.returnJsonArray(returnData)];
	}
}
