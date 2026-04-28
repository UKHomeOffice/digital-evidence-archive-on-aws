import axios, { AxiosError, AxiosHeaders } from 'axios';
import * as apiHelper from '../../src/helpers/apiHelper';

jest.mock('axios');
const mockedAxios = jest.mocked(axios);

describe('api helper', () => {
  it('catches errors', async () => {
    mockedAxios.create.mockReturnThis();
    mockedAxios.request.mockRejectedValue('error');

    await expect(apiHelper.httpApiGet('any', {})).rejects.toThrow(
      'there was an error while trying to retrieve data'
    );
  });

  it('returns the backend response message when the API includes one', async () => {
    mockedAxios.create.mockReturnThis();
    const axiosError = new AxiosError('Request failed', 'ERR_BAD_RESPONSE');
    axiosError.response = {
      status: 500,
      statusText: 'Internal Server Error',
      data: 'Cannot complete upload for an empty file.',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
    };
    mockedAxios.request.mockRejectedValue(axiosError);

    await expect(apiHelper.httpApiPut('any', {})).rejects.toThrow(
      'Cannot complete upload for an empty file.'
    );
  });

  it('makes a get request', async () => {
    mockedAxios.create.mockReturnThis();
    mockedAxios.request.mockResolvedValue({
      data: 'hi',
      status: 200,
      statusText: 'Ok',
      headers: {},
      config: {},
    });

    const response = await apiHelper.httpApiGet('any', {});
    expect(response).toEqual('hi');
  });

  it('makes a put request', async () => {
    mockedAxios.create.mockReturnThis();
    mockedAxios.request.mockResolvedValue({
      data: 'hi',
      status: 200,
      statusText: 'Ok',
      headers: {},
      config: {},
    });

    const response = await apiHelper.httpApiPut('any', {});
    expect(response).toEqual('hi');
  });

  it('makes a delete request', async () => {
    mockedAxios.create.mockReturnThis();
    mockedAxios.request.mockResolvedValue({
      data: {},
      status: 204,
      statusText: 'Ok',
      headers: {},
      config: {},
    });

    await apiHelper.httpApiDelete('any', {});
  });
});
