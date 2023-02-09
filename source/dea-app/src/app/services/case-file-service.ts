/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '../../logger';
import { DeaCaseFile } from '../../models/case-file';
import * as CaseFilePersistence from '../../persistence/case-file';
import { defaultProvider } from '../../persistence/schema/entities';
import {
  generatePresignedUrlsForCaseFile,
  completeUploadForCaseFile,
  defaultDatasetsProvider,
  DatasetsProvider,
} from '../../storage/datasets';

export const initiateCaseFileUpload = async (
  deaCaseFile: DeaCaseFile,
  /* the default case is handled in e2e tests */
  /* istanbul ignore next */
  repositoryProvider = defaultProvider,
  datasetsProvider: DatasetsProvider = defaultDatasetsProvider
): Promise<DeaCaseFile> => {
  // todo: need to see who is initiating upload. add that info to s3 and ddb
  // check if case exists
  // check case-user has permissions
  // check if file already exists
  // need to add a status to indicate if file has been uploaded or is pending
  // need to add a ttl to clear out incomplete case-files
  const caseFile: DeaCaseFile = await CaseFilePersistence.initiateCaseFileUpload(
    deaCaseFile,
    repositoryProvider
  );
  logger.debug('Created case-file in DDB. Trying to create presigned URLs');
  await generatePresignedUrlsForCaseFile(caseFile, datasetsProvider);

  logger.debug('Done creating presigned URLs. Returning successfully');
  return caseFile;
};

export const completeCaseFileUpload = async (
  deaCaseFile: DeaCaseFile,
  /* the default case is handled in e2e tests */
  /* istanbul ignore next */
  repositoryProvider = defaultProvider,
  datasetsProvider: DatasetsProvider = defaultDatasetsProvider
): Promise<DeaCaseFile> => {
  // todo: check if case-file exists and that it is actually pending
  // check if case exists
  // check case-user has permissions

  await completeUploadForCaseFile(deaCaseFile, datasetsProvider);

  // update status and remove ttl
  return await CaseFilePersistence.completeCaseFileUpload(deaCaseFile, repositoryProvider);
};
