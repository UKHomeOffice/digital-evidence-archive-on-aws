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
import { commonLabels, fileOperationsLabels } from '../../common/labels';
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
}

interface DownloadOptions {
  signedUrl: string;
  filename: string;
  chunkSize?: number; // Size of each chunk in bytes (default: 10MB)
  maxConcurrentChunks?: number; // Maximum concurrent downloads (default: 5)
  onProgress?: (progress: number) => void; // Progress callback (0-100)
}

interface ChunkInfo {
  start: number;
  end: number;
  index: number;
}

function DownloadButton(props: DownloadButtonProps): JSX.Element {
  const { pushNotification } = useNotifications();
  const userActions = useGetCaseActions(props.caseId);
  const availableEndpoints = useAvailableEndpoints();
  const [downloadReasonModalOpen, setDownloadReasonModalOpen] = useState(false);
  const [downloadReason, setDownloadReason] = useState('');

  const ONE_MB = 1024 * 1024;
  const MAX_CHUNK_SIZE_NUMBER_ONLY = 350 * ONE_MB;
  const DEFAULT_MAX_CONCURRENT = 10;

  async function downloadFile(options: DownloadOptions): Promise<Blob> {
    const {
      signedUrl,
      filename,
      chunkSize = MAX_CHUNK_SIZE_NUMBER_ONLY,
      maxConcurrentChunks = DEFAULT_MAX_CONCURRENT,
      onProgress,
    } = options;

    try {
      // First, get the file size using a HEAD request
      const fileSize = await getFileSize(signedUrl);

      if (fileSize <= chunkSize) {
        // If file is small, download in one piece
        return await downloadSingleChunk(signedUrl, onProgress);
      }

      // Calculate chunks
      const chunks = calculateChunks(fileSize, chunkSize);

      // Download chunks with concurrency control
      const chunkData = await downloadChunksWithConcurrency(
        signedUrl,
        chunks,
        maxConcurrentChunks,
        onProgress
      );

      // Combine chunks into final blob
      return new Blob(chunkData, { type: 'application/octet-stream' });
    } catch (error) {
      throw new Error(`Failed to download ${filename}: ${error}`);
    }
  }

  async function getFileSize(signedUrl: string): Promise<number> {
    const response = await fetch(signedUrl, {
      method: 'GET',
      headers: {
        Range: 'bytes=0-0', // Only fetch first byte
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const contentRange = response.headers.get('Content-Range');
    if (!contentRange) {
      throw new Error('No Content-Range header found');
    }

    const contentLength = contentRange.split('/')[1];

    // Example: Content-Range: bytes 0-0/123456
    const totalSize = parseInt(contentLength, 10);

    return totalSize;
  }

  function calculateChunks(fileSize: number, chunkSize: number): ChunkInfo[] {
    const chunks: ChunkInfo[] = [];
    let start = 0;
    let index = 0;

    while (start < fileSize) {
      const end = Math.min(start + chunkSize - 1, fileSize - 1);
      chunks.push({ start, end, index });
      start = end + 1;
      index++;
    }
    console.log('calculateChunks: chunks', chunks);

    return chunks;
  }

  async function downloadSingleChunk(
    signedUrl: string,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    const response = await fetch(signedUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (onProgress) {
      onProgress(100);
    }

    return await response.blob();
  }

  async function downloadChunksWithConcurrency(
    signedUrl: string,
    chunks: ChunkInfo[],
    maxConcurrent: number,
    onProgress?: (progress: number) => void
  ): Promise<ArrayBuffer[]> {
    const results: ArrayBuffer[] = new Array(chunks.length);
    const downloadedChunks = new Set<number>();
    let chunkIndex = 0;

    return new Promise((resolve, reject) => {
      const updateProgress = () => {
        if (onProgress) {
          const progress = (downloadedChunks.size / chunks.length) * 100;
          onProgress(Math.round(progress));
        }
      };

      const downloadChunk = async (chunk: ChunkInfo) => {
        try {
          const response = await fetch(signedUrl, {
            headers: {
              Range: `bytes=${chunk.start}-${chunk.end}`,
            },
          });

          if (!response.ok && response.status !== 206) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          results[chunk.index] = arrayBuffer;
          downloadedChunks.add(chunk.index);

          updateProgress();

          // Check if all chunks are downloaded
          if (downloadedChunks.size === chunks.length) {
            resolve(results);
            return;
          }

          // Start next download if available
          if (chunkIndex < chunks.length) {
            downloadChunk(chunks[chunkIndex++]).catch(reject);
          }
        } catch (error) {
          reject(error);
        }
      };

      // Start initial concurrent downloads
      const initialDownloads = Math.min(maxConcurrent, chunks.length);
      for (let i = 0; i < initialDownloads; i++) {
        downloadChunk(chunks[chunkIndex++]).catch(reject);
      }
    });
  }

  async function downloadAndSave(options: DownloadOptions): Promise<void> {
    const blob = await downloadFile(options);

    // Create download link and trigger download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = options.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  function convertSecondsToMinutes(seconds: number): string {
    const minutes = Math.floor(seconds / 60); // Get whole minutes
    const remainingSeconds = Math.floor(seconds % 60); // Get remaining seconds

    // Format the output as "minutes:seconds"
    return `${minutes}m ${remainingSeconds}s`;
  }

  async function downloadFilesHandler() {
    const downloadStartTime = performance.now();
    console.log(`Download started at ${new Date()}.`);

    try {
      setDownloadReasonModalOpen(false);
      props.downloadInProgressCallback(true);

      let allFilesDownloaded = true;
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

          console.log('Pre-Signed URL', downloadResponse.downloadUrl);

          await downloadAndSave({
            signedUrl: downloadResponse.downloadUrl,
            filename: file.fileName,
            chunkSize: MAX_CHUNK_SIZE_NUMBER_ONLY,
            maxConcurrentChunks: 10,
            onProgress: (progress) => {
              console.log(`Download progress: ${progress}`);
            },
          });
        } catch (e) {
          pushNotification('error', fileOperationsLabels.downloadFailed(file.fileName));
          console.log(`failed to download ${file.fileName}`, e);
          allFilesDownloaded = false;
        }
      }

      if (allFilesDownloaded) {
        pushNotification('success', fileOperationsLabels.downloadSucceeds(props.selectedFiles.length));
      }

      const endTime = performance.now(); // Record end time in milliseconds
      const timeTaken = (endTime - downloadStartTime) / 1000; // Time in seconds
      convertSecondsToMinutes(timeTaken);
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
