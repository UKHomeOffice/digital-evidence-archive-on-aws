/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import {
  CognitoIdentityClient,
  GetCredentialsForIdentityCommand,
  GetIdCommand,
} from '@aws-sdk/client-cognito-identity';
import { httpApiPost } from '../helpers/apiHelper';

export interface Credentials {
  AccessKeyId: string;
  SecretKey: string;
  SessionToken: string;
}

export interface RefreshTokenResponse {
  username: string;
  idToken: string;
  identityPoolId: string;
  userPoolId: string;
  expiresIn: string;
}

export const refreshCredentials = async () => {
  const response = await getRefreshToken();
  return await getCredentialsByToken(response.idToken, response.identityPoolId, response.userPoolId);
};

export const getRefreshToken = async (): Promise<RefreshTokenResponse> => {
  try {
    const response: RefreshTokenResponse = await httpApiPost(`auth/refreshToken`, {});
    return response;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const getCredentialsByToken = async (idToken: string, identityPoolId: string, userPoolId: string) => {
  const region = identityPoolId.substring(0, identityPoolId.indexOf(':'));
  const cognitoRegion = region.includes('gov') ? 'us-gov-west-1' : region;

  const cognitoIdentityClient = new CognitoIdentityClient({
    region: cognitoRegion,
  });

  const Logins: Record<string, string> = {
    [`cognito-idp.${cognitoRegion}.amazonaws.com/${userPoolId}`]: idToken,
  };

  const getIdCommand = new GetIdCommand({
    IdentityPoolId: identityPoolId,
    Logins,
  });

  const { IdentityId } = await cognitoIdentityClient.send(getIdCommand);

  const getCredentialsCommand = new GetCredentialsForIdentityCommand({
    IdentityId,
    Logins,
  });

  const { Credentials } = await cognitoIdentityClient.send(getCredentialsCommand);

  if (!Credentials || !Credentials.AccessKeyId || !Credentials.SecretKey || !Credentials.SessionToken) {
    throw new Error('Credentials not found');
  }

  const credentials: Credentials = {
    AccessKeyId: Credentials.AccessKeyId,
    SecretKey: Credentials.SecretKey,
    SessionToken: Credentials.SessionToken,
  };

  return credentials;
};
