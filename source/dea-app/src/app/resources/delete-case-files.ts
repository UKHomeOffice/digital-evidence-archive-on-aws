/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { getRequiredPathParam, getRequiredPayload, getUserUlid } from '../../lambda-http-helpers';
import { DeleteCaseFilesDTO } from '../../models/case-file';
import { caseFileDeleteRequestSchema } from '../../models/validation/case-file';
import { joiUlid } from '../../models/validation/joi-common';
import { defaultProvider } from '../../persistence/schema/entities';
import { DatasetsProvider, defaultDatasetsProvider } from '../../storage/datasets';
import { NotFoundError } from '../exceptions/not-found-exception';
import { ValidationError } from '../exceptions/validation-exception';
import * as CaseService from '../services/case-service';
import { DEAGatewayProxyHandler } from './dea-gateway-proxy-handler';
import { responseOk } from './dea-lambda-utils';

export const deleteCaseFiles: DEAGatewayProxyHandler = async (
  event,
  context,
  /* the default case is handled in e2e tests */
  /* istanbul ignore next */
  repositoryProvider = defaultProvider,
  datasetsProvider: DatasetsProvider = defaultDatasetsProvider
) => {
  const caseId = getRequiredPathParam(event, 'caseId', joiUlid);
  const userUlid = getUserUlid(event);

  const deaCase = await CaseService.getCase(caseId, repositoryProvider);
  if (!deaCase) {
    throw new NotFoundError(`Could not find case: ${caseId}`);
  }

  if (!datasetsProvider.deletionAllowed) {
    throw new ValidationError('The application is not configured to delete files');
  }

  const deleteCaseFilesDTO: DeleteCaseFilesDTO = getRequiredPayload(
    event,
    'Delete cases',
    caseFileDeleteRequestSchema
  );

  if (!caseId && !deleteCaseFilesDTO) {
    console.log('No files deleted');
    return responseOk(event, deaCase);
  }

  const awsAccountId = context.invokedFunctionArn.split(':')[4];

  console.log('awsAccountId:', awsAccountId, context);

  const updatedCase = await CaseService.deleteCaseFiles(
    deaCase,
    userUlid,
    deleteCaseFilesDTO.filesToDelete,
    awsAccountId,
    repositoryProvider,
    datasetsProvider
  );

  return responseOk(event, updatedCase);
};
