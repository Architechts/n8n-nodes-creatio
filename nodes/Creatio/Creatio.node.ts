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

import { randomUUID } from 'node:crypto';

import {
	creatioApiRequest,
	creatioFileUploadRequest,
	creatioFileDownloadRequest,
	CreatioAuthentication,
} from './GenericFunctions';

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
						name: 'Download File',
						description: 'Download a file from a Creatio file entity by its file ID',
						value: 'DOWNLOAD',
						action: 'Download a file',
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
					},
					{
						name: 'Upload File',
						description: 'Upload a binary file to a Creatio file entity (e.g. ContactFile)',
						value: 'UPLOAD',
						action: 'Upload a file',
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
			//         UPLOAD FILE
			// ----------------------------------
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				description: 'Name of the binary property on the input item that holds the file',
				displayOptions: {
					show: {
						operation: ['UPLOAD'],
					},
				},
			},
			{
				displayName: 'Entity Schema Name',
				name: 'entitySchemaName',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'ContactFile',
				description: 'The Creatio file entity schema, e.g. ContactFile, AccountFile or SysFile',
				displayOptions: {
					show: {
						operation: ['UPLOAD'],
					},
				},
			},
			{
				displayName: 'Column Name',
				name: 'columnName',
				type: 'string',
				default: 'Data',
				required: true,
				description: 'The file data column on the file entity (almost always "Data")',
				displayOptions: {
					show: {
						operation: ['UPLOAD'],
					},
				},
			},
			{
				displayName: 'Parent Column Name',
				name: 'parentColumnName',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'Contact',
				description: 'FK column linking the file to its parent record, e.g. Contact or RecordId',
				displayOptions: {
					show: {
						operation: ['UPLOAD'],
					},
				},
			},
			{
				displayName: 'Parent Column Value',
				name: 'parentColumnValue',
				type: 'string',
				default: '',
				required: true,
				description: 'GUID of the parent record the file attaches to',
				displayOptions: {
					show: {
						operation: ['UPLOAD'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'uploadOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['UPLOAD'],
					},
				},
				options: [
					{
						displayName: 'Additional Params (JSON)',
						name: 'additionalParams',
						type: 'json',
						default: '',
						description:
							'JSON string passed as AdditionalParams, e.g. {"RecordSchemaName":"DenCandidate"}',
					},
					{
						displayName: 'File ID',
						name: 'fileId',
						type: 'string',
						default: '',
						description: 'GUID for the file. Leave empty to auto-generate a new GUID for a new upload.',
					},
					{
						displayName: 'File Name',
						name: 'fileName',
						type: 'string',
						default: '',
						description: 'Override the file name. Defaults to the binary metadata fileName.',
					},
					{
						displayName: 'MIME Type',
						name: 'mimeType',
						type: 'string',
						default: '',
						description: 'Override the MIME type. Defaults to the binary metadata mimeType.',
					},
				],
			},

			// ----------------------------------
			//         DOWNLOAD FILE
			// ----------------------------------
			{
				displayName: 'Entity Schema Name',
				name: 'entitySchemaName',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'ContactFile',
				description: 'The Creatio file entity schema, e.g. ContactFile, AccountFile or SysFile',
				displayOptions: {
					show: {
						operation: ['DOWNLOAD'],
					},
				},
			},
			{
				displayName: 'File ID',
				name: 'fileId',
				type: 'string',
				default: '',
				required: true,
				description: 'GUID of the file record to download',
				displayOptions: {
					show: {
						operation: ['DOWNLOAD'],
					},
				},
			},
			{
				displayName: 'Put Output File in Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				description: 'Name of the binary property to write the downloaded file to',
				displayOptions: {
					show: {
						operation: ['DOWNLOAD'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'downloadOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['DOWNLOAD'],
					},
				},
				options: [
					{
						displayName: 'File Name',
						name: 'fileName',
						type: 'string',
						default: '',
						description:
							'Override the saved file name. Defaults to the name returned by Creatio.',
					},
				],
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
					case 'UPLOAD': {
						const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
						const entitySchemaName = this.getNodeParameter('entitySchemaName', i) as string;
						const columnName = this.getNodeParameter('columnName', i, 'Data') as string;
						const parentColumnName = this.getNodeParameter('parentColumnName', i) as string;
						const parentColumnValue = this.getNodeParameter('parentColumnValue', i) as string;
						const uploadOptions = this.getNodeParameter('uploadOptions', i, {}) as IDataObject;

						const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
						const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

						const fileName =
							(uploadOptions.fileName as string) || binaryData.fileName || 'file';
						const mimeType =
							(uploadOptions.mimeType as string) ||
							binaryData.mimeType ||
							'application/octet-stream';
						const fileId = (uploadOptions.fileId as string) || randomUUID();
						const rawAdditional = uploadOptions.additionalParams;
						const additionalParams =
							rawAdditional === undefined || rawAdditional === null || rawAdditional === ''
								? undefined
								: typeof rawAdditional === 'string'
									? rawAdditional
									: JSON.stringify(rawAdditional);

						response = await creatioFileUploadRequest.call(
							this,
							authentication,
							{
								fileId,
								totalFileLength: buffer.length,
								mimeType,
								fileName,
								columnName,
								entitySchemaName,
								parentColumnName,
								parentColumnValue,
								additionalParams,
							},
							buffer,
							{ itemIndex: i },
						);

						if (response === '' || response === undefined || response === null) {
							response = { success: true, fileId };
						} else if (typeof response === 'string') {
							try {
								response = JSON.parse(response);
							} catch {
								response = { raw: response };
							}
							(response as IDataObject).fileId ??= fileId;
						} else {
							(response as IDataObject).fileId ??= fileId;
						}
						break;
					}
					case 'DOWNLOAD': {
						const entitySchemaName = this.getNodeParameter('entitySchemaName', i) as string;
						const fileId = this.getNodeParameter('fileId', i) as string;
						const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
						const downloadOptions = this.getNodeParameter(
							'downloadOptions',
							i,
							{},
						) as IDataObject;

						const full = await creatioFileDownloadRequest.call(
							this,
							authentication,
							entitySchemaName,
							fileId,
							{ itemIndex: i },
						);

						const buffer = Buffer.from(full.body as Buffer);
						const headers = (full.headers ?? {}) as IDataObject;
						const contentDisposition = (headers['content-disposition'] as string) || '';
						const dispositionName = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(
							contentDisposition,
						);
						const fileName =
							(downloadOptions.fileName as string) ||
							(dispositionName ? decodeURIComponent(dispositionName[1]) : '') ||
							fileId;
						const mimeType =
							(headers['content-type'] as string) || 'application/octet-stream';

						const binary = await this.helpers.prepareBinaryData(buffer, fileName, mimeType);
						returnData.push({
							json: { fileId, fileName, mimeType },
							binary: { [binaryPropertyName]: binary },
							pairedItem: { item: i },
						});
						continue;
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
