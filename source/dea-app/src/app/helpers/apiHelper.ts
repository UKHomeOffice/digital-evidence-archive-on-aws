/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { aws4Interceptor, Credentials } from 'aws4-axios';
import axios, { AxiosRequestConfig } from 'axios';
import { refreshCredentials } from '../utils/refresh-credentials';

const urlBase = process.env.NEXT_PUBLIC_DEA_API_URL;
export const isUsingCustomDomain = strToBool(process.env.NEXT_PUBLIC_IS_USING_CUSTOM_DOMAIN);
const region = isUsingCustomDomain ? process.env.NEXT_PUBLIC_AWS_REGION : undefined;

export function strToBool(str: string | undefined): boolean {
  return str?.trim().toLowerCase() === 'true';
}

export const httpApiPost = async <T>(
  urlPath: string,
  params: unknown,
  credentials?: Credentials
): Promise<T> => {
  const options: AxiosRequestConfig = {
    method: 'POST',
    url: `${urlBase}${urlPath}`,
    data: params,
  };
  return await fetchData<T>(options, credentials);
};

const fetchData = async <T>(options: AxiosRequestConfig, credentials?: Credentials): Promise<T> => {
  if (
    typeof window !== 'undefined' && // only in browser
    !options.url?.includes('/auth') &&
    credentials === undefined
  ) {
    const dateString = sessionStorage.getItem('tokenExpirationTime');
    const currentTime = new Date().getTime() + 180 * 1000;

    if (dateString && currentTime >= parseFloat(dateString)) {
      await refreshCredentials();
    }
  }

  const client = axios.create({ withCredentials: true });

  if (credentials) {
    const interceptor = aws4Interceptor({
      options: {
        service: 'execute-api',
        region,
      },
      credentials,
    });

    client.interceptors.request.use(interceptor);
  }

  const { data } = await client.request(options);
  return data;
};
