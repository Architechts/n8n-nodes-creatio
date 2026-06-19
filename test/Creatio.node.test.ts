import { Creatio } from '../nodes/Creatio/Creatio.node';
import { IExecuteFunctions } from 'n8n-workflow';

function makeExecuteMock(params: Record<string, any>, typeVersion = 1) {
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
			.mockReturnValue({ name: 'Creatio', type: 'creatio', typeVersion, parameters: {} }),
		getCredentials: jest.fn().mockResolvedValue({ creatioUrl: 'https://test.creatio.com' }),
		helpers: {
			httpRequest: jest.fn(),
			httpRequestWithAuthentication: jest.fn(),
			assertBinaryData: jest
				.fn()
				.mockReturnValue({ fileName: 'a.txt', mimeType: 'text/plain' }),
			getBinaryDataBuffer: jest.fn().mockResolvedValue(Buffer.from('hello')),
			prepareBinaryData: jest
				.fn()
				.mockResolvedValue({ data: 'aGVsbG8=', fileName: 'a.txt', mimeType: 'text/plain' }),
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

	test('sends an explicit empty-string field value in a PATCH so the column is cleared', async () => {
		const ctx = makeExecuteMock({
			authentication: 'oAuth2',
			operation: 'PATCH',
			subpath: 'Contact',
			id: '123',
			useBody: false,
			fields: {
				field: [
					{ fieldName: 'Name', fieldValue: 'John Doe' },
					{ fieldName: 'DenLastError', fieldValue: '' },
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
				body: { Name: 'John Doe', DenLastError: '' },
			}),
		);
	});

	test('emits zero items (not a {} placeholder) when a GET list returns zero rows', async () => {
		const ctx = makeExecuteMock({
			authentication: 'oAuth2',
			operation: 'GET',
			subpath: 'Contact',
			select: [],
			top: 10,
			filter: "Name eq 'no-such-name'",
			expand: '',
			appendRequest: false,
		});
		(ctx.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({ value: [] });

		const result = await creatioNode.execute.call(ctx);

		expect(result).toEqual([[]]);
	});

	test('emits zero items when a GET returns an empty/no-content body', async () => {
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
		(ctx.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue('');

		const result = await creatioNode.execute.call(ctx);

		expect(result).toEqual([[]]);
	});

	test('v2: resource "record" + operation "get" maps to the same GET request as v1', async () => {
		const ctx = makeExecuteMock(
			{
				authentication: 'oAuth2',
				resource: 'record',
				operation: 'get',
				subpath: 'Contact',
				select: ['Name', 'Email'],
				top: 10,
				filter: '',
				expand: '',
				appendRequest: false,
			},
			2,
		);
		(ctx.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({
			value: [{ Name: 'Test' }],
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

	test('v2: resource "record" + operation "update" maps to a PATCH request', async () => {
		const ctx = makeExecuteMock(
			{
				authentication: 'oAuth2',
				resource: 'record',
				operation: 'update',
				subpath: 'Contact',
				id: '123',
				useBody: false,
				fields: { field: [{ fieldName: 'Name', fieldValue: 'Jane' }] },
				appendRequest: false,
			},
			2,
		);
		(ctx.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({});

		await creatioNode.execute.call(ctx);

		expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
			'creatioOAuth2Api',
			expect.objectContaining({
				method: 'PATCH',
				url: 'https://test.creatio.com/0/odata/Contact(123)',
				body: { Name: 'Jane' },
			}),
		);
	});

	test('v2: resource "file" + operation "download" maps to a FileService download', async () => {
		const ctx = makeExecuteMock(
			{
				authentication: 'oAuth2',
				resource: 'file',
				operation: 'download',
				entitySchemaName: 'ContactFile',
				fileId: 'FILE-GUID',
				binaryPropertyName: 'data',
				downloadOptions: {},
			},
			2,
		);
		(ctx.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({
			body: Buffer.from('hello'),
			headers: { 'content-type': 'text/plain' },
		});

		const result = await creatioNode.execute.call(ctx);

		const opts = (ctx.helpers.httpRequestWithAuthentication as jest.Mock).mock.calls[0][1];
		expect(opts.url).toBe('https://test.creatio.com/0/rest/FileService/Download/ContactFile/FILE-GUID');
		expect(result[0][0].binary?.data).toBeDefined();
	});

	test('v1 back-compat: legacy uppercase operation "GET" still executes on a v1 node', async () => {
		const ctx = makeExecuteMock({
			authentication: 'oAuth2',
			operation: 'GET',
			subpath: 'Contact',
			select: [],
			top: 5,
			filter: '',
			expand: '',
			appendRequest: false,
		}); // typeVersion defaults to 1, and no `resource` param
		(ctx.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({ value: [] });

		const result = await creatioNode.execute.call(ctx);

		expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
			'creatioOAuth2Api',
			expect.objectContaining({
				method: 'GET',
				url: 'https://test.creatio.com/0/odata/Contact?$top=5',
			}),
		);
		expect(result).toEqual([[]]);
	});

	test('throws a clear error for an unsupported operation', async () => {
		const ctx = makeExecuteMock({
			authentication: 'oAuth2',
			operation: 'BOGUS',
		});

		await expect(creatioNode.execute.call(ctx)).rejects.toThrow('Unsupported operation: BOGUS');
	});

	test('UPLOAD reads binary and calls FileApiService with an auto-generated GUID', async () => {
		const ctx = makeExecuteMock({
			authentication: 'oAuth2',
			operation: 'UPLOAD',
			binaryPropertyName: 'data',
			entitySchemaName: 'ContactFile',
			columnName: 'Data',
			parentColumnName: 'Contact',
			parentColumnValue: 'PARENT-GUID',
			uploadOptions: {},
		});
		(ctx.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({ success: true });

		const result = await creatioNode.execute.call(ctx);

		const opts = (ctx.helpers.httpRequestWithAuthentication as jest.Mock).mock.calls[0][1];
		expect(opts.url).toContain('/0/rest/FileApiService/UploadFile');
		expect(opts.url).toMatch(/fileId=[0-9a-f-]{36}/);
		expect(opts.headers['Content-Range']).toBe('bytes 0-4/5');
		expect(result[0][0].json.fileId).toMatch(/[0-9a-f-]{36}/);
	});

	test('UPLOAD honours fileId / fileName / mimeType / additionalParams overrides', async () => {
		const ctx = makeExecuteMock({
			authentication: 'oAuth2',
			operation: 'UPLOAD',
			binaryPropertyName: 'data',
			entitySchemaName: 'ContactFile',
			columnName: 'Data',
			parentColumnName: 'Contact',
			parentColumnValue: 'PARENT-GUID',
			uploadOptions: {
				fileId: 'my-guid',
				fileName: 'override.pdf',
				mimeType: 'application/pdf',
				additionalParams: '{"RecordSchemaName":"DenCandidate"}',
			},
		});
		(ctx.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({ success: true });

		const result = await creatioNode.execute.call(ctx);

		const opts = (ctx.helpers.httpRequestWithAuthentication as jest.Mock).mock.calls[0][1];
		expect(opts.url).toContain('fileId=my-guid');
		expect(opts.url).toContain('fileName=override.pdf');
		expect(opts.headers['Content-Type']).toBe('application/pdf');
		expect(decodeURIComponent(opts.url)).toContain('{"RecordSchemaName":"DenCandidate"}');
		expect(result[0][0].json.fileId).toBe('my-guid');
	});

	test('DOWNLOAD writes the file to a binary output property', async () => {
		const ctx = makeExecuteMock({
			authentication: 'oAuth2',
			operation: 'DOWNLOAD',
			entitySchemaName: 'ContactFile',
			fileId: 'FILE-GUID',
			binaryPropertyName: 'data',
			downloadOptions: {},
		});
		(ctx.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({
			body: Buffer.from('hello'),
			headers: { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="cv.txt"' },
		});

		const result = await creatioNode.execute.call(ctx);

		const opts = (ctx.helpers.httpRequestWithAuthentication as jest.Mock).mock.calls[0][1];
		expect(opts.url).toBe('https://test.creatio.com/0/rest/FileService/Download/ContactFile/FILE-GUID');
		expect(result[0][0].binary?.data).toBeDefined();
		expect(result[0][0].json.fileName).toBe('cv.txt');
		expect(ctx.helpers.prepareBinaryData).toHaveBeenCalledWith(
			expect.any(Buffer),
			'cv.txt',
			'text/plain',
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
