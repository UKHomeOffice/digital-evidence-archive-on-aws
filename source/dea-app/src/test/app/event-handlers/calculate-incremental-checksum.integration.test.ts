/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { fail } from 'assert';
import { Readable } from 'stream';
import { S3Client } from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import { SQSEvent } from 'aws-lambda';
import cryptoJS from 'crypto-js';
import { anything, instance, mock, when } from 'ts-mockito';
import {
  MultipartChecksumBody,
  calculateIncrementalChecksum,
} from '../../../app/event-handlers/calculate-incremental-checksum';
import { createCase } from '../../../persistence/case';
import {
  completeCaseFileUpload,
  getCaseFileByUlid,
  initiateCaseFileUpload,
} from '../../../persistence/case-file';
import { ModelRepositoryProvider } from '../../../persistence/schema/entities';
import { createUser } from '../../../persistence/user';
import { dummyContext } from '../../integration-objects';
import { getTestRepositoryProvider } from '../../persistence/local-db-table';

describe('calculate incremental checksum', () => {
  let modelProvider: ModelRepositoryProvider;
  let caseUlid: string;
  let caseFileUlid: string;
  beforeAll(async () => {
    modelProvider = await getTestRepositoryProvider('calculateMultipartChecksumTest');
    const user = await createUser({ tokenId: 'token', firstName: 'first', lastName: 'last' }, modelProvider);
    const deaCase = await createCase({ name: 'somecase' }, user, modelProvider);
    const caseFile = await initiateCaseFileUpload(
      {
        caseUlid: deaCase.ulid,
        fileName: 'somefile',
        filePath: '/',
        contentType: 'text',
        fileSizeBytes: 1,
        chunkSizeBytes: 1,
        partRangeStart: 1,
        partRangeEnd: 1,
        details: '',
        reason: '',
      },
      user.ulid,
      modelProvider
    );
    await completeCaseFileUpload(
      {
        ...caseFile,
        uploadId: 'bogus',
      },
      modelProvider,
      undefined
    );

    caseUlid = deaCase.ulid;
    caseFileUlid = caseFile.ulid;
  });

  afterAll(async () => {
    await modelProvider.table.deleteTable('DeleteTableForever');
  });

  it('calculates a checksum across multiple parts', async () => {
    const s3ClientMock = mock(S3Client);
    const body1 = sdkStreamMixin(new Readable());
    body1._read = () => {
      /* do nothing */
    };
    body1.push('hello');
    body1.push(null);
    const body2 = sdkStreamMixin(new Readable());
    body2._read = () => {
      /* do nothing */
    };
    body2.push('world');
    body2.push(null);
    when(s3ClientMock.send(anything()))
      .thenResolve({ Body: body1, $metadata: {} })
      .thenResolve({ Body: body2, $metadata: {} });

    const checksumJob: MultipartChecksumBody = {
      s3Bucket: 'bucket',
      s3Key: 'key',
      currentPart: 1,
      totalParts: 2,
      caseFileUlid,
      caseUlid,
    };
    const checksumJob2: MultipartChecksumBody = {
      s3Bucket: 'bucket',
      s3Key: 'key',
      currentPart: 2,
      totalParts: 2,
      caseFileUlid,
      caseUlid,
    };

    const sqsEvent: SQSEvent = {
      Records: [
        {
          messageId: 'messageid',
          receiptHandle: 'receipthandle',
          attributes: {
            ApproximateReceiveCount: '',
            SentTimestamp: '',
            SenderId: '',
            ApproximateFirstReceiveTimestamp: '',
          },
          md5OfBody: '',
          eventSource: '',
          eventSourceARN: '',
          awsRegion: 'us-east-1',
          messageAttributes: {},
          body: JSON.stringify(checksumJob),
        },
      ],
    };

    const response = await calculateIncrementalChecksum(
      sqsEvent,
      dummyContext,
      () => {
        /* do nothing */
      },
      instance(s3ClientMock),
      modelProvider
    );

    expect(response).toEqual('Successfully processed 1 messages.');

    // process next message
    const sqsEvent2: SQSEvent = {
      Records: [
        {
          messageId: 'messageid2',
          receiptHandle: 'receipthandle',
          attributes: {
            ApproximateReceiveCount: '',
            SentTimestamp: '',
            SenderId: '',
            ApproximateFirstReceiveTimestamp: '',
          },
          md5OfBody: '',
          eventSource: '',
          eventSourceARN: '',
          awsRegion: 'us-east-1',
          messageAttributes: {},
          body: JSON.stringify(checksumJob2),
        },
      ],
    };
    const response2 = await calculateIncrementalChecksum(
      sqsEvent2,
      dummyContext,
      () => {
        /* do nothing */
      },
      instance(s3ClientMock),
      modelProvider
    );

    expect(response2).toEqual('Successfully processed 1 messages.');

    const updatedFile = await getCaseFileByUlid(caseFileUlid, caseUlid, modelProvider);
    if (!updatedFile) {
      fail('file not found');
    }

    // calculate full hash and compare
    const sha = cryptoJS.algo.SHA256.create();
    const fullHash = sha.update('helloworld').finalize().toString(cryptoJS.enc.Base64);

    expect(updatedFile.sha256Hash).toEqual(fullHash);
  });

  it('errors on bad payload', async () => {
    const s3ClientMock = mock(S3Client);
    when(s3ClientMock.send(anything()))
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore. just let me break it bro
      .thenResolve({ Body: 1, $metadata: {} });

    const checksumJob: MultipartChecksumBody = {
      s3Bucket: 'bucket',
      s3Key: 'key',
      currentPart: 1,
      totalParts: 2,
      caseFileUlid,
      caseUlid,
    };
    const sqsEvent: SQSEvent = {
      Records: [
        {
          messageId: 'messageid',
          receiptHandle: 'receipthandle',
          attributes: {
            ApproximateReceiveCount: '',
            SentTimestamp: '',
            SenderId: '',
            ApproximateFirstReceiveTimestamp: '',
          },
          md5OfBody: '',
          eventSource: '',
          eventSourceARN: '',
          awsRegion: 'us-east-1',
          messageAttributes: {},
          body: JSON.stringify(checksumJob),
        },
      ],
    };
    let exception = false;
    try {
      await calculateIncrementalChecksum(
        sqsEvent,
        dummyContext,
        () => {
          /* do nothing */
        },
        instance(s3ClientMock),
        modelProvider
      );
    } catch (e) {
      exception = true;
    }
    expect(exception).toEqual(true);
  });
});
