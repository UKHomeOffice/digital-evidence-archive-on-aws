/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { ScopedDeaCase } from '@aws/dea-app/lib/models/case';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  ColumnLayout,
  Container,
  ContentLayout,
  Header,
  Modal,
  SpaceBetween,
  Spinner,
  StatusIndicator,
  TextContent,
} from '@cloudscape-design/components';
import { useEffect, useState } from 'react';
import { useAvailableEndpoints } from '../../api/auth';
import {
  getDataVaultFileAuditCSV,
  removeDataVaultFileCaseAssociation,
  useGetDataVaultFileDetailsById,
} from '../../api/data-vaults';
import {
  auditLogLabels,
  commonLabels,
  commonTableLabels,
  dataVaultDetailLabels,
  fileDetailLabels,
} from '../../common/labels';
import { useNotifications } from '../../context/NotificationsContext';
import { formatDateFromISOString } from '../../helpers/dateHelper';
import { formatFileSize } from '../../helpers/fileHelper';
import { AuditDownloadButton } from '../audit/audit-download-button';
import ActionContainer from '../common-components/ActionContainer';

export interface DataVaultFileDetailsBodyProps {
  readonly dataVaultId: string;
  readonly fileId: string;
  readonly setFileName: (name: string) => void;
}

export const DATA_VAULTS_FILE_AUDIT_ENDPOINT = '/datavaults/{dataVaultId}/files/{fileId}/auditPOST';
export const DOWNLOAD_VAULT_FILE_AUDIT_TEST_ID = 'download-data-vault-file-audit-button';
export const DELETE_DATA_VAULT_FILE_CASE_ASSOCIATION_PATH =
  '/datavaults/{dataVaultId}/files/{fileId}/caseAssociationsDELETE';

