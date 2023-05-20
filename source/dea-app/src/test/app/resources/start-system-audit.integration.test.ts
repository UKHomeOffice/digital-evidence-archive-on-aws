/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import Joi from 'joi';
import { anything, instance, mock, when } from 'ts-mockito';
import { startSystemAudit } from '../../../app/resources/start-system-audit';
import { joiUlid } from '../../../models/validation/joi-common';
import { ModelRepositoryProvider } from '../../../persistence/schema/entities';
import { dummyContext, getDummyEvent } from '../../integration-objects';
import { getTestRepositoryProvider } from '../../persistence/local-db-table';

describe('start system audit', () => {
  const OLD_ENV = process.env;

  let modelProvider: ModelRepositoryProvider;
  beforeAll(async () => {
    modelProvider = await getTestRepositoryProvider('startSystemAuditIntegration');
  });

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    process.env.AUDIT_LOG_GROUP_NAME = 'TESTGROUP';
    process.env.TRAIL_LOG_GROUP_NAME = 'TESTTRAILGROUP';
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('responds with a queryId', async () => {
    const clientMock: CloudWatchLogsClient = mock(CloudWatchLogsClient);
    const clientMockInstance = instance(clientMock);
    when(clientMock.send(anything())).thenResolve({ $metadata: {}, queryId: 'a_query_id' });

    const event = getDummyEvent();
    const result = await startSystemAudit(event, dummyContext, modelProvider, undefined, clientMockInstance);

    expect(result.statusCode).toEqual(200);
    const body: { auditId: string } = JSON.parse(result.body);
    Joi.assert(body.auditId, joiUlid);
  });

  it('throws an error if no queryId is returned', async () => {
    const clientMock: CloudWatchLogsClient = mock(CloudWatchLogsClient);
    const clientMockInstance = instance(clientMock);
    when(clientMock.send(anything())).thenResolve({ $metadata: {}, queryId: undefined });

    const event = getDummyEvent();
    await expect(
      startSystemAudit(event, dummyContext, modelProvider, undefined, clientMockInstance)
    ).rejects.toThrow('Unknown error starting Cloudwatch Logs Query.');
  });
});