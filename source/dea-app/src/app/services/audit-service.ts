/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import AuditPlugin from '@aws/workbench-core-audit/lib/auditPlugin';
import AuditService from '@aws/workbench-core-audit/lib/auditService';
import {
  AthenaClient,
  GetQueryExecutionCommand,
  QueryExecutionState,
  StartQueryExecutionCommand,
} from '@aws-sdk/client-athena';
import { getRequiredEnv } from '../../lambda-http-helpers';
import { logger } from '../../logger';
import * as AuditJobPersistence from '../../persistence/audit-job';
import { AuditType } from '../../persistence/schema/dea-schema';
import { ModelRepositoryProvider } from '../../persistence/schema/entities';
import {
  getAuditQueryString,
  getCaseFileWhereClauses,
  getCaseWhereClauses,
  getDataVaultFileWhereClauses,
  getDataVaultWhereClauses,
  getUserWhereClauses,
} from '../audit/audit-queries';
import { deaAuditPlugin } from '../audit/dea-audit-plugin';
import { getAuditDownloadPresignedUrl } from './audit-download';

const AUDIT_GLUE_DATABASE = getRequiredEnv(
  'AUDIT_GLUE_DATABASE',
  'AUDIT_GLUE_DATABASE is not set in your lambda!'
);
const AUDIT_GLUE_TABLE = getRequiredEnv('AUDIT_GLUE_TABLE', 'AUDIT_GLUE_TABLE is not set in your lambda!');
const ATHENA_WORKGROUP = getRequiredEnv('ATHENA_WORKGROUP', 'ATHENA_WORKGROUP is not set in your lambda!');

export enum AuditEventResult {
  SUCCESS = 'success',
  FAILURE = 'failure',
  SUCCESS_WITH_WARNINGS = 'success with warning',
}

export enum AuditEventSource {
  API_GATEWAY = 'APIGateway',
  AWS_CONSOLE = 'AWS Console',
}

export const UNIDENTIFIED_USER = 'UNIDENTIFIED_USER';

export enum AuditEventType {
  CREATE_CASE = 'CreateCase',
  CREATE_DATA_VAULT = 'CreateDataVault',
  GET_DATA_VAULTS = 'GetDataVaults',
  GET_DATA_VAULT_DETAILS = 'GetDataVaultDetails',
  UPDATE_DATA_VAULT_DETAILS = 'UpdateDataVaultDetails',
  GET_DATA_VAULT_FILES = 'GetDataVaultFiles',
  CREATE_CASE_ASSOCIATION = 'CreateCaseAssociation',
  DELETE_CASE_ASSOCIATION = 'DeleteCaseAssociation',
  CREATE_DATA_VAULT_TASK = 'CreateDataVaultTask',
  CREATE_DATA_VAULT_EXECUTION = 'CreateDataVaultExecution',
  GET_DATA_VAULT_EXECUTIONS = 'GetDataVaultExecutions',
  GET_DATA_VAULT_FILE_DETAIL = 'GetDataVaultFileDetail',
  GET_DATA_VAULT_TASKS = 'GetDataVaultTask',
  GET_DATA_SYNC_TASKS = 'GetDataSyncTask',
  GET_MY_CASES = 'GetMyCases',
  GET_ALL_CASES = 'GetAllCases',
  GET_CASE_DETAILS = 'GetCaseDetails',
  GET_CASE_ACTIONS = 'GetCaseActions',
  UPDATE_CASE_DETAILS = 'UpdateCaseDetails',
  UPDATE_CASE_STATUS = 'UpdateCaseStatus',
  DELETE_CASE = 'DeleteCase',
  DELETE_CASE_FILE = 'DeleteCaseFile',
  CREATE_CASE_OWNER = 'CreateCaseOwner',
  GET_USERS_FROM_CASE = 'GetUsersFromCase',
  INVITE_USER_TO_CASE = 'InviteUserToCase',
  REMOVE_USER_FROM_CASE = 'RemoveUserFromCase',
  MODIFY_USER_PERMISSIONS_ON_CASE = 'ModifyUserCasePermissions',
  INITIATE_CASE_FILE_UPLOAD = 'InitiateCaseFileUpload',
  COMPLETE_CASE_FILE_UPLOAD = 'CompleteCaseFileUpload',
  GET_LOGIN_URL = 'GetLoginUrl',
  GET_LOGOUT_URL = 'GetLogoutUrl',
  GET_AUTH_TOKEN = 'GetAuthenticationToken',
  REFRESH_AUTH_TOKEN = 'RefreshIdToken',
  REVOKE_AUTH_TOKEN = 'RevokeAuthToken',
  GET_ALL_USERS = 'GetAllUsers',
  DOWNLOAD_CASE_FILE = 'DownloadCaseFile',
  RESTORE_CASE_FILE = 'RestoreCaseFile',
  GET_CASE_FILES = 'GetCaseFiles',
  GET_CASE_FILE_DETAIL = 'GetCaseFileDetail',
  GET_CASE_AUDIT = 'GetCaseAudit',
  REQUEST_CASE_AUDIT = 'RequestCaseAudit',
  GET_CASE_FILE_AUDIT = 'GetCaseFileAudit',
  REQUEST_CASE_FILE_AUDIT = 'RequestCaseFileAudit',
  GET_AVAILABLE_ENDPOINTS = 'GetAvailableEndpoints',
  GET_SCOPED_CASE_INFO = 'GetScopedCaseInformation',
  GET_USER_AUDIT = 'GetUserAudit',
  REQUEST_USER_AUDIT = 'RequestUserAudit',
  GET_SYSTEM_AUDIT = 'GetSystemAudit',
  REQUEST_SYSTEM_AUDIT = 'RequestSystemAudit',
  GET_DATA_VAULT_FILE_AUDIT = 'GetDataVaultFileAudit',
  REQUEST_DATA_VAULT_FILE_AUDIT = 'RequestDataVaultFileAudit',
  GET_DATA_VAULT_AUDIT = 'GetDataVaultAudit',
  REQUEST_DATA_VAULT_AUDIT = 'RequestDataVaultAudit',
  AWS_API_CALL = 'AwsApiCall',
  UNKNOWN = 'UnknownEvent',
}

