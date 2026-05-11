/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { DownloadDTO, InitiateCaseFileUploadDTO } from '@aws/dea-app/lib/models/case-file';
import { CaseFileStatus } from '@aws/dea-app/lib/models/case-file-status';
import {
  Alert,
  Box,
  Button,
  Container,
  Form,
  FormField,
  Header,
  Icon,
  Input,
  Modal,
  SpaceBetween,
  Spinner,
  Table,
  Textarea,
} from '@cloudscape-design/components';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { completeUpload, initiateUpload, useListCaseFiles } from '../../api/cases';
import { commonLabels, commonTableLabels, fileOperationsLabels } from '../../common/labels';
import { useNotifications } from '../../context/NotificationsContext';
import { refreshCredentials } from '../../helpers/authService';
import { FileWithPath, formatFileSize } from '../../helpers/fileHelper';
import FileUpload from '../common-components/FileUpload';
import { MyUploader, UploaderCompleteEvent } from './MBTPUploader';
import { UploadFilesProps } from './UploadFilesBody';

interface FileUploadProgressRow {
  fileName: string;
  status: UploadStatus;
  fileSizeBytes: number;
  relativePath: string;
  uploadPercentage: string;
  errorMessage?: string;
}

enum UploadStatus {
  progress = 'Uploading',
  complete = 'Uploaded',
  failed = 'Upload failed',
}

interface UploadDetails {
  caseUlid: string;
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  chunkSizeBytes: number;
  contentType: string;
  reason: string;
  details: string;
}

interface ActiveFileUpload {
  file: FileWithPath;
  caseFileUploadDetails: UploadDetails;
}

export const MAX_CHUNK_SIZE_NUMBER_ONLY = 350;
export const ONE_MB = 1024 * 1024;
const MAX_PARALLEL_PART_UPLOADS = 10;
const MAX_PARALLEL_UPLOADS = 2; // One file concurrently for now. The backend requires a code refactor to deal with the TransactionConflictException thrown ocassionally.

function fetchFilesWithStatus(files: DownloadDTO[], status: CaseFileStatus): string {
  return files
    .filter((file) => file.status === status)
    .map((file) => file.filePath + file.fileName)
    .join(',');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return 'The upload could not be completed.';
}

function convertSecondsToMinutes(seconds: number): string {
  const minutes = Math.floor(seconds / 60); // Get whole minutes
  const remainingSeconds = Math.floor(seconds % 60); // Get remaining seconds
  return `${minutes}m ${remainingSeconds}s`;
}

function fetchCommonFiles(fileNames: string[], data: DownloadDTO[]): DownloadDTO[] {
  const selectedFileNames = new Set(fileNames);
  const seen = new Set<string>();

  return data.filter((file) => {
    const fullPath = file.filePath + file.fileName;
    if (!selectedFileNames.has(fullPath) || seen.has(fullPath)) {
      return false;
    }

    seen.add(fullPath);
    return true;
  });
}

function applyProgressUpdate(
  rows: FileUploadProgressRow[],
  progress: { fileName: string; percentage: number }
): FileUploadProgressRow[] {
  return rows.map((file) => {
    if (file.fileName === progress.fileName) {
      return {
        ...file,
        uploadPercentage: String(progress.percentage),
      };
    }
    return file;
  });
}

