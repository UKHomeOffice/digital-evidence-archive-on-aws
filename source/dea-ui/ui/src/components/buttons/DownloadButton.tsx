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

function DownloadButton(props: DownloadButtonProps): JSX.Element {
  const { pushNotification } = useNotifications();
  const userActions = useGetCaseActions(props.caseId);
  const availableEndpoints = useAvailableEndpoints();
  const [downloadReasonModalOpen, setDownloadReasonModalOpen] = useState(false);
  const [downloadReason, setDownloadReason] = useState('');

  // const MAX_CHUNK_SIZE_NUMBER_ONLY = 350;
  // const ONE_MB = 1024 * 1024;

  async function fetchWithRange(url: string, start: number, end: number) {
    const res = await fetch(url, {
      headers: {
        range: `bytes=${start}-${end}`,
      },
    });
    return res;
  }

  function convertSecondsToMinutes(seconds: number): string {
    const minutes = Math.floor(seconds / 60); // Get whole minutes
    const remainingSeconds = Math.floor(seconds % 60); // Get remaining seconds

    // Format the output as "minutes:seconds"
    return `${minutes}m ${remainingSeconds}s`;
  }

  async function downloadInChunks(url: string, fileName: string) {
    const chunks: Blob[] = []; //Array to hold downloaded parts
    let totalBytesDownloaded = 0;

    // First, make a request to get the total file size
    const initialRes = await fetch(url, { method: 'HEAD' });

    const contentLength = initialRes.headers.get('Content-Length');
    if (!contentLength) {
      throw new Error('Content-Length header is missing');
    }

    const totalFileSize = parseInt(contentLength);

    if (isNaN(totalFileSize)) {
      throw new Error('Invalid Content-Length header value');
    }

    console.log(`Total file size: ${totalFileSize} bytes`);

    // Define how many parallel chunks to download
    const numParallelDownloads = 4; // You can adjust this number based on your network

    // Calculate the chunk size for each parallel download
    const chunkSize = Math.ceil(totalFileSize / numParallelDownloads);

    // Create an array of promises for parallel downloads
    const downloadPromises = [];

    for (let i = 0; i < numParallelDownloads; i++) {
      const start = i * chunkSize;
      const end = Math.min((i + 1) * chunkSize - 1, totalFileSize - 1);

      console.log(`Downloading bytes ${start} to ${end}`);

      // Push the parallel download promise into the array
      const downloadPromise = fetchWithRange(url, start, end).then((res) => {
        if (res.ok) {
          // Collect the chunk data as a Blob
          return res.blob().then((blob) => {
            chunks.push(blob);
            totalBytesDownloaded += blob.size;
            // Calculate and log the progress
            const percentageDownloaded = (totalBytesDownloaded / totalFileSize) * 100;
            console.log(`Downloaded ${totalBytesDownloaded} bytes (${percentageDownloaded.toFixed(2)}%)`);
          });
        } else {
          throw new Error('Failed to fetch the range.');
        }
      });

      downloadPromises.push(downloadPromise);
    }

    // Wait for all parallel downloads to finish
    await Promise.all(downloadPromises);

    // Combine all chunks into one Blob
    const combinedBlob = new Blob(chunks);
    const downloadUrl = URL.createObjectURL(combinedBlob);

    // Create a download link and trigger the download
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName; // Specify the final file name
    link.click();

    // Clean up the object URL after the download
    URL.revokeObjectURL(downloadUrl);

    console.log('Download complete!');
  }

  async function downloadFilesHandler() {
    try {
      setDownloadReasonModalOpen(false);
      props.downloadInProgressCallback(true);

      let allFilesDownloaded = true;
      for (const file of props.selectedFiles) {
        const startTime = performance.now();
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

          await downloadInChunks(downloadResponse.downloadUrl, file.fileName);
          // else {
          //   const alink = document.createElement('a');
          //   alink.href = downloadResponse.downloadUrl;
          //   alink.download = file.fileName;
          //   alink.rel = 'noopener';
          //   alink.style.display = 'none';
          //   window.open(downloadResponse.downloadUrl, '_blank');
          //   // sleep 5ms => common problem when trying to quickly download files in succession => https://stackoverflow.com/a/54200538
          //   // long term we should consider zipping the files in the backend and then downloading as a single file
          // await sleep(100);

          const endTime = performance.now(); // Record end time in milliseconds
          const timeTaken = (endTime - startTime) / 1000; // Time in seconds
          const totalTimeInMinsSecs = convertSecondsToMinutes(timeTaken);
          console.log(`File ${file.fileName} downloaded successfully in ${totalTimeInMinsSecs}.`);
          // }
        } catch (e) {
          pushNotification('error', fileOperationsLabels.downloadFailed(file.fileName));
          console.log(`failed to download ${file.fileName}`, e);
          allFilesDownloaded = false;
        }
      }

      if (allFilesDownloaded) {
        pushNotification('success', fileOperationsLabels.downloadSucceeds(props.selectedFiles.length));
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
