/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import { Paged } from 'dynamodb-onetable';
import { ScopedDeaCase } from '../../models/case';
import { DeaCaseFile, DeaCaseFileResult } from '../../models/case-file';
import { CaseFileStatus } from '../../models/case-file-status';
import { DataVaultFileDTO, DeaDataVaultFile } from '../../models/data-vault-file';
import { getCases } from '../../persistence/case';
import { listCasesByFile } from '../../persistence/case-file';
import * as DataVaultFilePersistence from '../../persistence/data-vault-file';
import { ModelRepositoryProvider } from '../../persistence/schema/entities';
import { getUsers } from '../../persistence/user';
import { NotFoundError } from '../exceptions/not-found-exception';
import { ValidationError } from '../exceptions/validation-exception';
import * as CaseFileService from '../services/case-file-service';
import * as DataVaultService from '../services/data-vault-service';
import { getRequiredCase } from './case-service';

export const listDataVaultFilesByFilePath = async (
  dataVaultId: string,
  filePath: string,
  limit = 30,
  repositoryProvider: ModelRepositoryProvider,
  nextToken: object | undefined
): Promise<Paged<DeaDataVaultFile>> => {
  return await DataVaultFilePersistence.listDataVaultFilesByFilePath(
    dataVaultId,
    filePath,
    limit,
    repositoryProvider,
    nextToken
  );
};

export const getDataVaultFile = async (
  dataVaultId: string,
  ulid: string,
  repositoryProvider: ModelRepositoryProvider
): Promise<DeaDataVaultFile | undefined> => {
  return await DataVaultFilePersistence.getDataVaultFileByUlid(ulid, dataVaultId, repositoryProvider);
};

export const fetchNestedFilesInFolders = async (
  dataVaultId: string,
  fileUlids: string[],
  limit = 30,
  repositoryProvider: ModelRepositoryProvider
): Promise<string[]> => {
  const fileUlidsStack = [...fileUlids];
  const completeFileUlids = [];
  let fileCount = fileUlids.length;

  while (fileUlidsStack.length > 0) {
    const fileUlid = fileUlidsStack.pop();

    if (!fileUlid) {
      break;
    }
    const retrievedDataVaultFile = await getRequiredDataVaultFile(dataVaultId, fileUlid, repositoryProvider);

    // Handle nested folders
    if (!retrievedDataVaultFile.isFile) {
      let nextToken = undefined;
      do {
        const pageOfDataVaultFiles: Paged<DeaDataVaultFile> =
          await DataVaultFilePersistence.listDataVaultFilesByFilePath(
            dataVaultId,
            `${retrievedDataVaultFile.filePath}${retrievedDataVaultFile.fileName}/`,
            limit,
            repositoryProvider,
            nextToken
          );
        const nestedFiles = pageOfDataVaultFiles.map((file) => file.ulid);
        fileUlidsStack.push(...nestedFiles);
        nextToken = pageOfDataVaultFiles.next;
        enforceCaseAssociationLimitProtection((fileCount += nestedFiles.length));
      } while (nextToken);
    } else {
      completeFileUlids.push(retrievedDataVaultFile.ulid);
    }
  }
  return completeFileUlids;
};

export const associateFilesListToCase = async (
  dataVaultId: string,
  userUlid: string,
  caseUlids: string[],
  fileUlids: string[],
  repositoryProvider: ModelRepositoryProvider
) => {
  const filesTransferred = [];
  for (const caseUlid of caseUlids) {
    const deaCase = await getRequiredCase(caseUlid, repositoryProvider);

    for (const fileUlid of fileUlids) {
      const retrievedDataVaultFile = await getRequiredDataVaultFile(
        dataVaultId,
        fileUlid,
        repositoryProvider
      );

      const caseFileEntry: DeaCaseFile = {
        ulid: retrievedDataVaultFile.ulid,
        caseUlid: deaCase.ulid,
        fileName: retrievedDataVaultFile.fileName,
        contentType: retrievedDataVaultFile.contentType,
        createdBy: retrievedDataVaultFile.createdBy,
        updatedBy: retrievedDataVaultFile.updatedBy,
        filePath: retrievedDataVaultFile.filePath,
        fileSizeBytes: retrievedDataVaultFile.fileSizeBytes,
        sha256Hash: retrievedDataVaultFile.sha256Hash,
        versionId: retrievedDataVaultFile.versionId,
        isFile: retrievedDataVaultFile.isFile,
        status: CaseFileStatus.ACTIVE,
        fileS3Key: retrievedDataVaultFile.fileS3Key,

        //Data Vault Params
        dataVaultUlid: retrievedDataVaultFile.dataVaultUlid,
        associationCreatedBy: userUlid,
        executionId: retrievedDataVaultFile.executionId,
        associationDate: new Date(),
        dataVaultUploadDate: retrievedDataVaultFile.created,
      };

      const completeCaseAssociationResponse = await CaseFileService.createCaseAssociation(
        caseFileEntry,
        repositoryProvider
      );
      filesTransferred.push(completeCaseAssociationResponse);
    }
  }

  return filesTransferred;
};

