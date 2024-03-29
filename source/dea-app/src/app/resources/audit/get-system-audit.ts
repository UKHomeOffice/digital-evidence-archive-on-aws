/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { getRequiredEnv, getRequiredPathParam } from '../../../lambda-http-helpers';
import { joiUlid } from '../../../models/validation/joi-common';
import { AuditType } from '../../../persistence/schema/dea-schema';
import { defaultProvider } from '../../../persistence/schema/entities';
import { defaultDatasetsProvider } from '../../../storage/datasets';
import { defaultAthenaClient } from '../../audit/dea-audit-plugin';
import { auditService } from '../../services/audit-service';
import { DEAGatewayProxyHandler } from '../dea-gateway-proxy-handler';
import { responseOk } from '../dea-lambda-utils';

export const getSystemAudit: DEAGatewayProxyHandler = async (
  event,
  context,
  /* the default case is handled in e2e tests */
  /* istanbul ignore next */
  repositoryProvider = defaultProvider,
  /* istanbul ignore next */
  _datasetsProvider = defaultDatasetsProvider,
  /* istanbul ignore next */
  athenaClient = defaultAthenaClient
) => {
  const auditId = getRequiredPathParam(event, 'auditId', joiUlid);
  const subnetCIDR = getRequiredEnv('SOURCE_IP_MASK_CIDR');

  const result = await auditService.getAuditResult(
    auditId,
    'SYSTEM',
    AuditType.SYSTEM,
    athenaClient,
    repositoryProvider,
    `${event.requestContext.identity.sourceIp}/${subnetCIDR}`
  );

  return responseOk(event, result);
};
