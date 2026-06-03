// Copyright 2025 Architechts
//
// Use of this software is governed by the Business Source License
// included in the file LICENSE.md.

import {
	INodeType,
	INodeTypeDescription,
	IExecuteFunctions,
	INodeExecutionData,
	IDataObject,
	NodeConnectionType,
	ILoadOptionsFunctions,
	NodeOperationError,
} from 'n8n-workflow';

import { creatioApiRequest, CreatioAuthentication } from './GenericFunctions';

export class Creatio implements INodeType {
	methods = {
		loadOptions: {
			async getODataEntities(this: ILoadOptionsFunctions) {
				const authentication = this.getNodeParameter(
					'authentication',
					'oAuth2',
				) as CreatioAuthentication;
				const metadataXml = (await creatioApiRequest.call(
					this,
					authentication,
					'GET',
					'/0/odata/$metadata',
					undefined,
					{ json: false, accept: 'application/xml' },
				)) as string;

				const entityNames: string[] = [];
				const entityTypeRegex = /<EntityType Name="([^"]+)"/g;
				let match;
				while ((match = entityTypeRegex.exec(metadataXml)) !== null) {
					entityNames.push(match[1]);
				}
				return entityNames.map((name) => ({ name, value: name }));
			},
			async getODataEntityFields(this: ILoadOptionsFunctions) {
				const subpath = this.getCurrentNodeParameter('subpath') as string;
				if (!subpath) {
					return [];
				}
				const authentication = this.getNodeParameter(
					'authentication',
					'oAuth2',
				) as CreatioAuthentication;
				const metadataXml = (await creatioApiRequest.call(
					this,
					authentication,
					'GET',
					'/0/odata/$metadata',
					undefined,
					{ json: false, accept: 'application/xml' },
				)) as string;

				const entityRegex = new RegExp(
					`<EntityType Name="${subpath}"[\\s\\S]*?<\\/EntityType>`,
					'g',
				);
				const entityMatch = entityRegex.exec(metadataXml);
				if (!entityMatch) {
					return [];
				}
				const propertyRegex = /<Property Name="([^"]+)"/g;
				const fields: { name: string; value: string }[] = [];
				let match;
				while ((match = propertyRegex.exec(entityMatch[0])) !== null) {
					fields.push({ name: match[1], value: match[1] });
				}
				return fields;
			},
		},
	};
	description: INodeTypeDescription = {
		displayName: 'Creatio',
		name: 'creatio',
		icon: 'file:Creatio.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Read and write records in Creatio CRM (contacts, accounts, leads, opportunities, custom objects) via OData. Use to look up, create, update, or delete Creatio CRM data.',
		defaults: {
			name: 'Creatio',
		},
		inputs: ['main'] as NodeConnectionType[],
		outputs: ['main'] as NodeConnectionType[],
		credentials: [
			{
				name: 'creatioOAuth2Api',
				required: true,
				displayOptions: {
					show: {
						authentication: ['oAuth2'],
					},
				},
			},
			{
				name: 'creatioApi',
				required: true,
				displayOptions: {
					show: {
						authentication: ['usernamePassword'],
					},
				},
			},
		],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'OAuth2',
						value: 'oAuth2',
					},
					{
						name: 'Username & Password',
						value: 'usernamePassword',
					},
				],
				default: 'oAuth2',
			},
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
								displayName: 'Field Name or ID',
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
				displayName: 'Use Self Formatted Body for Update',
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
				displayName: 'Update Body',
				name: 'body',
				type: 'json',
				default: '',
				description: 'The formatted JSON body to send',
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
								displayName: 'Field Name or ID',
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
				displayName: 'Use Self Formatted Body for Update',
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
				displayName: 'Update Body',
				name: 'body',
				type: 'json',
				default: '',
				description: 'The formatted JSON body to send',
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

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const authentication = this.getNodeParameter(
					'authentication',
					i,
					'oAuth2',
				) as CreatioAuthentication;
				const operation = this.getNodeParameter('operation', i) as string;
				let response: any;

				switch (operation) {
					case 'GET': {
						const subpath = this.getNodeParameter('subpath', i) as string;
						const selectParam = this.getNodeParameter('select', i) as string[] | string;
						const select = Array.isArray(selectParam)
							? selectParam
							: selectParam
								? selectParam.split(',').map((s) => s.trim())
								: [];
						const top = this.getNodeParameter('top', i) as number;
						const filter = this.getNodeParameter('filter', i) as string;
						const expand = this.getNodeParameter('expand', i) as string;

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
						let endpoint = `/0/odata/${subpath}`;
						if (queryParams.length > 0) {
							endpoint += `?${queryParams.join('&')}`;
						}

						response = await creatioApiRequest.call(this, authentication, 'GET', endpoint, undefined, {
							itemIndex: i,
						});
						if (response && response.value) {
							response = response.value;
						}
						break;
					}
					case 'METADATA': {
						const subpath = this.getNodeParameter('subpath', i) as string;
						const metadataXml = (await creatioApiRequest.call(
							this,
							authentication,
							'GET',
							'/0/odata/$metadata',
							undefined,
							{ json: false, accept: 'application/xml', itemIndex: i },
						)) as string;

						const entityRegex = new RegExp(
							`<EntityType Name="${subpath}"[\\s\\S]*?<\\/EntityType>`,
							'g',
						);
						const entityMatch = entityRegex.exec(metadataXml);
						const fields: { fieldName: string }[] = [];
						if (entityMatch) {
							const propertyRegex = /<Property Name="([^"]+)"/g;
							let match;
							while ((match = propertyRegex.exec(entityMatch[0])) !== null) {
								fields.push({ fieldName: match[1] });
							}
						}
						response = fields;
						break;
					}
					case 'TABLES': {
						const result = await creatioApiRequest.call(
							this,
							authentication,
							'GET',
							'/0/odata/',
							undefined,
							{ itemIndex: i },
						);
						response = (result.value || [])
							.filter((item: any) => {
								const name = (item.name as string).toLowerCase();
								return (
									!name.startsWith('vw') &&
									!name.startsWith('sys') &&
									!name.startsWith('oauth') &&
									!name.startsWith('web')
								);
							})
							.map((item: any) => ({ tableName: item.name }));
						break;
					}
					case 'POST': {
						const subpath = this.getNodeParameter('subpath', i) as string;
						const useBody = this.getNodeParameter('useBody', i, false) as boolean;
						let requestBody: IDataObject = {};
						if (useBody) {
							requestBody = this.getNodeParameter('body', i) as IDataObject;
						} else {
							const fields = this.getNodeParameter('fields', i, {}) as {
								field?: { fieldName: string; fieldValue: string }[];
							};
							if (fields.field) {
								for (const fieldData of fields.field) {
									requestBody[fieldData.fieldName] = fieldData.fieldValue;
								}
							}
						}
						response = await creatioApiRequest.call(
							this,
							authentication,
							'POST',
							`/0/odata/${subpath}`,
							requestBody,
							{ accept: '*/*', itemIndex: i },
						);
						break;
					}
					case 'PATCH': {
						const subpath = this.getNodeParameter('subpath', i) as string;
						const id = this.getNodeParameter('id', i, '') as string;
						const useBody = this.getNodeParameter('useBody', i, false) as boolean;
						let requestBody: IDataObject = {};
						if (useBody) {
							requestBody = this.getNodeParameter('body', i) as IDataObject;
						} else {
							const fields = this.getNodeParameter('fields', i, {}) as {
								field?: { fieldName: string; fieldValue: string }[];
							};
							if (fields.field) {
								for (const fieldData of fields.field) {
									if (
										fieldData.fieldValue !== '' &&
										fieldData.fieldValue !== null &&
										fieldData.fieldValue !== undefined
									) {
										requestBody[fieldData.fieldName] = fieldData.fieldValue;
									}
								}
							}
						}
						let endpoint = `/0/odata/${subpath}`;
						if (id) {
							endpoint = `/0/odata/${subpath}(${id})`;
						}
						response = await creatioApiRequest.call(
							this,
							authentication,
							'PATCH',
							endpoint,
							requestBody,
							{ accept: '*/*', itemIndex: i },
						);
						break;
					}
					case 'DELETE': {
						const subpath = this.getNodeParameter('subpath', i) as string;
						const id = this.getNodeParameter('id', i, '') as string;
						let endpoint = `/0/odata/${subpath}`;
						if (id) {
							endpoint = `/0/odata/${subpath}(${id})`;
						}
						response = await creatioApiRequest.call(
							this,
							authentication,
							'DELETE',
							endpoint,
							undefined,
							{ accept: '*/*', itemIndex: i },
						);
						if (response === '' || response === undefined || response === null) {
							response = { deleted: true };
						}
						break;
					}
					default:
						throw new NodeOperationError(
							this.getNode(),
							`Unsupported operation: ${operation}`,
							{ itemIndex: i },
						);
				}

				const appendRequest = this.getNodeParameter('appendRequest', i, false) as boolean;
				if (appendRequest && ['GET', 'POST', 'PATCH'].includes(operation)) {
					const requestFields: IDataObject = { operation };
					requestFields.subpath = this.getNodeParameter('subpath', i, '');
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
					returnData.push({ json: { ...requestFields, response }, pairedItem: { item: i } });
				} else if (Array.isArray(response)) {
					for (const entry of response) {
						returnData.push({ json: entry as IDataObject, pairedItem: { item: i } });
					}
				} else {
					returnData.push({ json: (response ?? {}) as IDataObject, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// eslint-disable-next-line @n8n/community-nodes/require-node-api-error -- error originates from the transport already wrapped as NodeApiError/NodeOperationError
				throw error;
			}
		}

		return [returnData];
	}
}
