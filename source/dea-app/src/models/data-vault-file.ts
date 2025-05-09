/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { ScopedDeaCase } from './case';

export interface DeaDataVaultFile {
  readonly ulid: string;
  readonly fileName: string;
  readonly filePath: string;
  readonly dataVaultUlid: string;
  readonly isFile: boolean;
  readonly fileSizeBytes: number;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly contentType?: string;
  readonly sha256Hash?: string;
  readonly versionId?: string;
  readonly fileS3Key: string;
  readonly executionId: string;
  readonly created?: Date;
  readonly updated?: Date;
  readonly caseCount: number;
  readonly cases?: ScopedDeaCase[];
}

export interface DataVaultFileDTO {
  readonly fileName: string;
  readonly filePath: string;
  readonly dataVaultUlid: string;
  readonly isFile: boolean;
  readonly fileSizeBytes: number;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly contentType?: string;
  readonly sha256Hash?: string;
  readonly versionId?: string;
  readonly fileS3Key: string;
  readonly executionId: string;
}
