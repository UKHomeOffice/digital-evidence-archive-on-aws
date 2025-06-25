import {aws4Interceptor, Credentials} from "aws4-axios";
import axios, {AxiosRequestConfig} from "axios";
import {refreshCredentials} from "../utils/refreshing-s3-client";

const urlBase = process.env.NEXT_PUBLIC_DEA_API_URL;
export const isUsingCustomDomain = strToBool(process.env.NEXT_PUBLIC_IS_USING_CUSTOM_DOMAIN);
const region = isUsingCustomDomain ? process.env.NEXT_PUBLIC_AWS_REGION : undefined;

export function strToBool(str: string | undefined): boolean {
    return str?.trim().toLowerCase() === 'true';
}

export const httpApiPost = async <T>(urlPath: string, params: unknown): Promise<T> => {
    const options = {
        method: 'POST',
        url: `${urlBase}${urlPath}`,
        data: params,
    };
    return await fetchData(options);
};

const fetchData = async <T>(options: AxiosRequestConfig): Promise<T> => {
    const accessKeyId = sessionStorage.getItem('accessKeyId');
    const secretAccessKey = sessionStorage.getItem('secretAccessKey');
    const sessionToken = sessionStorage.getItem('sessionToken');

    if (!options.url?.includes('/auth')) {
        const dateString = sessionStorage.getItem('tokenExpirationTime');
        if (dateString) {
            const dateNum = parseFloat(dateString);
            const currentTime = new Date().getTime() + 180 * 1000;
            if (currentTime >= dateNum) {
                await refreshCredentials();
            }
        }
    }

    options.headers = {
        ...options.headers,
    };
    const client = axios.create({ withCredentials: true });

    if (accessKeyId && secretAccessKey && sessionToken) {
        const credentials: Credentials = {
            accessKeyId,
            secretAccessKey,
            sessionToken,
        };
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