/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { PassThrough } from 'node:stream';
import { getRequiredEnv, getRequiredPathParam, getRequiredPayload } from '../../lambda-http-helpers';
import { DownloadCaseFileRequest } from '../../models/case-file';
import { CaseFileStatus } from '../../models/case-file-status';
import { downloadFileRequestBodySchema } from '../../models/validation/case-file';
import { joiUlid } from '../../models/validation/joi-common';
import { defaultProvider } from '../../persistence/schema/entities';
import { defaultDatasetsProvider } from '../../storage/datasets';
import { ValidationError } from '../exceptions/validation-exception';
import { getRequiredCaseFile } from '../services/case-file-service';
import { streamS3File } from '../utils/s3-multi-part-file-download';
import { DEAGatewayProxyHandler } from './dea-gateway-proxy-handler';

export const downloadCaseFile: DEAGatewayProxyHandler = async (
  event,
  context,
  /* the default case is handled in e2e tests */
  /* istanbul ignore next */
  repositoryProvider = defaultProvider,
  /* istanbul ignore next */
  datasetsProvider = defaultDatasetsProvider
) => {
  const caseId = getRequiredPathParam(event, 'caseId', joiUlid);
  const fileId = getRequiredPathParam(event, 'fileId', joiUlid);
  const subnetCIDR = getRequiredEnv('SOURCE_IP_MASK_CIDR');

  const body = getRequiredPayload<DownloadCaseFileRequest>(
    event,
    'downloadCaseFile request body',
    downloadFileRequestBodySchema
  );
  const downloadReason: string | undefined = body.downloadReason;

  const retrievedCaseFile = await getRequiredCaseFile(caseId, fileId, repositoryProvider);

  if (retrievedCaseFile.status !== CaseFileStatus.ACTIVE) {
    throw new ValidationError(`Can't download a file in ${retrievedCaseFile.status} state`);
  }

  const bucket = 'sheffield-upload-testing';
  const key = retrievedCaseFile.fileS3Key;

  const passThrough = new PassThrough();
  await streamS3File(bucket, key, passThrough);

  const chunks: Buffer[] = [];
  for await (const chunk of passThrough) {
    chunks.push(chunk);
  }

  const finalBuffer = Buffer.concat(chunks);

  // const downloadResult = await getPresignedUrlForDownload(
  //     retrievedCaseFile,
  //     `${event.requestContext.identity.sourceIp}/${subnetCIDR}`,
  //     datasetsProvider,
  //     downloadReason
  // );

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${retrievedCaseFile.fileName}"`,
      'Content-Length': finalBuffer.length.toString(),
    },
    body: finalBuffer.toString('base64'),
    isBase64Encoded: true,
  };
};
