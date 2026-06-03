import {
	creatioApiRequest,
	creatioFileUploadRequest,
	creatioFileDownloadRequest,
	getCreatioLegacySession,
	CREATIO_AUTH_ERROR_MESSAGE,
} from '../nodes/Creatio/GenericFunctions';

const UPLOAD_PARAMS = {
	fileId: 'fixed-guid',
	totalFileLength: 5,
	mimeType: 'text/plain',
	fileName: 'a.txt',
	columnName: 'Data',
	entitySchemaName: 'ContactFile',
	parentColumnName: 'Contact',
	parentColumnValue: 'PARENT-GUID',
};

function makeContext() {
	return {
		getNode: jest.fn().mockReturnValue({ name: 'Creatio', type: 'creatio', typeVersion: 1 }),
		getCredentials: jest.fn(),
		helpers: {
			httpRequest: jest.fn(),
			httpRequestWithAuthentication: jest.fn(),
		},
	} as any;
}

describe('creatioApiRequest (OAuth2)', () => {
	test('routes through httpRequestWithAuthentication with the OAuth2 credential', async () => {
		const ctx = makeContext();
		ctx.getCredentials.mockResolvedValue({ creatioUrl: 'https://test.creatio.com/' });
		ctx.helpers.httpRequestWithAuthentication.mockResolvedValue({ value: [{ Id: '1' }] });

		const result = await creatioApiRequest.call(
			ctx,
			'oAuth2',
			'GET',
			'/0/odata/Contact',
			undefined,
			{ itemIndex: 0 },
		);

		expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
			'creatioOAuth2Api',
			expect.objectContaining({
				method: 'GET',
				url: 'https://test.creatio.com/0/odata/Contact',
			}),
		);
		expect(result.value[0].Id).toBe('1');
	});
});

describe('getCreatioLegacySession', () => {
	test('builds a cookie header and CSRF token from Set-Cookie', async () => {
		const ctx = makeContext();
		ctx.getCredentials.mockResolvedValue({ username: 'u', password: 'p' });
		ctx.helpers.httpRequest.mockResolvedValue({
			body: { Code: 0 },
			headers: {
				'set-cookie': [
					'.ASPXAUTH=auth123; path=/; HttpOnly',
					'BPMCSRF=csrf456; path=/',
					'BPMLOADER=loader789; path=/',
					'BPMSESSIONID=sess000; path=/',
				],
			},
		});

		const session = await getCreatioLegacySession(ctx, 'https://test.creatio.com');

		expect(session.csrfToken).toBe('csrf456');
		expect(session.cookieHeader).toContain('.ASPXAUTH=auth123');
		expect(session.cookieHeader).toContain('BPMCSRF=csrf456');
		expect(session.cookieHeader).toContain('UserType=General');
		expect(session.cookieHeader).toContain('BPMLOADER=loader789');
		expect(session.cookieHeader).toContain('BPMSESSIONID=sess000');
	});

	test('throws a friendly error when login returns Code != 0', async () => {
		const ctx = makeContext();
		ctx.getCredentials.mockResolvedValue({ username: 'u', password: 'bad' });
		ctx.helpers.httpRequest.mockResolvedValue({
			body: { Code: 1, Message: 'wrong' },
			headers: {},
		});

		await expect(getCreatioLegacySession(ctx, 'https://test.creatio.com')).rejects.toThrow(
			CREATIO_AUTH_ERROR_MESSAGE,
		);
	});
});

describe('creatioApiRequest (legacy)', () => {
	test('logs in then sends cookie + BPMCSRF headers on the data request', async () => {
		const ctx = makeContext();
		ctx.getCredentials.mockResolvedValue({
			creatioUrl: 'https://test.creatio.com',
			username: 'u',
			password: 'p',
		});
		ctx.helpers.httpRequest
			.mockResolvedValueOnce({
				body: { Code: 0 },
				headers: { 'set-cookie': ['.ASPXAUTH=a; path=/', 'BPMCSRF=c; path=/'] },
			})
			.mockResolvedValueOnce({ value: [] });

		await creatioApiRequest.call(ctx, 'usernamePassword', 'GET', '/0/odata/Contact', undefined, {
			itemIndex: 0,
		});

		const dataCall = ctx.helpers.httpRequest.mock.calls[1][0];
		expect(dataCall.url).toBe('https://test.creatio.com/0/odata/Contact');
		expect(dataCall.headers.BPMCSRF).toBe('c');
		expect(dataCall.headers.Cookie).toContain('.ASPXAUTH=a');
	});
});

