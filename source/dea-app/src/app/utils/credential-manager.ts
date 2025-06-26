/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { S3Client } from '@aws-sdk/client-s3';
import { Credentials, refreshCredentials } from './refresh-credentials';

export class CredentialManager {
  private credentials: Credentials | null = null;
  private expiration = 0;
  private s3: S3Client | null = null;

  constructor(private readonly region: string, private readonly bufferSeconds: number = 60) {}

  private async refreshCredentials() {
    const now = Date.now() / 1000;

    if (!this.credentials || now >= this.expiration - this.bufferSeconds) {
      const refreshed = await refreshCredentials();

      this.credentials = {
        AccessKeyId: refreshed.AccessKeyId,
        SecretKey: refreshed.SecretKey,
        SessionToken: refreshed.SessionToken,
        Expiration: refreshed.Expiration,
      };

      this.expiration = refreshed.Expiration.getTime() / 1000;

      this.s3 = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId: this.credentials.AccessKeyId,
          secretAccessKey: this.credentials.SecretKey,
          sessionToken: this.credentials.SessionToken,
        },
      });

      console.log(`Credentials refreshed. Expires at ${refreshed.Expiration.toISOString()}`);
    }
  }

  public async getS3(): Promise<S3Client> {
    await this.refreshCredentials();

    if (!this.s3) {
      throw new Error('S3 client not initialised after credential refresh');
    }

    return this.s3;
  }
}
