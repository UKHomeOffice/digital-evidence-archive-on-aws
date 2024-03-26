/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { createDataVaultExecution } from '@aws/dea-app/lib/app/resources/create-data-vault-execution';
import { createDeaHandler, NO_ACL } from './create-dea-handler';

export const handler = createDeaHandler(createDataVaultExecution, NO_ACL);
