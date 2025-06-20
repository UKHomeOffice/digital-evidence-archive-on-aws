/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { DownloadStatus } from './enums';

export interface FileDownloadProgressRow {
  fileName: string;
  downloadStatus: DownloadStatus;
  downloadPercentage: string;
  contentType: string;
  fileSizeBytes: number;
  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
  status: string;
}