function UploadFilesForm(props: UploadFilesProps): React.ReactNode {
  const [selectedFiles, setSelectedFiles] = useState<FileWithPath[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<FileUploadProgressRow[]>([]);
  const [details, setDetails] = useState('');
  const [reason, setReason] = useState('');
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const router = useRouter();
  const { data } = useListCaseFiles(props.caseId, props.filePath);
  const { pushNotification } = useNotifications();

  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [confirmDeletedFilesOverwrite, setConfirmDeletedFilesOverwrite] = useState(false);

  const [overwriteFileList, setOverwriteFileList] = useState('');
  const [deleteOverwriteFileList, setDeleteOverwriteFileList] = useState('');

  async function onSubmitHandler() {
    const startTime = performance.now();
    // top level try/finally to set uploadInProgress bool state
    try {
      setUploadInProgress(true);

      setUploadedFiles([
        ...uploadedFiles,
        ...selectedFiles.map((file) => ({
          fileName: file.name,
          fileSizeBytes: file.size,
          status: file.size === 0 ? UploadStatus.failed : UploadStatus.progress,
          relativePath: file.relativePath,
          uploadPercentage: '0',
        })),
      ]);

      let position = 0;
      while (position < selectedFiles.length) {
        const itemsForBatch = selectedFiles.slice(position, position + MAX_PARALLEL_UPLOADS);
        await Promise.all(itemsForBatch.map((item) => uploadFile(item)));
        position += MAX_PARALLEL_UPLOADS;
      }

      setSelectedFiles([]);
    } finally {
      setUploadInProgress(false);

      const endTime = performance.now(); // Record end time in milliseconds
      const timeTaken = (endTime - startTime) / 1000; // Time in seconds
      const totalTimeInMinsSecs = convertSecondsToMinutes(timeTaken);

      console.log(`All files uploaded successfully in ${totalTimeInMinsSecs}.`);
    }
  }

  async function uploadFilePartsAndComplete(activeFileUpload: ActiveFileUpload) {
    const chunkSizeBytes = activeFileUpload.caseFileUploadDetails.chunkSizeBytes;
    const totalChunks = Math.ceil(activeFileUpload.caseFileUploadDetails.fileSizeBytes / chunkSizeBytes);
    let uploadId: string | undefined = undefined;

    const uploadDto: InitiateCaseFileUploadDTO = {
      ...activeFileUpload.caseFileUploadDetails,
      // range is inclusive
      partRangeStart: 1,
      partRangeEnd: totalChunks,
      uploadId,
    };

    const initiatedCaseFile = await initiateUpload(uploadDto);
    uploadId = initiatedCaseFile.uploadId;

    if (!initiatedCaseFile.presignedUrls) {
      throw new Error('No presigned urls provided');
    }

    const parts = initiatedCaseFile.presignedUrls.map((preSignedUrl, index) => ({
      signedUrl: preSignedUrl,
      PartNumber: index + 1,
    }));

    const handleError = (e: unknown) => {
      reportUploadFailure(activeFileUpload.file, e);
      console.log('Upload failed', e);
    };

    const handleProgress = (p: { fileName: string; percentage: number }) => {
      setUploadedFiles((prevState) => applyProgressUpdate(prevState, p));
    };

    const handleComplete = async (_uce: UploaderCompleteEvent) => {
      await completeUpload({
        caseUlid: props.caseId,
        ulid: initiatedCaseFile.ulid,
        uploadId: initiatedCaseFile.uploadId,
      });
      updateFileProgress(activeFileUpload.file, UploadStatus.complete);
    };

    const axiosUploader = new MyUploader({
      parts,
      chunkSize: chunkSizeBytes,
      uploadId: uploadId,
      fileKey: initiatedCaseFile.fileS3Key,
      file: activeFileUpload.file,
      uploadDto: uploadDto,
      threads: MAX_PARALLEL_PART_UPLOADS,
      timeout: 300000,
      onProgressFn: handleProgress,
      onErrorFn: handleError,
      onCompleteFn: handleComplete,
    });

    await axiosUploader.start();

    await refreshCredentials();
  }

  async function uploadFile(selectedFile: FileWithPath) {
    if (selectedFile.size === 0) {
      reportUploadFailure(selectedFile, 'File is empty. Please select a file larger than 0 bytes.');
      return;
    }

    const fileSizeBytes = selectedFile.size;
    // Trying to use small chunk size (50MB) to reduce memory use.
    // Maximum object size	5 TiB
    // Maximum number of parts per upload	10,000
    // 5 MiB to 5 GiB. There is no minimum size limit on the last part of your multipart upload.
    const chunkSizeBytes = Math.max(selectedFile.size / 10_000, MAX_CHUNK_SIZE_NUMBER_ONLY * ONE_MB);

    let newFilePAth = props.filePath + selectedFile.relativePath;
    newFilePAth = newFilePAth.replaceAll('//', '/');

    // per file try/finally state to initiate uploads
    try {
      const contentType = selectedFile.type ? selectedFile.type : 'text/plain';
      const activeFileUpload: ActiveFileUpload = {
        file: selectedFile,
        caseFileUploadDetails: {
          caseUlid: props.caseId,
          fileName: selectedFile.name,
          filePath: newFilePAth,
          fileSizeBytes,
          chunkSizeBytes,
          contentType,
          reason,
          details,
        },
      };
      await uploadFilePartsAndComplete(activeFileUpload);
    } catch (e) {
      reportUploadFailure(selectedFile, e);
      console.log('Upload failed', e);
    }
  }

  function reportUploadFailure(selectedFile: FileWithPath, error: unknown) {
    const errorMessage = getErrorMessage(error);
    updateFileProgress(selectedFile, UploadStatus.failed, errorMessage);
    pushNotification('error', `${selectedFile.name}: ${errorMessage}`);
  }

  function updateFileProgress(selectedFile: FileWithPath, status: UploadStatus, errorMessage?: string) {
    setUploadedFiles((prev) => {
      const newList = [...prev];
      const canUpdateStatus = (currentStatus: UploadStatus) => {
        if (status === UploadStatus.failed) {
          return currentStatus !== UploadStatus.failed;
        }
        return currentStatus === UploadStatus.progress;
      };

      const fileToUpdateStatus = newList.find(
        (file) =>
          file.fileName === selectedFile.name &&
          file.relativePath === selectedFile.relativePath &&
          canUpdateStatus(file.status)
      );

      if (fileToUpdateStatus) {
        fileToUpdateStatus.status = status;
        fileToUpdateStatus.errorMessage = status === UploadStatus.failed ? errorMessage : undefined;
        if (status === UploadStatus.complete) {
          fileToUpdateStatus.uploadPercentage = '100';
        }
      }
      return newList;
    });
  }

  function statusCell(uploadProgress: FileUploadProgressRow) {
    switch (uploadProgress.status) {
      case UploadStatus.progress: {
        return (
          <Box>
            <SpaceBetween direction="horizontal" size="xs" key={uploadProgress.fileName}>
              <Spinner />
              <span>
                {uploadProgress.status} | {uploadProgress.uploadPercentage}%
              </span>
            </SpaceBetween>
          </Box>
        );
      }
      case UploadStatus.failed: {
        return (
          <Box>
            <SpaceBetween direction="vertical" size="xxs" key={uploadProgress.fileName}>
              <SpaceBetween direction="horizontal" size="xs">
                <Icon name="status-negative" variant="error" />
                <span>
                  {uploadProgress.status} | {uploadProgress.uploadPercentage}%
                </span>
              </SpaceBetween>
              {uploadProgress.errorMessage ? <span>{uploadProgress.errorMessage}</span> : null}
            </SpaceBetween>
          </Box>
        );
      }
      case UploadStatus.complete: {
        return (
          <Box>
            <SpaceBetween direction="horizontal" size="xs" key={uploadProgress.fileName}>
              <Icon name="check" variant="success" />
              <span>
                {' '}
                {uploadProgress.status} | {uploadProgress.uploadPercentage}%
              </span>
            </SpaceBetween>
          </Box>
        );
      }
      default: {
        return (
          <Box>
            <SpaceBetween direction="horizontal" size="xs" key={uploadProgress.fileName}>
              <Icon name="file" />
              <span>{uploadProgress.status}</span>
            </SpaceBetween>
          </Box>
        );
      }
    }
  }

  function onDoneHandler() {
    void router.push(`/case-detail?caseId=${props.caseId}`);
  }

  function validateFields(): boolean {
    return reason.length > 1 && details.length > 1;
  }

  function validateOverwrite(): void {
    if (data.length <= 0) {
      return;
    }
    const fileNames: string[] = selectedFiles.map((file) =>
      (file.relativePath + props.filePath + file.name).replaceAll('//', '/')
    );

    const filesBeingOverwritten: DownloadDTO[] = fetchCommonFiles(fileNames, data);

    if (filesBeingOverwritten.length > 0) {
      const listOfActiveFilesBeingOverwritten = fetchFilesWithStatus(
        filesBeingOverwritten,
        CaseFileStatus.ACTIVE
      );
      if (listOfActiveFilesBeingOverwritten.length > 0) {
        setOverwriteFileList(listOfActiveFilesBeingOverwritten);
        setConfirmOverwrite(true);
      }

      const deletedFiles = fetchFilesWithStatus(filesBeingOverwritten, CaseFileStatus.DELETED);
      if (deletedFiles.length > 0) {
        setDeleteOverwriteFileList(deletedFiles);
        setConfirmDeletedFilesOverwrite(true);
      }
    }
  }

  function showConfirmUploadModal() {
    validateOverwrite();
    setConfirmationVisible(true);
  }

  return (
    <SpaceBetween data-testid="upload-file-form-space" size="xxl">
      <Modal
        data-testid="upload-file-form-modal"
        onDismiss={() => {
          setConfirmationVisible(false);
          setConfirmOverwrite(false);
        }}
        visible={confirmationVisible}
        closeAriaLabel="Close modal"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="link"
                onClick={() => {
                  setConfirmationVisible(false);
                  setConfirmOverwrite(false);
                  setConfirmDeletedFilesOverwrite(false);
                }}
              >
                Go back
              </Button>
              <Button
                data-testid="confirm-upload-button"
                variant="primary"
                disabled={confirmDeletedFilesOverwrite}
                onClick={() => {
                  void onSubmitHandler();
                  setConfirmationVisible(false);
                  setConfirmOverwrite(false);
                  setConfirmDeletedFilesOverwrite(false);
                }}
              >
                Confirm
              </Button>
            </SpaceBetween>
          </Box>
        }
        header={fileOperationsLabels.modalTitle}
      >
        <Alert statusIconAriaLabel="Warning" type="warning">
          {fileOperationsLabels.modalBody}
          {overwriteFileList.length > 0 && confirmOverwrite && (
            <>
              <br />
              {fileOperationsLabels.modalBodyOverwriteWarn}
              <br />
              <ol>
                {overwriteFileList.split(',').map((fileName) => (
                  <li key={fileName}>{fileName}</li>
                ))}
              </ol>
            </>
          )}
          {deleteOverwriteFileList.length > 0 && confirmDeletedFilesOverwrite && (
            <>
              <br />
              {fileOperationsLabels.modalBodyOverwriteDeleteWarn}
              <br />
              <ol>
                {deleteOverwriteFileList.split(',').map((fileName) => (
                  <li key={fileName}>{fileName}</li>
                ))}
              </ol>
            </>
          )}
        </Alert>
      </Modal>
      <Form>
        <Container
          header={
            <Header variant="h2" description={fileOperationsLabels.uploadFileDescription}>
              {fileOperationsLabels.uploadDetailsLabel}
            </Header>
          }
        >
          <SpaceBetween direction="vertical" size="l">
            <FormField
              data-testid="input-details"
              label={fileOperationsLabels.evidenceDetailsLabel}
              description={fileOperationsLabels.evidenceDetailsDescription}
              errorText={details.length > 1 ? '' : commonLabels.requiredLength}
            >
              <Textarea
                value={details}
                onChange={({ detail: { value } }) => {
                  setDetails(value);
                }}
              />
            </FormField>
            <FormField
              data-testid="input-reason"
              label={fileOperationsLabels.uploadReasonLabel}
              description={fileOperationsLabels.uploadReasonDescription}
              errorText={reason.length > 1 ? '' : commonLabels.requiredLength}
            >
              <Input
                value={reason}
                onChange={({ detail: { value } }) => {
                  setReason(value);
                }}
              />
            </FormField>
            <FileUpload
              onChange={(files: FileWithPath[]) => setSelectedFiles(files)}
              value={selectedFiles}
              disabled={uploadInProgress}
            />
          </SpaceBetween>
        </Container>
      </Form>

      <SpaceBetween direction="horizontal" size="xs">
        <Button formAction="none" variant="link" onClick={onDoneHandler}>
          {commonLabels.doneButton}
        </Button>
        <Button
          variant="primary"
          iconAlign="right"
          data-testid="upload-file-submit"
          onClick={() => {
            showConfirmUploadModal();
          }}
          disabled={uploadInProgress || !validateFields()}
        >
          {commonLabels.uploadAndSaveButton}
        </Button>
        {uploadInProgress ? <Spinner size="big" variant="disabled" /> : null}
      </SpaceBetween>
      <Container
        header={
          <Header description={fileOperationsLabels.uploadStatusDescription}>
            {fileOperationsLabels.caseFilesLabel}
          </Header>
        }
      >
        <Table
          items={uploadedFiles}
          variant="embedded"
          columnDefinitions={[
            {
              id: 'name',
              header: commonTableLabels.nameHeader,
              cell: (e) => e.fileName,
              width: 170,
              minWidth: 165,
              sortingField: 'fileName',
            },
            {
              id: 'size',
              header: commonTableLabels.fileSizeHeader,
              cell: (e) => formatFileSize(e.fileSizeBytes),
              width: 170,
              minWidth: 165,
              sortingField: 'fileSizeBytes',
            },
            {
              id: 'status',
              header: commonTableLabels.statusHeader,
              cell: statusCell,
              width: 170,
              minWidth: 165,
              maxWidth: 180,
              sortingField: 'status',
            },
          ]}
          resizableColumns
        />
      </Container>
    </SpaceBetween>
  );
}

export default UploadFilesForm;
