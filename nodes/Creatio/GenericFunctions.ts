// Copyright 2025 Architechts
//
// Use of this software is governed by the Business Source License
// included in the file LICENSE.md.

import type { INode, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export type CreatioAuthentication = 'oAuth2' | 'usernamePassword';

export const CREATIO_AUTH_ERROR_MESSAGE = 'Creatio authentication failed';
export const CREATIO_AUTH_ERROR_DESCRIPTION =
	"Your Creatio credentials appear to be invalid or expired. Check the credential's Client ID/Secret (OAuth2) or username/password, then reconnect.";

function getStatusCode(error: any): number | undefined {
	return (
		error?.statusCode ??
		error?.httpCode ??
		error?.response?.statusCode ??
		error?.cause?.statusCode
	);
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