function DataVaultFileDetailsBody(props: DataVaultFileDetailsBodyProps): React.ReactNode {
  const { dataVaultId, fileId, setFileName } = props;
  const { data, isLoading, mutate } = useGetDataVaultFileDetailsById(dataVaultId, fileId);
  const [showDisassociateToCaseModal, setShowDisassociateToCaseModal] = useState(false);
  const [IsSubmitLoading, setIsSubmitLoading] = useState(false);
  const { pushNotification } = useNotifications();
  const [checkedState, setCheckedState] = useState<Record<string, boolean>>({});
  const availableEndpoints = useAvailableEndpoints();
  const hasCheckedCase = Object.values(checkedState).some(Boolean);

  useEffect(() => {
    if (data?.fileName) {
      setFileName(data.fileName);
    }
  }, [data?.fileName, setFileName]);

  function enableDisassociateToCaseModal() {
    setShowDisassociateToCaseModal(true);
  }

  function disableDisassociateToCaseModal() {
    setShowDisassociateToCaseModal(false);
  }

  async function disassociateToCaseHandler() {
    setIsSubmitLoading(true);
    try {
      const caseUlids = data?.cases?.filter((item) => checkedState[item.ulid]).map((item) => item.ulid) ?? [];
      await removeDataVaultFileCaseAssociation(props.dataVaultId, props.fileId, {
        caseUlids,
      });
      pushNotification('success', dataVaultDetailLabels.disassociateFromCaseSuccessNotificationMessage);
      mutate();
    } catch (e) {
      if (e instanceof Error) {
        pushNotification('error', e.message);
      }
    } finally {
      setIsSubmitLoading(false);
      disableDisassociateToCaseModal();
    }
  }

  function handleOnChange(position: number) {
    const caseUlid = data?.cases?.[position]?.ulid;
    if (!caseUlid) {
      return;
    }
    setCheckedState((prev) => ({
      ...prev,
      [caseUlid]: !prev[caseUlid],
    }));
  }

  function disassociateModal() {
    return (
      <Modal
        data-testid="disassociate-to-case-modal"
        onDismiss={disableDisassociateToCaseModal}
        visible={showDisassociateToCaseModal}
        closeAriaLabel={commonLabels.closeModalAriaLabel}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                data-testid="cancel-case-disassociation"
                variant="link"
                onClick={disableDisassociateToCaseModal}
              >
                {commonLabels.cancelButton}
              </Button>
              <Button
                data-testid="submit-case-disassociation"
                variant="primary"
                onClick={disassociateToCaseHandler}
                disabled={IsSubmitLoading || !hasCheckedCase}
              >
                {IsSubmitLoading ? <Spinner variant="disabled" /> : null}
                {commonLabels.disassociateButton}
              </Button>
            </SpaceBetween>
          </Box>
        }
        header={
          <TextContent>
            <h2>{`${dataVaultDetailLabels.disassociateFromCaseModalTitle} ${data?.fileName}`}</h2>
          </TextContent>
        }
      >
        <Box padding={{ bottom: 'xxl' }}>
          <SpaceBetween size="s">
            <TextContent>
              <h5>{dataVaultDetailLabels.disassociateFromCaseModalSectionHeader}</h5>
            </TextContent>
            <SpaceBetween size="l">
              <TextContent>{associatedCasesOption(data?.cases)}</TextContent>

              <Alert statusIconAriaLabel="Info">{dataVaultDetailLabels.disassociateWarning}</Alert>
            </SpaceBetween>
          </SpaceBetween>
        </Box>
      </Modal>
    );
  }

  function associatedCasesOption(cases: ScopedDeaCase[] | undefined) {
    return cases?.map((caseItem, index: number) => (
      <Checkbox
        key={`check-${caseItem.ulid}`}
        checked={checkedState[caseItem.ulid] ?? false}
        onChange={() => handleOnChange(index)}
      >
        {caseItem.name}
      </Checkbox>
    ));
  }

  if (isLoading) {
    return (
      <SpaceBetween size="l">
        <div></div>
        <StatusIndicator type="loading">{commonLabels.loadingLabel}</StatusIndicator>
      </SpaceBetween>
    );
  } else {
    if (!data) {
      return <h1>{commonLabels.notFoundLabel}</h1>;
    }

    return (
      <ContentLayout
        header={
          <SpaceBetween size="m">
            <Header variant="h1">{data.fileName}</Header>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="xxl">
          <Container
            header={
              <Header
                variant="h2"
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    <ActionContainer
                      required={DATA_VAULTS_FILE_AUDIT_ENDPOINT}
                      actions={availableEndpoints.data}
                    >
                      <AuditDownloadButton
                        label={auditLogLabels.downloadFileAuditLabel}
                        testId={DOWNLOAD_VAULT_FILE_AUDIT_TEST_ID}
                        permissionCallback={() =>
                          availableEndpoints.data?.includes(DATA_VAULTS_FILE_AUDIT_ENDPOINT)
                        }
                        downloadCallback={async () =>
                          await getDataVaultFileAuditCSV(data.dataVaultUlid, data.ulid)
                        }
                        type="DataVault"
                        targetName={data.fileName}
                      />
                    </ActionContainer>
                  </SpaceBetween>
                }
              >
                {fileDetailLabels.fileDetailsLabel}
              </Header>
            }
          >
            <ColumnLayout columns={3} variant="text-grid">
              <TextContent>
                <h5>{fileDetailLabels.uploadDateLabel}</h5>
                <SpaceBetween size="l">
                  <p>{formatDateFromISOString(data.created?.toString())}</p>
                </SpaceBetween>
              </TextContent>
              <TextContent>
                <h5>{fileDetailLabels.fileSizeLabel}</h5>
                <SpaceBetween size="l">
                  <p>{formatFileSize(data.fileSizeBytes)}</p>
                </SpaceBetween>
              </TextContent>
              <TextContent>
                <h5>{fileDetailLabels.shaHashLabel}</h5>
                <SpaceBetween size="l">
                  <p>{data.sha256Hash}</p>
                </SpaceBetween>
              </TextContent>
            </ColumnLayout>
          </Container>
          <Container
            header={
              <Header
                variant="h2"
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    {disassociateModal()}
                    <ActionContainer
                      required={DELETE_DATA_VAULT_FILE_CASE_ASSOCIATION_PATH}
                      actions={availableEndpoints.data}
                    >
                      <Button
                        data-testid="disassociate-data-vault-file-button"
                        onClick={enableDisassociateToCaseModal}
                        disabled={!data.caseCount}
                      >
                        {dataVaultDetailLabels.disassociateLabel}
                      </Button>
                    </ActionContainer>
                  </SpaceBetween>
                }
              >
                {dataVaultDetailLabels.dataVaultDetailsLabel}
              </Header>
            }
          >
            <ColumnLayout columns={2} variant="text-grid">
              <TextContent>
                <h5>{commonTableLabels.executionIdHeader}</h5>
                <p>{data.executionId}</p>
              </TextContent>
              <TextContent>
                <h5>{commonTableLabels.caseAssociationHeader}</h5>
                {associatedCasesTextContent(data.cases)}
              </TextContent>
            </ColumnLayout>
          </Container>
        </SpaceBetween>
      </ContentLayout>
    );
  }
}

export default DataVaultFileDetailsBody;

function associatedCasesTextContent(cases: ScopedDeaCase[] | undefined) {
  if (!cases?.length) {
    return '-';
  }
  return cases?.map((caseItem) => <p key={`p-${caseItem.ulid}`}>{caseItem.name}</p>);
}
