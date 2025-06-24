import { S3Client } from '@aws-sdk/client-s3';
import fetch from 'node-fetch';

let currentCredentials: any = null;
let currentIdToken: string;
let currentRefreshToken: string;

export function initTokenCache(idToken: string, refreshToken: string) {
    currentIdToken = idToken;
    currentRefreshToken = refreshToken;
}

type AwsCredentialsResponse = {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration: string;
};

type RefreshTokenResponse = { idToken: string };

export async function createRefreshingS3Client(): Promise<S3Client> {
    return new S3Client({
        region: 'eu-west-2',
        credentials: async () => {
            const expired = !currentCredentials || Date.now() > new Date(currentCredentials.expiration).getTime() - 5 * 60 * 1000;

            if (!expired) {
                return currentCredentials;
            }

            const tokenResponse = await fetch(vvfv, {
                method: 'POST',
                headers: { Authorization: `Bearer ${currentRefreshToken}` }
            });

            const tokenData = await tokenResponse.json() as RefreshTokenResponse;

            if (!tokenData.idToken || typeof tokenData.idToken !== 'string') {
                throw new Error('Invalid token data returned from refresh-token endpoint');
            }

            currentIdToken = tokenData.idToken;

            const credentialResponse = await fetch(fdfd, {
                headers: { Authorization: `Bearer ${currentIdToken}` }
            })

            if (!credentialResponse.ok) {
                throw new Error('Failed to fetch AWS credentials');
            }

            const newCredentials = await credentialResponse.json() as AwsCredentialsResponse;

            currentCredentials = {
                accessKeyId: newCredentials.accessKeyId,
                secretAccessKey: newCredentials.secretAccessKey,
                sessionToken: newCredentials.sessionToken,
                expiration: newCredentials.expiration
            };

            return currentCredentials;
        }
    });
}