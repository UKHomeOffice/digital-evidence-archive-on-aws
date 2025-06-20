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

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function DownloadButton(props: DownloadButtonProps): JSX.Element {
  const { pushNotification } = useNotifications();
  const userActions = useGetCaseActions(props.caseId);
  const availableEndpoints = useAvailableEndpoints();
  const [downloadReasonModalOpen, setDownloadReasonModalOpen] = useState(false);
  const [downloadReason, setDownloadReason] = useState('');

  async function downloadFilesHandler() {
    // const downloadPromises = [];

    try {
      setDownloadReasonModalOpen(false);
      props.downloadInProgressCallback(true);

      // let allFilesDownloaded = true;
      // const startTime = performance.now();

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

          const handle = await (window as any).showSaveFilePicker({ suggestedName: file.fileName });
          const writable = await handle.createWritable();
          const reader = response.body.getReader();
          const bufferQueue: Uint8Array[] = [];
          let bufferedBytes = 0;
          const BUFFER_LIMIT = 10 * 1024 * 1024; // 10 MB

          let finished = false;
          const contentLengthHeader = response.headers.get('Content-Length');
          const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
          let received = 0;

          while (!finished) {
            const { done, value } = await reader.read();
            finished = done;

            if (value) {
              bufferQueue.push(value);
              bufferedBytes += value.length;

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

            if (bufferedBytes >= BUFFER_LIMIT) {
              await writable.write(concatUint8Arrays(bufferQueue));
              bufferQueue.length = 0;
              bufferedBytes = 0;
            }
          }

          if (bufferQueue.length) {
            await writable.write(concatUint8Arrays(bufferQueue));
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
          // close modal and delete any reason inputted
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
          // inactive case can't download evidence, even if evidence are all active/not destroyed
          props.caseStatus !== CaseStatus.ACTIVE ||
          // individual evidence download page needs special disallow case since the page requires a selectedFiles entry to load metadata
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
