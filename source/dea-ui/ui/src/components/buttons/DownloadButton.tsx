/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { DownloadDTO } from '@aws/dea-app/lib/models/case-file';
import { CaseFileStatus } from '@aws/dea-app/lib/models/case-file-status';
import { CaseStatus } from '@aws/dea-app/lib/models/case-status';
import { Button, SpaceBetween, Spinner } from '@cloudscape-design/components';
import { useState } from 'react';
import { useAvailableEndpoints } from '../../api/auth';
import { getPresignedUrl, useGetCaseActions } from '../../api/cases';
import { DownloadStatus } from '../../common/enums';
import { commonLabels, fileOperationsLabels } from '../../common/labels';
import { FileDownloadProgressRow } from '../../common/types';
import { useNotifications } from '../../context/NotificationsContext';
import { canDownloadFiles, canRestoreFiles } from '../../helpers/userActionSupport';
import { FormFieldModal } from '../common-components/FormFieldModal';

export interface DownloadButtonProps {
  readonly caseId: string;
  readonly caseStatus: CaseStatus;
  readonly selectedFiles: DownloadDTO[];
  selectedFilesCallback: (setSelectedFiles: DownloadDTO[]) => void;
  readonly downloadInProgress: boolean;
  downloadInProgressCallback: (setDownloadInProgress: boolean) => void;
  readonly filesToRestore: DownloadDTO[];
  filesToRestoreCallback: (setFilesToRestore: DownloadDTO[]) => void;
  downloadProgressMap: Record<string, FileDownloadProgressRow>;
  setDownloadProgressMap: React.Dispatch<React.SetStateAction<Record<string, FileDownloadProgressRow>>>;
}

function DownloadButton(props: DownloadButtonProps): JSX.Element {
  const { pushNotification } = useNotifications();
  const userActions = useGetCaseActions(props.caseId);
  const availableEndpoints = useAvailableEndpoints();
  const [downloadReasonModalOpen, setDownloadReasonModalOpen] = useState(false);
  const [downloadReason, setDownloadReason] = useState('');

  async function downloadFilesHandler() {
    try {
      setDownloadReasonModalOpen(false);
      props.downloadInProgressCallback(true);

      for (const file of props.selectedFiles) {
        try {
          const downloadResponse = await getPresignedUrl({
            caseUlid: file.caseUlid,
            ulid: file.ulid,
            downloadReason: downloadReason,
          });

          if (!downloadResponse.downloadUrl) {
            if (downloadResponse.isRestoring) {
              pushNotification('info', fileOperationsLabels.restoreInProgress(file.fileName));
            } else if (downloadResponse.isArchived) {
              if (canRestoreFiles(userActions?.data?.actions, availableEndpoints.data)) {
                props.filesToRestoreCallback([...props.filesToRestore, file]);
              } else {
                pushNotification('error', fileOperationsLabels.archivedFileNoPermissionError(file.fileName));
              }
            }
            continue;
          }

          const response = await fetch(downloadResponse.downloadUrl);
          if (!response.ok || !response.body) {
            throw new Error('Download failed');
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const handle = await (window as any).showSaveFilePicker({ suggestedName: file.fileName });
          const writable = await handle.createWritable();
          const reader = response.body.getReader();
          const contentLengthHeader = response.headers.get('Content-Length');
          const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
          let received = 0;
          let finished = false;

          while (!finished) {
            const { done, value } = await reader.read();
            finished = done;

            if (value) {
              await writable.write(value);
              received += value.length;

              if (contentLength) {
                const percentage = Math.floor((received / contentLength) * 100).toString();

                props.setDownloadProgressMap((prev) => ({
                  ...prev,
                  [file.ulid]: {
                    fileName: file.fileName,
                    downloadStatus: DownloadStatus.progress,
                    downloadPercentage: percentage,
                    contentType: file.contentType ?? '',
                    fileSizeBytes: file.fileSizeBytes,
                    created: file.created?.toString() ?? '',
                    createdBy: file.createdBy,
                    updated: file.updated?.toString() ?? '',
                    updatedBy: file.updatedBy,
                    status: file.status.toString(),
                  },
                }));
              }
            }
          }

          await writable.close();

          props.setDownloadProgressMap((prev: Record<string, FileDownloadProgressRow>) => ({
            ...prev,
            [file.ulid]: {
              ...prev[file.ulid],
              downloadStatus: DownloadStatus.complete,
              downloadPercentage: '100',
            },
          }));
        } catch (e) {
          pushNotification('error', fileOperationsLabels.downloadFailed(file.fileName));
          console.error(`failed to download ${file.fileName}`, e);

          props.setDownloadProgressMap((prev) => ({
            ...prev,
            [file.ulid]: {
              ...prev[file.ulid],
              downloadStatus: DownloadStatus.failed,
              downloadPercentage: '0',
            },
          }));
        }
      }
    } finally {
      props.downloadInProgressCallback(false);
      setDownloadReason('');
      props.selectedFilesCallback([]);
    }
  }

  return (
    <SpaceBetween direction="horizontal" size="xs">
      <FormFieldModal
        modalTestId="download-file-reason-modal"
        inputTestId="download-file-reason-modal-input"
        cancelButtonTestId="download-file-reason-modal-cancel-button"
        primaryButtonTestId="download-file-reason-modal-primary-button"
        isOpen={downloadReasonModalOpen}
        title={fileOperationsLabels.downloadFileReasonLabel}
        inputHeader={fileOperationsLabels.downloadFileReasonInputHeader}
        inputDetails={fileOperationsLabels.downloadFileReasonInputDetails}
        inputField={downloadReason}
        setInputField={setDownloadReason}
        confirmAction={downloadFilesHandler}
        confirmButtonText={commonLabels.downloadButton}
        cancelAction={() => {
          setDownloadReasonModalOpen(false);
          setDownloadReason('');
        }}
        cancelButtonText={commonLabels.cancelButton}
      />
      <Button
        data-testid="download-file-button"
        variant="primary"
        onClick={() => {
          setDownloadReasonModalOpen(true);
        }}
        disabled={
          props.selectedFiles.length === 0 ||
          props.downloadInProgress ||
          !canDownloadFiles(userActions?.data?.actions) ||
          props.caseStatus !== CaseStatus.ACTIVE ||
          (props.selectedFiles.length === 1 && props.selectedFiles[0].status !== CaseFileStatus.ACTIVE)
        }
      >
        {commonLabels.downloadButton}
        {props.downloadInProgress ? <Spinner size="normal" /> : null}
      </Button>
    </SpaceBetween>
  );
}

export default DownloadButton;
