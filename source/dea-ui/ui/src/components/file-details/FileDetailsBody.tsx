/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { CaseFileDTO, DownloadDTO } from '@aws/dea-app/lib/models/case-file';
import { CaseFileStatus } from '@aws/dea-app/lib/models/case-file-status';
import {
  Box,
  ColumnLayout,
  Container,
  ContentLayout,
  Grid,
  Header,
  SpaceBetween,
  StatusIndicator,
  TextContent,
} from '@cloudscape-design/components';
import * as React from 'react';
import {
  getCaseFileAuditCSV,
  useGetCaseActions,
  useGetCaseById,
  useGetFileDetailsById,
} from '../../api/cases';
import { auditLogLabels, caseStatusLabels, commonLabels, fileDetailLabels } from '../../common/labels';
import { formatFileSize } from '../../helpers/fileHelper';
import { canDownloadCaseAudit } from '../../helpers/userActionSupport';
import { AuditDownloadButton } from '../audit/audit-download-button';
import DownloadButton from '../buttons/DownloadButton';
import DataVaultAssociationDetailsBody from './DataVaultAssociationDetailsBody';

export interface FileDetailsBodyProps {
  readonly caseId: string;
  readonly fileId: string;
  readonly setFileName: (name: string) => void;
}

function FileDetailsBody(props: FileDetailsBodyProps): JSX.Element {
  const { setFileName } = props;
  const { data: fileData, isLoading: fileIsLoading } = useGetFileDetailsById(props.caseId, props.fileId);
  const { data: caseData, isLoading: caseIsLoading } = useGetCaseById(props.caseId);
  const userActions = useGetCaseActions(props.caseId);
  const [downloadInProgress, setDownloadInProgress] = React.useState(false);
  const [filesToRestore, setFilesToRestore] = React.useState<DownloadDTO[]>([]);

  function getStatusIcon(status: string) {
    if (status == CaseFileStatus.ACTIVE) {
      return <StatusIndicator>{caseStatusLabels.active}</StatusIndicator>;
    } else {
      return <StatusIndicator type="stopped">{status}</StatusIndicator>;
    }
  }

  function getDataVaultSection(data: CaseFileDTO | undefined) {
    if (!data?.dataVaultUlid) {
      return;
    } else {
      const dataVaultData = {
        dataVaultUlid: data.dataVaultUlid,
        dataVaultName: data.dataVaultName ? data.dataVaultName : data.dataVaultUlid,
        executionId: data.executionId ? data.executionId : '-',
        associationCreatedBy: data.associationCreatedBy ? data.associationCreatedBy : '-',
        associationDate: data.associationDate,
      };
      return <DataVaultAssociationDetailsBody {...dataVaultData} />;
    }
  }

  React.useEffect(() => {
    if (fileData) {
      setFileName(fileData.fileName);
    }
  }, [setFileName, fileData, fileData?.fileName]);

  if (fileIsLoading || caseIsLoading) {
    return (
      <SpaceBetween size="l">
        <div></div>
        <StatusIndicator type="loading">{commonLabels.loadingLabel}</StatusIndicator>
      </SpaceBetween>
    );
  } else {
    if (!fileData || !caseData) {
      return <h1>{commonLabels.notFoundLabel}</h1>;
    }

    let uploadDate = null;

    if (fileData.dataVaultUploadDate) {
      uploadDate = new Date(fileData.dataVaultUploadDate);
    } else if (fileData.updated) {
      uploadDate = new Date(fileData.updated);
    }

    uploadDate = uploadDate
      ? uploadDate.toLocaleString([], {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          hour12: false, // 24-hour format
        })
      : '-';

    return (
      <ContentLayout
        header={
          <Grid gridDefinition={[{ colspan: { default: 9, xxs: 3 } }, { colspan: { default: 3, xxs: 9 } }]}>
            <Header variant="h1">{fileData.fileName}</Header>
            <Box float="right">
              <SpaceBetween size="m" direction="horizontal">
                <DownloadButton
                  caseId={props.caseId}
                  caseStatus={caseData.status}
                  selectedFiles={[{ ...fileData }]}
                  selectedFilesCallback={() => void 0}
                  downloadInProgress={downloadInProgress}
                  downloadInProgressCallback={setDownloadInProgress}
                  filesToRestore={filesToRestore}
                  filesToRestoreCallback={setFilesToRestore}
                />
              </SpaceBetween>
            </Box>
          </Grid>
        }
      >
        <SpaceBetween size="xxl">
          <Container
            header={
              <Header
                variant="h2"
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    <AuditDownloadButton
                      label={auditLogLabels.caseFileAuditLogLabel}
                      testId="download-case-file-audit-button"
                      permissionCallback={() => canDownloadCaseAudit(userActions.data?.actions)}
                      downloadCallback={async () => await getCaseFileAuditCSV(props.caseId, props.fileId)}
                      type="CaseFileAudit"
                      targetName={fileData?.fileName}
                    />
                  </SpaceBetween>
                }
              >
                {fileDetailLabels.fileDetailsLabel}
              </Header>
            }
          >
            <ColumnLayout columns={3} variant="text-grid">
              <TextContent>
                <div>
                  {' '}
                  {fileData.status == 'DELETED' && <h5>{fileDetailLabels.deletedDateLabel}</h5>}
                  {fileData.status != 'DELETED' && <h5>{fileDetailLabels.uploadDateLabel}</h5>}
                  <SpaceBetween size="l">
                    <p>{uploadDate}</p>

                    <h5>{fileDetailLabels.fileSizeLabel}</h5>
                  </SpaceBetween>
                  <p>{formatFileSize(fileData.fileSizeBytes)}</p>
                </div>
              </TextContent>
              <TextContent>
                <div>
                  <h5>{commonLabels.description}</h5>
                  <p>{fileData.details}</p>
                </div>
              </TextContent>
              <TextContent>
                <div>
                  <h5>{commonLabels.statusLabel}</h5>
                  <SpaceBetween size="l">
                    <p>{getStatusIcon(fileData.status)}</p>

                    <h5>{fileDetailLabels.shaHashLabel}</h5>
                  </SpaceBetween>
                  <p>{fileData.sha256Hash}</p>
                </div>
              </TextContent>
            </ColumnLayout>
          </Container>
          {getDataVaultSection(fileData)}
        </SpaceBetween>
      </ContentLayout>
    );
  }
}

export default FileDetailsBody;
