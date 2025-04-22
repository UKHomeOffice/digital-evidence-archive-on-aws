/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { deleteCaseFiles } from '@aws/dea-app/lib/app/resources/delete-case-files';
import { CaseAction } from '@aws/dea-app/lib/models/case-action';
import { createDeaHandler } from './create-dea-handler';

export const handler = createDeaHandler(deleteCaseFiles, [CaseAction.DELETE_CASE_FILES]);