export enum IdentityType {
  COGNITO_ID = 'CognitoId',
  COGNITO_TOKEN = 'CognitoToken',
  FULL_USER_ID = 'FullUser',
  AUTH_CODE_REQUESTOR = 'AuthCodeRequestor',
  ID_TOKEN_REQUESTOR = 'TokenRequestor',
  UNIDENTIFIED_REQUESTOR = 'UnidentifiedRequestor',
  LOGIN_URL_REQUESTOR = 'LoginUrlRequestor',
  LOGOUT_URL_REQUESTOR = 'LogoutUrlRequestor',
}

// If no identifying information is provided
export type UnidentifiedRequestor = {
  idType: IdentityType.UNIDENTIFIED_REQUESTOR;
  sourceIp: string;
};

// The data in this identifier comes from a user requesting an idtoken by requesting an authCode
export type AuthCodeRequestor = {
  idType: IdentityType.AUTH_CODE_REQUESTOR;
  sourceIp: string;
  authCode: string;
};

// The data in this identifier comes from a user making a credentials exchange, providing an idToken
export type TokenExchangeRequestor = {
  idType: IdentityType.ID_TOKEN_REQUESTOR;
  sourceIp: string;
  idToken: string;
};

// The data in this identifier is guaranteed as soon as we enter our standard IAM gated endpoints
export type CognitoIdentityId = {
  idType: IdentityType.COGNITO_ID;
  sourceIp: string;
  idPoolUserId: string;
};

// The data in this identifier comes from successful retrieval of Cognito token (+ data from the prior progression)
export type CognitoTokenId = {
  idType: IdentityType.COGNITO_TOKEN;
  sourceIp: string;
  idPoolUserId: string;
  username: string;
  deaRole: string;
  userPoolUserId: string;
  groupMemberships?: string;
};

export type LoginUrlId = {
  idType: IdentityType.LOGIN_URL_REQUESTOR;
  sourceIp: string;
};

export type LogoutUrlId = {
  idType: IdentityType.LOGOUT_URL_REQUESTOR;
  sourceIp: string;
};

