/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  ListPartsCommand,
  Part,
  S3Client,
} from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';
import {
  STSClient,
  STSClientResolvedConfig,
  ServiceInputTypes as STSInputs,
  ServiceOutputTypes as STSOutputs,
} from '@aws-sdk/client-sts';
import { AwsClientStub, AwsStub, mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { CompleteCaseFileUploadObject } from '../../models/case-file';
import { CaseFileStatus } from '../../models/case-file-status';
import { completeUploadForCaseFile } from '../../storage/datasets';
import { DATASETS_PROVIDER, FILE_SIZE_BYTES } from '../app/resources/case-file-integration-test-helper';

let stsMock: AwsStub<STSInputs, STSOutputs, STSClientResolvedConfig>;
let sqsMock: AwsClientStub<SQSClient>;

const FILE_ULID = 'ABCDEFGHHJKKMNNPQRSTTVWXY9';
const CASE_ULID = 'ABCDEFGHHJKKMNNPQRSTTVWXY0';

function createCaseFile(
  fileName: string,
  fileSizeBytes: number,
  uploadId: string
): CompleteCaseFileUploadObject {
  return {
    caseUlid: CASE_ULID,
    ulid: FILE_ULID,
    fileName,
    filePath: '/',
    isFile: true,
    fileSizeBytes,
    createdBy: 'user123',
    updatedBy: 'user123',
    status: CaseFileStatus.PENDING,
    contentType: 'text/plain',
    fileS3Key: `${CASE_ULID}/${FILE_ULID}`,
    uploadId,
  };
}

function createDatasetsProvider() {
  return {
    ...DATASETS_PROVIDER,
    s3Client: new S3Client({ region: 'us-east-1' }),
  };
}

jest.setTimeout(30000);

describe('Test complete upload rejection for empty files', () => {
  beforeAll(async () => {
    stsMock = mockClient(STSClient);
    stsMock.resolves({
      Credentials: {
        AccessKeyId: 'hi',
        SecretAccessKey: 'hello',
        SessionToken: 'foo',
        Expiration: new Date(),
      },
    });

    sqsMock = mockClient(SQSClient);
    sqsMock.resolves({});
  });

  afterAll(async () => {
    jest.clearAllMocks();
  });

  it('should reject completion of a multipart upload with zero bytes', async () => {
    const datasetsProvider = createDatasetsProvider();
    const s3Mock = mockClient(datasetsProvider.s3Client);
    const emptyParts: Part[] = [];

    s3Mock.on(ListPartsCommand).resolves({
      Parts: emptyParts,
    });

    const caseFile = createCaseFile('empty.txt', 0, 'upload-123');

    await expect(completeUploadForCaseFile(caseFile, datasetsProvider)).rejects.toThrow(
      'Cannot complete upload for an empty file.'
    );
  });

  it('should reject completion when all uploaded parts sum to zero bytes', async () => {
    const datasetsProvider = createDatasetsProvider();
    const s3Mock = mockClient(datasetsProvider.s3Client);
    const zeroSizedPart: Part = {
      PartNumber: 1,
      ETag: 'etag1',
      Size: 0,
    };

    s3Mock.on(ListPartsCommand).resolves({
      Parts: [zeroSizedPart],
    });

    const caseFile = createCaseFile('zero-byte.txt', 0, 'upload-456');

    await expect(completeUploadForCaseFile(caseFile, datasetsProvider)).rejects.toThrow(
      'Cannot complete upload for an empty file.'
    );
  });

  it('should successfully complete when parts total > 0 bytes', async () => {
    const datasetsProvider = createDatasetsProvider();
    const s3Mock = mockClient(datasetsProvider.s3Client);
    const uploadedPart: Part = {
      PartNumber: 1,
      ETag: 'etag1',
      Size: FILE_SIZE_BYTES,
    };

    s3Mock.on(ListPartsCommand).resolves({
      Parts: [uploadedPart],
    });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({ VersionId: 'version-123' });

    const caseFile = createCaseFile('valid.txt', FILE_SIZE_BYTES, 'upload-789');

    const result = await completeUploadForCaseFile(caseFile, datasetsProvider);
    expect(result).toBeUndefined();
    expect(caseFile.versionId).toEqual('version-123');
    expect(s3Mock).toHaveReceivedCommand(CompleteMultipartUploadCommand);
    expect(s3Mock).not.toHaveReceivedCommand(AbortMultipartUploadCommand);
  });
});
