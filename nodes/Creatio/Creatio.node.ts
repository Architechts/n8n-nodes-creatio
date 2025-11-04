// Copyright 2025 Architechts
//
// Use of this software is governed by the Business Source License
// included in the file LICENSE.md.
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0, included in the file
// licenses/APL.txt.

import {
	INodeType,
	INodeTypeDescription,
	IExecuteFunctions,
	NodeConnectionType,
	ILoadOptionsFunctions,
	NodeOperationError,
} from 'n8n-workflow';

// import {
// 	buildInputSchemaField,
// 	buildJsonSchemaExampleField,
// 	buildJsonSchemaExampleNotice,
// 	schemaTypeField,
// } from '../../utils/Descriptions';

// Tool usage for specifying input.
// const jsonSchemaExampleField = buildJsonSchemaExampleField({
// 	showExtraProps: { specifyInputSchema: [true] },
// });
	 
// const jsonSchemaExampleNotice = buildJsonSchemaExampleNotice({
// 	showExtraProps: {
// 		specifyInputSchema: [true],
// 		'@version': [{ _cnd: { gte: 1.3 } }],
// 	},
// });
	 
// const jsonSchemaField = buildInputSchemaField({ showExtraProps: { specifyInputSchema: [true] } });

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
			// ----------------------------------
			//         GENERIC
			// ----------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'DELETE',
						description: 'Delete a record permanently',
						value: 'DELETE',
						action: 'Delete a record permanently',
					},
					{
						name: 'GET',
						description: 'Gets record',
						value: 'GET',
						action: 'Get one or more records',
					},
					{
						name: 'METADATA',
						description: 'Gets fieldnames for a table',
						value: 'METADATA',
						action: 'Get the fieldnames for a table',
					},
					{
						name: 'PATCH',
						description: 'Update record',
						value: 'PATCH',
						action: 'Update a record',
					},
					{
						name: 'POST',
						description: 'Create record',
						value: 'POST',
						action: 'Create a record',
					},
					{
						name: 'TABLES',
						description: 'Gets Tables',
						value: 'TABLES',
						action: 'Get tablenames',
					}
				],
				default: 'GET',
			},

			// ----------------------------------
			//         GET / READ
			// ----------------------------------
			
			{
				displayName: 'Subpath Name or ID',
				name: 'subpath',
				type: 'options',
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				required: true,
				typeOptions: {
					loadOptionsMethod: 'getODataEntities',
				},
				displayOptions: {
					show: {
						operation: ['GET'],
					},
				},
			},
			{
				displayName: 'Select Field Names or IDs',
				name: 'select',
				type: 'multiOptions',
				default: [],
				description: 'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
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
				displayName: 'Filter By Formula',
				name: 'filter',
				type: 'string',
				default: '',
				description: 'A formula used to filter records. The formula will be evaluated for each record, and if the result is not 0, false, "", NaN, [], or #Error! the record will be included in the response.',
				displayOptions: {
					show: {
						operation: ['GET'],
					},
				},
				placeholder: "NOT({Name} = '')"
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
				displayName: 'Append Request',
				name: 'appendRequest',
				type: 'boolean',
				description:
					'Whether to append the request to the response',
				noDataExpression: true,
				default: false,
				displayOptions: {
					show: {
						operation: ['GET'],
					},
				},
			},

			// ----------------------------------
			//         PATCH / UPDATE
			// ----------------------------------

			{
				displayName: 'Subpath Name or ID',
				name: 'subpath',
				type: 'options',
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				required: true,
				typeOptions: {
					loadOptionsMethod: 'getODataEntities',
				},
				displayOptions: {
					show: {
						operation: ['PATCH'],
					},
				},
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['PATCH'],
					},
				},
				default: '',
				required: true,
				description: 'ID of the record to update',
			},
			//{
			//	displayName: 'Update All Fields',
			//	name: 'updateAllFields',
			//	type: 'boolean',
			//	displayOptions: {
			//		show: {
			//			operation: ['PATCH'],
			//		},
			//	},
			//	default: true,
			//	description: 'Whether all fields should be sent to Creatio or only specific ones',
			//},
			{
				displayName: 'Fields',
				name: 'fields',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						//updateAllFields: [false],
						operation: ['PATCH'],
					},
				},
				default: {},
				placeholder: 'Add Field',
				options: [
					{
						name: 'field',
						displayName: 'Field',
						values: [
							{
								displayName: 'Field Name',
								name: 'fieldName',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getODataEntityFields',
									loadOptionsDependsOn: ['subpath'],
								},
								default: '',
								description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
							},
							{
								displayName: 'Field Value',
								name: 'fieldValue',
								type: 'string',
								default: '',
								placeholder: 'value',
								description: 'Value for the field',
							},
						],
					},
				],
				description: 'The fields to update with their values',
			},
			{
				displayName: 'Use self formatted body for update',
				name: 'useBody',
				type: 'boolean',
				description:
					'Whether to format the body to sent in n8n',
				noDataExpression: true,
				default: false,
				displayOptions: {
					show: {
						operation: ['PATCH'],
					},
				},
			},
			{
				displayName: 'Update body',
				name: 'body',
				type: 'json',
				default: '',
				description: 'The formatted JSON body to send',
				required: false,
				displayOptions: {
					show: {
						useBody: [true],
						operation: ['PATCH'],
					},
				},
			},
			{
				displayName: 'Append Request',
				name: 'appendRequest',
				type: 'boolean',
				description:
					'Whether to append the request to the response',
				noDataExpression: true,
				default: false,
				displayOptions: {
					show: {
						operation: ['PATCH'],
					},
				},
			},

			// ----------------------------------
			//         DELETE / DELETE
			// ----------------------------------
			{
				displayName: 'Subpath Name or ID',
				name: 'subpath',
				type: 'options',
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				required: true,
				typeOptions: {
					loadOptionsMethod: 'getODataEntities',
				},
				displayOptions: {
					show: {
						operation: ['DELETE'],
					},
				},
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['DELETE'],
					},
				},
				default: '',
				required: true,
				description: 'ID of the record to delete',
			},

			// ----------------------------------
			//         POST / CREATE
			// ----------------------------------

			{
				displayName: 'Subpath Name or ID',
				name: 'subpath',
				type: 'options',
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				required: true,
				typeOptions: {
					loadOptionsMethod: 'getODataEntities',
				},
				displayOptions: {
					show: {
						operation: ['POST'],
					},
				},
			},
			{
				displayName: 'Fields',
				name: 'fields',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						//updateAllFields: [false],
						operation: ['POST'],
					},
				},
				default: {},
				placeholder: 'Add Field',
				options: [
					{
						name: 'field',
						displayName: 'Field',
						values: [
							{
								displayName: 'Field Name',
								name: 'fieldName',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getODataEntityFields',
									loadOptionsDependsOn: ['subpath'],
								},
								default: '',
								description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
							},
							{
								displayName: 'Field Value',
								name: 'fieldValue',
								type: 'string',
								default: '',
								placeholder: 'value',
								description: 'Value for the field',
							},
						],
					},
				],
				description: 'The fields to update with their values',
			},
			{
				displayName: 'Use self formatted body for update',
				name: 'useBody',
				type: 'boolean',
				description:
					'Whether to format the body to sent in n8n',
				noDataExpression: true,
				default: false,
				displayOptions: {
					show: {
						operation: ['POST'],
					},
				},
			},
			{
				displayName: 'Update body',
				name: 'body',
				type: 'json',
				default: '',
				description: 'The formatted JSON body to send',
				required: false,
				displayOptions: {
					show: {
						useBody: [true],
						operation: ['POST'],
					},
				},
			},
			{
				displayName: 'Append Request',
				name: 'appendRequest',
				type: 'boolean',
				description:
					'Whether to append the request to the response',
				noDataExpression: true,
				default: false,
				displayOptions: {
					show: {
						operation: ['POST'],
					},
				},
			},

			// ----------------------------------
			//         METADATA
			// ----------------------------------

			{
				displayName: 'Subpath Name or ID',
				name: 'subpath',
				type: 'options',
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				required: true,
				typeOptions: {
					loadOptionsMethod: 'getODataEntities',
				},
				displayOptions: {
					show: {
						operation: ['METADATA'],
					},
				},
			},

			// ----------------------------------
			//     GENERIC - Tool specialized
			// ----------------------------------
			//{
			//	displayName: 'Specify Input Schema',
			//	name: 'specifyInputSchema',
			//	type: 'boolean',
			//	description:
			//		'Whether to specify the schema for the function. This would require the LLM to provide the input in the correct format and would validate it against the schema.',
			//	noDataExpression: true,
			//	default: false,
			//},
			//{
			//	...schemaTypeField, displayOptions: { show: { specifyInputSchema: [true] } }
			//},
			//jsonSchemaExampleField,
			//jsonSchemaExampleNotice,
			//jsonSchemaField,
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
			try {
				switch (operation) {
					case 'GET': {
						const subpath = this.getNodeParameter('subpath', i) as string;
						const selectParam = this.getNodeParameter('select', i) as string[] | string;
						const select = Array.isArray(selectParam) ? selectParam : (selectParam ? selectParam.split(',').map(s => s.trim()) : []);
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
						
						if (!subpath && response.value) {
							response = response.value.map((item: any) => ({ tableName: item.name }));
						} else if (response.value) {
							response = response.value;
						}
						
						break;
					}
					case 'METADATA': {
						const subpath = this.getNodeParameter('subpath', i) as string;
						let url = `${creatioUrl}/0/odata/$metadata`;
						const cookieHeader = [authCookie?.split(';')[0], csrfCookie?.split(';')[0], bpmLoader?.split(';')[0], userType]
							.filter(Boolean)
							.join('; ');
						const csrfToken = csrfCookie?.split('=')[1];
						response = await this.helpers.request({
							method: 'GET',
							url: url,
							headers: {
								Accept: 'application/xml',
								Cookie: cookieHeader,
								BPMCSRF: csrfToken,
							},
						});

						const entityRegex = new RegExp(`<EntityType Name="${subpath}"[\\s\\S]*?<\\/EntityType>`, 'g');
						const entityMatch = entityRegex.exec(response);
						if (!entityMatch) {
							response = [];
						}

						const entityXml = entityMatch![0];
						const propertyRegex = /<Property Name="([^"]+)"/g;
						const fields: { name: string; value: string }[] = [];
						let match;
						while ((match = propertyRegex.exec(entityXml)) !== null) {
							fields.push({ name: match[1], value: match[1] });
						}

						var mappedFields = fields.map((item: any) => ({ fieldName: item.name }));
						response = mappedFields;

						break;
					}
					case 'TABLES': {
						let url = `${creatioUrl}/0/odata/`;
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

						response = response.value
							.filter((item: any) => {
								const name = item.name.toLowerCase();
								return !name.startsWith('vw') && !name.startsWith('sys') && !name.startsWith('oauth') && !name.startsWith('web');
							})
							.map((item: any) => ({ tableName: item.name }));
						
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
						const useBody = this.getNodeParameter('useBody', i, false) as boolean;
						
						let requestBody: any = {};
						if (useBody) {
							requestBody = this.getNodeParameter('body', i) as object;
						} else {
							const fields = this.getNodeParameter('fields', i, []) as { field: { fieldName: string, fieldValue: string }[] };
							if (fields.field) {
								for (const fieldData of fields.field) {
									requestBody[fieldData.fieldName] = fieldData.fieldValue;
								}
							}
						}
						
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
						const useBody = this.getNodeParameter('useBody', i, false) as boolean;
						
						let requestBody: any = {};
						if (useBody) {
							requestBody = this.getNodeParameter('body', i) as object;
						} else {
							const fields = this.getNodeParameter('fields', i, []) as { field: { fieldName: string, fieldValue: string }[] };
							if (fields.field) {
								for (const fieldData of fields.field) {
									if (fieldData.fieldValue !== '' && fieldData.fieldValue !== null && fieldData.fieldValue !== undefined) {
										requestBody[fieldData.fieldName] = fieldData.fieldValue;
									}
								}
							}
						}
						
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
					case 'DELETE': {
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
						let url = `${creatioUrl}/0/odata/${subpath}`;
						if (id) {
							url = `${creatioUrl}/0/odata/${subpath}(${id})`;
						}
						response = await this.helpers.request({
							method: 'DELETE',
							url,
							headers: {
								Accept: '*/*',
								'Content-Type': 'application/json',
								Cookie: cookieHeader,
								BPMCSRF: csrfToken,
							},
							json: true,
						});

						// Return a meaningfull message after delete. 
						if (response === '') {
							response = { "deleted": true };
						}

						break;
					}
				}
			} catch (error: any) {
				if (error.statusCode === 401) {
					response = [];
				} else {
					throw error;
				}
			}
			
			const appendRequest = this.getNodeParameter('appendRequest', i, false) as boolean;
			if (appendRequest && ['GET', 'POST', 'PATCH'].includes(operation)) {
				const requestFields: any = { operation };
				if (['GET', 'POST', 'PATCH'].includes(operation)) {
					requestFields.subpath = this.getNodeParameter('subpath', i, '');
				}
				if (operation === 'GET') {
					requestFields.select = this.getNodeParameter('select', i, []);
					requestFields.top = this.getNodeParameter('top', i, 10);
					requestFields.filter = this.getNodeParameter('filter', i, '');
					requestFields.expand = this.getNodeParameter('expand', i, '');
				}
				if (operation === 'PATCH') {
					requestFields.id = this.getNodeParameter('id', i, '');
				}
				if (['POST', 'PATCH'].includes(operation)) {
					requestFields.body = this.getNodeParameter('body', i, {});
				}
				returnData.push({ ...requestFields, response });
			} else {
				returnData.push(response);
			}
		}
		return [this.helpers.returnJsonArray(returnData)];
	}
}
