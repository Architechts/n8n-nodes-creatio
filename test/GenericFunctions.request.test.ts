import {
	creatioApiRequest,
	getCreatioLegacySession,
	CREATIO_AUTH_ERROR_MESSAGE,
} from '../nodes/Creatio/GenericFunctions';

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