export const createDataVaultFiles = async (
  filesList: DataVaultFileDTO[],
  repositoryProvider: ModelRepositoryProvider
) => {
  return await DataVaultFilePersistence.createDataVaultFile(filesList, repositoryProvider);
};

export const hydrateUsersForDataVaultFiles = async (
  files: DeaDataVaultFile[],
  repositoryProvider: ModelRepositoryProvider
): Promise<DeaDataVaultFile[]> => {
  // get all unique user ulids referenced on the files
  const userUlids = [...new Set(files.map((file) => file.createdBy))];
  // fetch the users
  const userMap = await getUsers(userUlids, repositoryProvider);

  // Update createdBy with usernames
  return files.map((file) => {
    const user = userMap.get(file.createdBy);
    let createdBy = file.createdBy;
    let updatedBy = file.updatedBy;
    if (user) {
      createdBy = `${user?.firstName} ${user?.lastName}`;
      updatedBy = createdBy;
    }
    return {
      ulid: file.ulid,
      fileName: file.fileName,
      filePath: file.filePath,
      dataVaultUlid: file.dataVaultUlid,
      isFile: file.isFile,
      fileSizeBytes: file.fileSizeBytes,
      createdBy,
      updatedBy,
      contentType: file.contentType,
      sha256Hash: file.sha256Hash,
      versionId: file.versionId,
      fileS3Key: file.fileS3Key,
      executionId: file.executionId,
      created: file.created,
      updated: file.updated,
      caseCount: file.caseCount,
    };
  });
};

export const hydrateDataVaultFile = async (
  file: DeaDataVaultFile,
  repositoryProvider: ModelRepositoryProvider
): Promise<DeaDataVaultFile> => {
  // hydrate the user.
  const hydratedFiles = await hydrateUsersForDataVaultFiles([file], repositoryProvider);

  // Get's the cases associated to the file
  const caseUlids: string[] = [];
  let nextToken = undefined;
  do {
    const caseFilePage: Paged<DeaCaseFileResult> = await listCasesByFile(
      file.ulid,
      repositoryProvider,
      nextToken
    );
    caseUlids.push(...caseFilePage.map((caseFile) => caseFile.caseUlid));
    nextToken = caseFilePage.next;
  } while (nextToken);

  // fetch the cases
  const caseMap = await getCases(caseUlids, repositoryProvider);
  const cases: ScopedDeaCase[] = caseUlids.map((caseUlid) => {
    const deaCase = caseMap.get(caseUlid);
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return {
      ulid: deaCase?.ulid,
      name: deaCase?.name,
    } as ScopedDeaCase;
  });

  return { ...hydratedFiles[0], cases };
};

export const disassociateFileFromCases = async (
  dataVaultId: string,
  fileUlid: string,
  caseUlids: string[],
  repositoryProvider: ModelRepositoryProvider
) => {
  await DataVaultService.getRequiredDataVault(dataVaultId, repositoryProvider);

  await getRequiredDataVaultFile(dataVaultId, fileUlid, repositoryProvider);

  for (const caseUlid of caseUlids) {
    const caseFileEntry = await CaseFileService.getRequiredCaseFile(caseUlid, fileUlid, repositoryProvider);
    await CaseFileService.deleteCaseAssociation(caseFileEntry, repositoryProvider);
  }
};

export const getRequiredDataVaultFile = async (
  dataVaultId: string,
  fileId: string,
  repositoryProvider: ModelRepositoryProvider
): Promise<DeaDataVaultFile> => {
  const dataVaultFile = await getDataVaultFile(dataVaultId, fileId, repositoryProvider);
  if (!dataVaultFile) {
    throw new NotFoundError(`DataVault File not found.`);
  }
  return dataVaultFile;
};

export const enforceCaseAssociationLimitProtection = (count: number, threshould = 300) => {
  if (count > threshould) {
    throw new ValidationError(
      `Too many files selected. No more than ${threshould} files can be associated in a single request.`
    );
  }
};
