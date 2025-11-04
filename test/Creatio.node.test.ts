import { Creatio } from '../nodes/Creatio/Creatio.node';
import { IExecuteFunctions } from 'n8n-workflow';

describe('Creatio Node', () => {
  let mockExecuteFunctions: Partial<IExecuteFunctions>;
  let creatioNode: Creatio;

  beforeEach(() => {
    creatioNode = new Creatio();
    mockExecuteFunctions = {
      getInputData: jest.fn().mockReturnValue([{}]),
      getNodeParameter: jest.fn(),
      getCredentials: jest.fn().mockResolvedValue({
        creatioUrl: 'https://test.creatio.com',
        username: 'testuser',
        password: 'testpass'
      }),
      helpers: {
        request: jest.fn(),
        returnJsonArray: jest.fn().mockImplementation((data) => data)
      } as any
    };
  });

  test('should build correct URL for GET operation', async () => {
    (mockExecuteFunctions.getNodeParameter as jest.Mock)
      .mockReturnValueOnce('GET') // operation
      .mockReturnValueOnce('Contact') // subpath
      .mockReturnValueOnce(['Name', 'Email']) // select
      .mockReturnValueOnce(10) // top
      .mockReturnValueOnce('') // filter
      .mockReturnValueOnce('') // expand
      .mockReturnValueOnce(false); // appendRequest

    (mockExecuteFunctions.helpers!.request as jest.Mock).mockResolvedValue({
      value: [{ Name: 'Test', Email: 'test@test.com' }]
    });

    jest.spyOn(Creatio, 'authenticateAndGetCookies').mockResolvedValue({
      authCookie: 'auth=test',
      csrfCookie: 'csrf=token',
      bpmLoader: 'loader=test',
      sessionIdCookie: 'session=test',
      userType: 'UserType=General',
      creatioUrl: 'https://test.creatio.com',
      cookies: []
    });

    await creatioNode.execute.call(mockExecuteFunctions as IExecuteFunctions);

    expect(mockExecuteFunctions.helpers!.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://test.creatio.com/0/odata/Contact?$select=Name%2CEmail&$top=10'
      })
    );
  });

  test('should filter empty fields in PATCH operation', async () => {
    (mockExecuteFunctions.getNodeParameter as jest.Mock)
      .mockReturnValueOnce('PATCH') // operation
      .mockReturnValueOnce('Contact') // subpath
      .mockReturnValueOnce('123') // id
      .mockReturnValueOnce(false) // useBody
      .mockReturnValueOnce({ // fields
        field: [
          { fieldName: 'Name', fieldValue: 'John Doe' },
          { fieldName: 'Email', fieldValue: '' }
        ]
      })
      .mockReturnValueOnce(false); // appendRequest

    (mockExecuteFunctions.helpers!.request as jest.Mock).mockResolvedValue({});

    jest.spyOn(Creatio, 'authenticateAndGetCookies').mockResolvedValue({
      authCookie: 'auth=test',
      csrfCookie: 'csrf=token',
      bpmLoader: 'loader=test',
      sessionIdCookie: 'session=test',
      userType: 'UserType=General',
      creatioUrl: 'https://test.creatio.com',
      cookies: []
    });

    await creatioNode.execute.call(mockExecuteFunctions as IExecuteFunctions);

    expect(mockExecuteFunctions.helpers!.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PATCH',
        body: { Name: 'John Doe' } // Email should be filtered out
      })
    );
  });
});
