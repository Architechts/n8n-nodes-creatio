import { NodeApiError } from 'n8n-workflow';
import {
	mapCreatioError,
	CREATIO_AUTH_ERROR_MESSAGE,
} from '../nodes/Creatio/GenericFunctions';

const fakeNode = { name: 'Creatio', type: 'creatio', typeVersion: 1, position: [0, 0], parameters: {} } as any;

describe('mapCreatioError', () => {
	test('401 maps to a friendly stale-credential message', () => {
		const err = mapCreatioError(fakeNode, { statusCode: 401, message: 'Unauthorized' });
		expect(err).toBeInstanceOf(NodeApiError);
		expect(err.message).toContain(CREATIO_AUTH_ERROR_MESSAGE);
	});

	test('403 maps to the stale-credential message', () => {
		const err = mapCreatioError(fakeNode, { statusCode: 403, message: 'Forbidden' });
		expect(err.message).toContain(CREATIO_AUTH_ERROR_MESSAGE);
	});

	test('404 maps to a not-found message', () => {
		const err = mapCreatioError(fakeNode, { statusCode: 404, message: 'Not Found' });
		expect(err.message).toContain('not found');
	});

	test('500 maps to a server-error message', () => {
		const err = mapCreatioError(fakeNode, { statusCode: 503, message: 'Boom' });
		expect(err.message).toContain('server error');
	});

	test('always returns a NodeApiError for unknown errors', () => {
		const err = mapCreatioError(fakeNode, { message: 'weird' });
		expect(err).toBeInstanceOf(NodeApiError);
	});
});