// The data in this identifier comes from successful creation or retrieval of a DEA user (+ data from the prior progression)
export type FullUserId = {
  idType: IdentityType.FULL_USER_ID;
  sourceIp: string;
  idPoolUserId: string; // unique id given to federated user by the Cognito Identity Pool
  username: string;
  firstName: string;
  lastName: string;
  userUlid: string; // unique id for user granted and used by DEA system. Stored in DDB and used for CaseUser
  deaRole: string;
  userPoolUserId: string; // unique id given to federated user by the Cognito User Pool. Stored in DDB and used to determine whether user is in DB already or not
  groupMemberships?: string;
};

// We support different progressions of identifier, anticipating that we may encounter an error along the authentication process
export type ActorIdentity =
  | CognitoIdentityId
  | CognitoTokenId
  | FullUserId
  | AuthCodeRequestor
  | TokenExchangeRequestor
  | LoginUrlId
  | LogoutUrlId
  | UnidentifiedRequestor;

/**
 * The following content shall be included with every audited event:
  1. Date and time of the event.
  2. The component of the information system (e.g., software component, hardware component) where the event occurred.
  3. Type of event.
  4. User/subject identity.
  5. Outcome (success or failure) of the event.
 */
// If you are adding a new field here, make sure you also handle it in dea-audit-writer.ts prepare() and below in the query fields
// Also, ensure a corresponding column is added to audit-glue-table-columns.ts auditGlueTableColumns[]
export type CJISAuditEventBody = {
  dateTime: string;
  requestPath: string;
  sourceComponent: AuditEventSource;
  eventType: AuditEventType;
  actorIdentity: ActorIdentity;
  result: AuditEventResult;
  fileHash?: string;
  caseId?: string;
  fileId?: string;
  dataVaultId?: string;
  targetUserId?: string;
  caseActions?: string; // since we return audit results as a csv, this should be string where actions are joined by ":"
  downloadReason?: string;
  eventID: string; // guid to identify the event
};

export type CaseFileAuditParameters = {
  caseId: string;
  fileId: string;
  fileName: string;
  filePath: string;
  s3Key: string;
};

export type DataVaultFileAuditParameters = {
  dataVaultId: string;
  fileId: string;
  fileName: string;
  filePath: string;
  s3Key: string;
};

export interface AuditResult {
  status: QueryExecutionState | string;
  downloadUrl: string | undefined;
}

const continueOnError = false;
const requiredAuditValues = [
  'dateTime',
  'requestPath',
  'sourceComponent',
  'eventType',
  'actorIdentity',
  'result',
];
const fieldsToMask = ['password', 'accessKey', 'idToken', 'X-Amz-Security-Token'];
export class DeaAuditService extends AuditService {
  constructor(
    auditPlugin: AuditPlugin,
    continueOnError?: boolean,
    requiredAuditValues?: string[],
    fieldsToMask?: string[]
  ) {
    super(auditPlugin, continueOnError, requiredAuditValues, fieldsToMask);
  }

  public async writeCJISCompliantEntry(event: CJISAuditEventBody) {
    return this.write(event);
  }

  private async startAuditQuery(
    start: number,
    end: number,
    athenaClient: AthenaClient,
    whereClauses: string[] | undefined,
    auditType: AuditType,
    resourceId: string,
    repositoryProvider: ModelRepositoryProvider
  ) {
    const queryString = getAuditQueryString(AUDIT_GLUE_DATABASE, AUDIT_GLUE_TABLE, whereClauses, start, end);

    const startAthenaQueryCmd = new StartQueryExecutionCommand({
      QueryString: queryString,
      WorkGroup: ATHENA_WORKGROUP,
    });
    const startResponse = await athenaClient.send(startAthenaQueryCmd);
    if (!startResponse.QueryExecutionId) {
      throw new Error('Unknown error starting Athena Query.');
    }

    return AuditJobPersistence.createAuditJob(
      startResponse.QueryExecutionId,
      auditType,
      resourceId,
      repositoryProvider
    );
  }

  public async requestAuditForCase(
    caseId: string,
    start: number,
    end: number,
    resourceId: string,
    athenaClient: AthenaClient,
    repositoryProvider: ModelRepositoryProvider
  ) {
    const whereClauses = getCaseWhereClauses(caseId);

    return this.startAuditQuery(
      start,
      end,
      athenaClient,
      whereClauses,
      AuditType.CASE,
      resourceId,
      repositoryProvider
    );
  }