describe('creatioFileUploadRequest (OAuth2)', () => {
	test('POSTs to FileApiService with query, Content-Range and a Buffer body', async () => {
		const ctx = makeContext();
		ctx.getCredentials.mockResolvedValue({ creatioUrl: 'https://test.creatio.com/' });
		ctx.helpers.httpRequestWithAuthentication.mockResolvedValue({ success: true });

		const buf = Buffer.from('hello');
		await creatioFileUploadRequest.call(ctx, 'oAuth2', UPLOAD_PARAMS, buf, { itemIndex: 0 });

		const call = ctx.helpers.httpRequestWithAuthentication.mock.calls[0];
		expect(call[0]).toBe('creatioOAuth2Api');
		const opts = call[1];
		expect(opts.method).toBe('POST');
		expect(opts.url).toContain('/0/rest/FileApiService/UploadFile?');
		expect(opts.url).toContain('entitySchemaName=ContactFile');
		expect(opts.url).toContain('parentColumnValue=PARENT-GUID');
		expect(opts.headers['Content-Range']).toBe('bytes 0-4/5');
		expect(opts.headers['Content-Type']).toBe('text/plain');
		expect(opts.headers['Content-Disposition']).toContain('a.txt');
		expect(Buffer.isBuffer(opts.body)).toBe(true);
		expect(opts.json).toBe(false);
	});

	test('appends AdditionalParams only when provided', async () => {
		const ctx = makeContext();
		ctx.getCredentials.mockResolvedValue({ creatioUrl: 'https://test.creatio.com' });
		ctx.helpers.httpRequestWithAuthentication.mockResolvedValue({ success: true });

		await creatioFileUploadRequest.call(
			ctx,
			'oAuth2',
			{ ...UPLOAD_PARAMS, additionalParams: '{"RecordSchemaName":"DenCandidate"}' },
			Buffer.from('hello'),
			{ itemIndex: 0 },
		);

		const opts = ctx.helpers.httpRequestWithAuthentication.mock.calls[0][1];
		expect(opts.url).toContain('AdditionalParams=');
		expect(decodeURIComponent(opts.url)).toContain('{"RecordSchemaName":"DenCandidate"}');
	});
});

describe('creatioFileUploadRequest (legacy)', () => {
	test('logs in then sends cookie + BPMCSRF headers with the Buffer body', async () => {
		const ctx = makeContext();
		ctx.getCredentials.mockResolvedValue({
			creatioUrl: 'https://test.creatio.com',
			username: 'u',
			password: 'p',
		});
		ctx.helpers.httpRequest
			.mockResolvedValueOnce({
				body: { Code: 0 },
				headers: { 'set-cookie': ['.ASPXAUTH=a; path=/', 'BPMCSRF=c; path=/'] },
			})
			.mockResolvedValueOnce({ success: true });

		await creatioFileUploadRequest.call(ctx, 'usernamePassword', UPLOAD_PARAMS, Buffer.from('hello'), {
			itemIndex: 0,
		});

		const dataCall = ctx.helpers.httpRequest.mock.calls[1][0];
		expect(dataCall.url).toContain('/0/rest/FileApiService/UploadFile?');
		expect(dataCall.headers.BPMCSRF).toBe('c');
		expect(dataCall.headers.Cookie).toContain('.ASPXAUTH=a');
		expect(Buffer.isBuffer(dataCall.body)).toBe(true);
	});
});

describe('creatioFileDownloadRequest (OAuth2)', () => {
	test('GETs FileService/Download with arraybuffer + full response', async () => {
		const ctx = makeContext();
		ctx.getCredentials.mockResolvedValue({ creatioUrl: 'https://test.creatio.com/' });
		ctx.helpers.httpRequestWithAuthentication.mockResolvedValue({
			body: Buffer.from('hello'),
			headers: { 'content-type': 'text/plain' },
		});

		await creatioFileDownloadRequest.call(ctx, 'oAuth2', 'ContactFile', 'FILE-GUID', {
			itemIndex: 0,
		});

		const opts = ctx.helpers.httpRequestWithAuthentication.mock.calls[0][1];
		expect(opts.method).toBe('GET');
		expect(opts.url).toBe('https://test.creatio.com/0/rest/FileService/Download/ContactFile/FILE-GUID');
		expect(opts.encoding).toBe('arraybuffer');
		expect(opts.returnFullResponse).toBe(true);
	});
});
