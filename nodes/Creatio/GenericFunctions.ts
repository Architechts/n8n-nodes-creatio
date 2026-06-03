// Copyright 2025 Architechts
//
// Use of this software is governed by the Business Source License
// included in the file LICENSE.md.

import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export type CreatioAuthentication = 'oAuth2' | 'usernamePassword';

export const CREATIO_AUTH_ERROR_MESSAGE = 'Creatio authentication failed';
export const CREATIO_AUTH_ERROR_DESCRIPTION =
	"Your Creatio credentials appear to be invalid or expired. Check the credential's Client ID/Secret (OAuth2) or username/password, then reconnect.";

function getStatusCode(error: any): number | undefined {
	const raw =
		error?.statusCode ??
		error?.httpCode ??
		error?.response?.statusCode ??
		error?.response?.status ??
		error?.cause?.statusCode;
	if (raw === undefined || raw === null) {
		return undefined;
	}
	const code = Number(raw);
	return Number.isNaN(code) ? undefined : code;
}

export function mapCreatioError(node: INode, error: any, itemIndex?: number): NodeApiError {
	const statusCode = getStatusCode(error);
	const options: { message?: string; description?: string; itemIndex?: number } = {};
	if (itemIndex !== undefined) {
		options.itemIndex = itemIndex;
	}

	if (statusCode === 401 || statusCode === 403) {
		options.message = CREATIO_AUTH_ERROR_MESSAGE;
		options.description = CREATIO_AUTH_ERROR_DESCRIPTION;
	} else if (statusCode === 404) {
		options.message = 'Creatio resource not found';
		options.description =
			'The requested Creatio entity or record was not found. Check the entity (subpath) name and record ID.';
	} else if (typeof statusCode === 'number' && statusCode >= 500) {
		options.message = 'Creatio server error';
		options.description =
			'Creatio returned a server error. Please try again, or check that your Creatio instance is available.';
	}

	return new NodeApiError(node, error as JsonObject, options);
}

export interface CreatioRequestOptions {
	json?: boolean;
	accept?: string;
	itemIndex?: number;
}

export async function getCreatioBaseUrl(
	context: IExecuteFunctions | ILoadOptionsFunctions,
	authentication: CreatioAuthentication,
): Promise<string> {
	const credName = authentication === 'oAuth2' ? 'creatioOAuth2Api' : 'creatioApi';
	const credentials = await context.getCredentials(credName);
	return (credentials.creatioUrl as string).trim().replace(/\/$/, '');
}

export async function getCreatioLegacySession(
	context: IExecuteFunctions | ILoadOptionsFunctions,
	baseUrl: string,
): Promise<{ cookieHeader: string; csrfToken: string }> {
	const credentials = await context.getCredentials('creatioApi');

	const response = await context.helpers.httpRequest({
		method: 'POST',
		url: `${baseUrl}/ServiceModel/AuthService.svc/Login`,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			ForceUseSession: 'true',
		},
		body: {
			UserName: credentials.username as string,
			UserPassword: credentials.password as string,
		},
		json: true,
		returnFullResponse: true,
	});

	const loginBody = (response.body ?? {}) as IDataObject;
	if (typeof loginBody.Code === 'number' && loginBody.Code !== 0) {
		throw new NodeApiError(context.getNode(), loginBody as JsonObject, {
			message: CREATIO_AUTH_ERROR_MESSAGE,
			description: CREATIO_AUTH_ERROR_DESCRIPTION,
		});
	}

	const setCookie = response.headers['set-cookie'] as string[] | undefined;
	if (!setCookie || setCookie.length === 0) {
		throw new NodeApiError(context.getNode(), (response.body ?? {}) as JsonObject, {
			message: CREATIO_AUTH_ERROR_MESSAGE,
			description: CREATIO_AUTH_ERROR_DESCRIPTION,
		});
	}

	const pick = (prefix: string) => setCookie.find((c) => c.startsWith(prefix))?.split(';')[0];
	const cookieHeader = [
		pick('BPMSESSIONID='),
		pick('.ASPXAUTH='),
		pick('BPMCSRF='),
		pick('BPMLOADER='),
		'UserType=General',
	]
		.filter(Boolean)
		.join('; ');

	const csrfRaw = setCookie.find((c) => c.startsWith('BPMCSRF='));
	const csrfToken = csrfRaw ? csrfRaw.slice('BPMCSRF='.length).split(';')[0] : '';

	return { cookieHeader, csrfToken };
}

export async function creatioApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	authentication: CreatioAuthentication,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject | string,
	options: CreatioRequestOptions = {},
): Promise<any> {
	const json = options.json ?? true;
	const accept = options.accept ?? 'application/json';
	const baseUrl = await getCreatioBaseUrl(this, authentication);
	const url = `${baseUrl}${endpoint}`;

	try {
		if (authentication === 'oAuth2') {
			const requestOptions: IHttpRequestOptions = {
				method,
				url,
				headers: { Accept: accept },
				json,
			};
			if (body !== undefined) {
				requestOptions.body = body;
			}
			return await this.helpers.httpRequestWithAuthentication.call(
				this,
				'creatioOAuth2Api',
				requestOptions,
			);
		}

		const { cookieHeader, csrfToken } = await getCreatioLegacySession(this, baseUrl);
		const requestOptions: IHttpRequestOptions = {
			method,
			url,
			headers: {
				Accept: accept,
				Cookie: cookieHeader,
				BPMCSRF: csrfToken,
			},
			json,
		};
		if (body !== undefined) {
			requestOptions.body = body;
		}
		return await this.helpers.httpRequest(requestOptions);
	} catch (error) {
		// Re-wrap our own friendly auth errors unchanged; map raw HTTP errors.
		if (error instanceof NodeApiError) {
			// eslint-disable-next-line @n8n/community-nodes/require-node-api-error -- already a NodeApiError; re-throwing unchanged
			throw error;
		}
		throw mapCreatioError(this.getNode(), error, options.itemIndex);
	}
}

