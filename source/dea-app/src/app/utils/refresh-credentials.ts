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
  Expiration: Date;
}

export interface RefreshTokenResponse {
  username: string;
  idToken: string;
  identityPoolId: string;
  userPoolId: string;
  expiresIn: string;
}

export const refreshCredentials = async (): Promise<Credentials> => {
  const response = await getRefreshToken();
  return await getCredentialsByToken(response.idToken, response.identityPoolId, response.userPoolId);
};

export const getRefreshToken = async (): Promise<RefreshTokenResponse> => {
  try {
    return await httpApiPost<RefreshTokenResponse>('auth/refreshToken', {});
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const getCredentialsByToken = async (
  idToken: string,
  identityPoolId: string,
  userPoolId: string
): Promise<Credentials> => {
  const region = identityPoolId.substring(0, identityPoolId.indexOf(':'));
  const cognitoRegion = region.includes('gov') ? 'us-gov-west-1' : region;

  const cognitoIdentityClient = new CognitoIdentityClient({ region: cognitoRegion });

  const Logins: Record<string, string> = {
    [`cognito-idp.${cognitoRegion}.amazonaws.com/${userPoolId}`]: idToken,
  };

  const { IdentityId } = await cognitoIdentityClient.send(
    new GetIdCommand({ IdentityPoolId: identityPoolId, Logins })
  );

  const { Credentials } = await cognitoIdentityClient.send(
    new GetCredentialsForIdentityCommand({ IdentityId, Logins })
  );

  if (
    !Credentials ||
    !Credentials.AccessKeyId ||
    !Credentials.SecretKey ||
    !Credentials.SessionToken ||
    !Credentials.Expiration
  ) {
    throw new Error('Incomplete credentials returned from Cognito');
  }

  return {
    AccessKeyId: Credentials.AccessKeyId,
    SecretKey: Credentials.SecretKey,
    SessionToken: Credentials.SessionToken,
    Expiration: Credentials.Expiration,
  };
};
