/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { PassThrough, Readable } from 'stream';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import PQueue from 'p-queue';
import { CredentialManager } from './credential-manager';

const CHUNK_SIZE = 100 * 1024 * 1024;
const MAX_CONCURRENCY = 5;
const MAX_RETRIES = 3;

const REGION = 'eu-west-2';

async function downloadChunkWithRetry(
  bucket: string,
  key: string,
  range: string,
  stream: PassThrough,
  credentialManager: CredentialManager,
  retries = MAX_RETRIES
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const s3 = await credentialManager.getS3();
      const command = new GetObjectCommand({ Bucket: bucket, Key: key, Range: range });
      const result = await s3.send(command);

      if (result.Body instanceof Readable) {
        const s3Stream = result.Body;
        return new Promise((resolve, reject) => {
          s3Stream.on('data', (chunk) => stream.write(chunk));
          s3Stream.on('end', resolve);
          s3Stream.on('error', reject);
        });
      }
    } catch (err) {
      if (attempt === retries) {
        throw new Error(`Failed to download ${range} after ${retries} attempts: ${err}`);
      }
    }
  }
}

export async function streamS3File(bucket: string, key: string, outStream: PassThrough): Promise<void> {
  const credentialManager = new CredentialManager(REGION);
  const s3 = await credentialManager.getS3();

  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));

  const totalSize = head.ContentLength ?? 0;
  const totalParts = Math.ceil(totalSize / CHUNK_SIZE);

  const queue = new PQueue({ concurrency: MAX_CONCURRENCY });

  for (let part = 0; part < totalParts; part++) {
    const start = part * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE - 1, totalSize - 1);
    const range = `bytes=${start}-${end}`;
    await queue.add(() => downloadChunkWithRetry(bucket, key, range, outStream, credentialManager));
  }

  await queue.onIdle();
  outStream.end();
}
