import { Creatio } from '../nodes/Creatio/Creatio.node';
import { IExecuteFunctions } from 'n8n-workflow';

function makeExecuteMock(params: Record<string, any>) {
	const getNodeParameter = jest.fn(
		(name: string, _i?: number, fallback?: any) =>
			params[name] !== undefined ? params[name] : fallback,
	);
	return {
		getInputData: jest.fn().mockReturnValue([{ json: {} }]),
		getNodeParameter,
		continueOnFail: jest.fn().mockReturnValue(false),
		getNode: jest
			.fn()
			.mockReturnValue({ name: 'Creatio', type: 'creatio', typeVersion: 1, parameters: {} }),
		getCredentials: jest.fn().mockResolvedValue({ creatioUrl: 'https://test.creatio.com' }),
		helpers: {
			httpRequest: jest.fn(),
			httpRequestWithAuthentication: jest.fn(),
		},
	} as unknown as IExecuteFunctions;
}

describe('Creatio Node', () => {
	let creatioNode: Creatio;

	beforeEach(() => {
		creatioNode = new Creatio();
	});

	test('builds the correct URL for a GET via the OAuth2 transport', async () => {
		const ctx = makeExecuteMock({
			authentication: 'oAuth2',
			operation: 'GET',
			subpath: 'Contact',
			select: ['Name', 'Email'],
			top: 10,
			filter: '',
			expand: '',
			appendRequest: false,
		});
		(ctx.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({
			value: [{ Name: 'Test', Email: 'test@test.com' }],
		});

		await creatioNode.execute.call(ctx);

		expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
			'creatioOAuth2Api',
			expect.objectContaining({
				method: 'GET',
				url: 'https://test.creatio.com/0/odata/Contact?$select=Name%2CEmail&$top=10',
			}),
		);
	});

	test('filters empty fields in a PATCH operation', async () => {
		const ctx = makeExecuteMock({
			authentication: 'oAuth2',
			operation: 'PATCH',
			subpath: 'Contact',
			id: '123',
			useBody: false,
			fields: {
				field: [
					{ fieldName: 'Name', fieldValue: 'John Doe' },
					{ fieldName: 'Email', fieldValue: '' },
				],
			},
			appendRequest: false,
		});
		(ctx.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({});

		await creatioNode.execute.call(ctx);

		expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
			'creatioOAuth2Api',
			expect.objectContaining({
				method: 'PATCH',
				body: { Name: 'John Doe' },
			}),
		);
	});

	test('continueOnFail emits an error item instead of throwing', async () => {
		const ctx = makeExecuteMock({
			authentication: 'oAuth2',
			operation: 'GET',
			subpath: 'Contact',
			select: [],
			top: 10,
			filter: '',
			expand: '',
			appendRequest: false,
		});
		(ctx.continueOnFail as jest.Mock).mockReturnValue(true);
		(ctx.helpers.httpRequestWithAuthentication as jest.Mock).mockRejectedValue(
			Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
		);

		const result = await creatioNode.execute.call(ctx);

		expect(result[0][0].json.error).toBeDefined();
		expect(result[0][0].pairedItem).toEqual({ item: 0 });
	});
});