export interface CreatioFileUploadParams {
	fileId: string;
	totalFileLength: number;
	mimeType: string;
	fileName: string;
	columnName: string;
	entitySchemaName: string;
	parentColumnName: string;
	parentColumnValue: string;
	additionalParams?: string;
}

// Uploads a binary file via Creatio's FileApiService (single-request: the whole file in one POST).
// This is a different API surface than OData (/0/rest/ vs /0/odata/), with a raw Buffer body and
// Content-Range / Content-Disposition headers, so it does not reuse creatioApiRequest.
export async function creatioFileUploadRequest(
	this: IExecuteFunctions,
	authentication: CreatioAuthentication,
	params: CreatioFileUploadParams,
	body: Buffer,
	options: { itemIndex?: number } = {},
): Promise<any> {
	const baseUrl = await getCreatioBaseUrl(this, authentication);

	const qs = new URLSearchParams({
		fileId: params.fileId,
		totalFileLength: String(params.totalFileLength),
		mimeType: params.mimeType,
		fileName: params.fileName,
		columnName: params.columnName,
		entitySchemaName: params.entitySchemaName,
		parentColumnName: params.parentColumnName,
		parentColumnValue: params.parentColumnValue,
	});
	if (params.additionalParams) {
		qs.append('AdditionalParams', params.additionalParams);
	}
	const url = `${baseUrl}/0/rest/FileApiService/UploadFile?${qs.toString()}`;

	const fileHeaders = {
		'Content-Range': `bytes 0-${params.totalFileLength - 1}/${params.totalFileLength}`,
		'Content-Type': params.mimeType,
		'Content-Disposition': `attachment; filename=${params.fileName}`,
	};

	try {
		if (authentication === 'oAuth2') {
			const requestOptions: IHttpRequestOptions = {
				method: 'POST',
				url,
				headers: { Accept: 'application/json', ...fileHeaders },
				body,
				json: false,
			};
			return await this.helpers.httpRequestWithAuthentication.call(
				this,
				'creatioOAuth2Api',
				requestOptions,
			);
		}

		const { cookieHeader, csrfToken } = await getCreatioLegacySession(this, baseUrl);
		const requestOptions: IHttpRequestOptions = {
			method: 'POST',
			url,
			headers: {
				Accept: 'application/json',
				Cookie: cookieHeader,
				BPMCSRF: csrfToken,
				...fileHeaders,
			},
			body,
			json: false,
		};
		return await this.helpers.httpRequest(requestOptions);
	} catch (error) {
		if (error instanceof NodeApiError) {
			// eslint-disable-next-line @n8n/community-nodes/require-node-api-error -- already a NodeApiError; re-throwing unchanged
			throw error;
		}
		throw mapCreatioError(this.getNode(), error, options.itemIndex);
	}
}

// Downloads a file from Creatio's FileService and returns the full HTTP response so the caller can
// read the raw bytes (body), Content-Type and Content-Disposition headers. Note: the download
// endpoint lives under FileService, not FileApiService.
export async function creatioFileDownloadRequest(
	this: IExecuteFunctions,
	authentication: CreatioAuthentication,
	entitySchemaName: string,
	fileId: string,
	options: { itemIndex?: number } = {},
): Promise<any> {
	const baseUrl = await getCreatioBaseUrl(this, authentication);
	const url = `${baseUrl}/0/rest/FileService/Download/${encodeURIComponent(
		entitySchemaName,
	)}/${encodeURIComponent(fileId)}`;

	try {
		if (authentication === 'oAuth2') {
			const requestOptions: IHttpRequestOptions = {
				method: 'GET',
				url,
				encoding: 'arraybuffer',
				returnFullResponse: true,
				json: false,
			};
			return await this.helpers.httpRequestWithAuthentication.call(
				this,
				'creatioOAuth2Api',
				requestOptions,
			);
		}

		const { cookieHeader, csrfToken } = await getCreatioLegacySession(this, baseUrl);
		const requestOptions: IHttpRequestOptions = {
			method: 'GET',
			url,
			headers: {
				Cookie: cookieHeader,
				BPMCSRF: csrfToken,
			},
			encoding: 'arraybuffer',
			returnFullResponse: true,
			json: false,
		};
		return await this.helpers.httpRequest(requestOptions);
	} catch (error) {
		if (error instanceof NodeApiError) {
			// eslint-disable-next-line @n8n/community-nodes/require-node-api-error -- already a NodeApiError; re-throwing unchanged
			throw error;
		}
		throw mapCreatioError(this.getNode(), error, options.itemIndex);
	}
}
