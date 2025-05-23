/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import 'aws-sdk-client-mock-jest';
import { fail } from 'assert';
import { SQSClient } from '@aws-sdk/client-sqs';
import {
  STSClient,
  STSClientResolvedConfig,
  ServiceInputTypes as STSInputs,
  ServiceOutputTypes as STSOutputs,
} from '@aws-sdk/client-sts';
import { AwsClientStub, AwsStub, mockClient } from 'aws-sdk-client-mock';
import { getCaseFileDetails } from '../../../app/resources/get-case-file-details';
import { CaseFileStatus } from '../../../models/case-file-status';
import { DeaUser } from '../../../models/user';
import { ModelRepositoryProvider } from '../../../persistence/schema/entities';
import { dummyContext, getDummyEvent } from '../../integration-objects';
import { getTestRepositoryProvider } from '../../persistence/local-db-table';
import {
  callCompleteCaseFileUpload,
  callCreateCase,
  callCreateUser,
  callGetCaseFileDetails,
  callInitiateCaseFileUpload,
  validateCaseFile,
} from './case-file-integration-test-helper';

let repositoryProvider: ModelRepositoryProvider;
let stsMock: AwsStub<STSInputs, STSOutputs, STSClientResolvedConfig>;
let sqsMock: AwsClientStub<SQSClient>;
let fileDescriber: DeaUser;
let caseToDescribe = '';

const FILE_ULID = 'ABCDEFGHHJKKMNNPQRSTTVWXY9';

jest.setTimeout(20000);

describe('Test get case file details', () => {
  beforeAll(async () => {
    repositoryProvider = await getTestRepositoryProvider('GetCaseFileDetailsTest');

    fileDescriber = await callCreateUser(repositoryProvider);

    caseToDescribe = (await callCreateCase(fileDescriber, repositoryProvider)).ulid ?? fail();

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
    await repositoryProvider.table.deleteTable('DeleteTableForever');
  });

  beforeEach(() => {
    // s3Mock = mockClient(S3Client);
    // s3Mock.resolves({
    //   UploadId: UPLOAD_ID,
    //   VersionId: VERSION_ID,
    // });
  });

  it('Get-file-details should successfully get file details', async () => {
    const caseFileUpload = await callInitiateCaseFileUpload(
      fileDescriber.ulid,
      repositoryProvider,
      caseToDescribe
    );
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const fileId = caseFileUpload.ulid as string;
    let caseFile = await callGetCaseFileDetails(
      fileDescriber.ulid,
      repositoryProvider,
      fileId,
      caseToDescribe
    );
    await validateCaseFile(
      caseFile,
      fileId,
      caseToDescribe,
      `${fileDescriber.firstName} ${fileDescriber.lastName}`,
      CaseFileStatus.PENDING
    );

    await callCompleteCaseFileUpload(fileDescriber.ulid, repositoryProvider, fileId, caseToDescribe);
    caseFile = await callGetCaseFileDetails(fileDescriber.ulid, repositoryProvider, fileId, caseToDescribe);
    await validateCaseFile(
      caseFile,
      fileId,
      caseToDescribe,
      `${fileDescriber.firstName} ${fileDescriber.lastName}`,
      CaseFileStatus.ACTIVE
    );
  });

  it('Get-file-details should throw a validation exception when case-id path param missing', async () => {
    const event = getDummyEvent({
      headers: {
        userUlid: fileDescriber.ulid,
      },
      pathParameters: {
        fileId: FILE_ULID,
      },
    });
    await expect(getCaseFileDetails(event, dummyContext, repositoryProvider)).rejects.toThrow(
      `Required path param 'caseId' is missing.`
    );
  });

  it('Get-file-details should throw a validation exception when file-id path param missing', async () => {
    const event = getDummyEvent({
      headers: {
        userUlid: fileDescriber.ulid,
      },
      pathParameters: {
        caseId: FILE_ULID,
      },
    });
    await expect(getCaseFileDetails(event, dummyContext, repositoryProvider)).rejects.toThrow(
      `Required path param 'fileId' is missing.`
    );
  });

  it("Get-file-details should throw an exception when case-file doesn't exist", async () => {
    await expect(
      callGetCaseFileDetails(fileDescriber.ulid, repositoryProvider, FILE_ULID, caseToDescribe)
    ).rejects.toThrow(`Could not find file: ${FILE_ULID} in the DB`);
  });
});