  public async requestAuditForCaseFile(
    caseFileParameters: CaseFileAuditParameters,
    start: number,
    end: number,
    resourceId: string,
    athenaClient: AthenaClient,
    repositoryProvider: ModelRepositoryProvider
  ) {
    const whereClauses = getCaseFileWhereClauses(caseFileParameters);
    return this.startAuditQuery(
      start,
      end,
      athenaClient,
      whereClauses,
      AuditType.CASEFILE,
      resourceId,
      repositoryProvider
    );
  }

  public async requestAuditForUser(
    userUlid: string,
    start: number,
    end: number,
    resourceId: string,
    athenaClient: AthenaClient,
    repositoryProvider: ModelRepositoryProvider
  ) {
    const whereClauses = getUserWhereClauses(userUlid);
    return this.startAuditQuery(
      start,
      end,
      athenaClient,
      whereClauses,
      AuditType.USER,
      resourceId,
      repositoryProvider
    );
  }

  public async requestSystemAudit(
    start: number,
    end: number,
    athenaClient: AthenaClient,
    repositoryProvider: ModelRepositoryProvider
  ) {
    return this.startAuditQuery(
      start,
      end,
      athenaClient,
      undefined,
      AuditType.SYSTEM,
      'SYSTEM',
      repositoryProvider
    );
  }

  public async requestAuditForDataVault(
    dataVaultId: string,
    start: number,
    end: number,
    resourceId: string,
    athenaClient: AthenaClient,
    repositoryProvider: ModelRepositoryProvider
  ) {
    const whereClauses = getDataVaultWhereClauses(dataVaultId);

    return this.startAuditQuery(
      start,
      end,
      athenaClient,
      whereClauses,
      AuditType.DATAVAULT,
      resourceId,
      repositoryProvider
    );
  }

  public async requestAuditForDataVaultFile(
    dataVaultFileParameters: DataVaultFileAuditParameters,
    start: number,
    end: number,
    resourceId: string,
    athenaClient: AthenaClient,
    repositoryProvider: ModelRepositoryProvider
  ) {
    const whereClauses = getDataVaultFileWhereClauses(dataVaultFileParameters);
    return this.startAuditQuery(
      start,
      end,
      athenaClient,
      whereClauses,
      AuditType.DATAVAULTFILE,
      resourceId,
      repositoryProvider
    );
  }

  public async getAuditResult(
    auditId: string,
    resourceUlid: string,
    auditType: AuditType,
    athenaClient: AthenaClient,
    repositoryProvider: ModelRepositoryProvider,
    sourceIp: string
  ): Promise<AuditResult> {
    const queryId = await AuditJobPersistence.getAuditJobQueryId(
      auditId,
      auditType,
      resourceUlid,
      repositoryProvider
    );

    const getExecCmd = new GetQueryExecutionCommand({
      QueryExecutionId: queryId,
    });
    const getResultsResponse = await athenaClient.send(getExecCmd);
    logger.debug('execution', { execution: getResultsResponse.QueryExecution });

    if (getResultsResponse.QueryExecution?.Status?.State === QueryExecutionState.SUCCEEDED) {
      const outputLocation = getResultsResponse.QueryExecution.ResultConfiguration?.OutputLocation;
      if (!outputLocation) {
        logger.error('No output location found for audit query.', getResultsResponse.QueryExecution.Status);
        return {
          status: QueryExecutionState.FAILED,
          downloadUrl: undefined,
        };
      }

      const locationParts = outputLocation.split('/');
      const bucket = locationParts[2];
      const key = locationParts.slice(3).join('/');
      const presignedUrl = await getAuditDownloadPresignedUrl(bucket, key, sourceIp);
      return {
        status: QueryExecutionState.SUCCEEDED,
        downloadUrl: presignedUrl,
      };
    } else {
      return {
        status: getResultsResponse.QueryExecution?.Status?.State ?? 'Unknown',
        downloadUrl: undefined,
      };
    }
  }
}

export const auditService = new DeaAuditService(
  deaAuditPlugin,
  continueOnError,
  requiredAuditValues,
  fieldsToMask
);
