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
import axios from 'axios';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { completeUpload, initiateUpload } from '../../api/cases';
import { commonLabels, commonTableLabels, fileOperationsLabels } from '../../common/labels';
import { refreshCredentials } from '../../helpers/authService';
import { FileWithPath, formatFileSize } from '../../helpers/fileHelper';
import { InitiateUploadForm } from '../../models/CaseFiles';
import FileUpload from '../common-components/FileUpload';
import { UploadFilesProps } from './UploadFilesBody';

const MINUTES_TO_MILLISECONDS = 60 * 1000;

interface FileUploadProgressRow {
  fileName: string;
  status: UploadStatus;
  fileSizeBytes: number;
  relativePath: string;
}

enum UploadStatus {
  progress = 'Uploading',
  complete = 'Uploaded',
  failed = 'Upload failed',
}

interface ActiveFileUpload {
  file: FileWithPath;
  upoadDto: InitiateUploadForm;
}

export const ONE_MB = 1024 * 1024;
export const ONE_GB = ONE_MB * 1024;
const MAX_PARALLEL_UPLOADS = 6;

function UploadFilesForm(props: UploadFilesProps): JSX.Element {
  const [selectedFiles, setSelectedFiles] = useState<FileWithPath[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<FileUploadProgressRow[]>([]);
  const [details, setDetails] = useState('');
  const [reason, setReason] = useState('');
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const router = useRouter();

  async function onSubmitHandler() {
    try {
      setUploadInProgress(true);

      setUploadedFiles([
        ...uploadedFiles,
        ...selectedFiles.map((file) => ({
          fileName: file.name,
          fileSizeBytes: Math.max(file.size, 1),
          status: UploadStatus.progress,
          relativePath: file.relativePath,
        })),
      ]);

      let position = 0;
      while (position < selectedFiles.length) {
        const itemsForBatch = selectedFiles.slice(position, position + MAX_PARALLEL_UPLOADS);
        console.log(`Uploading batch starting from position ${position}:`, itemsForBatch);
        await Promise.all(itemsForBatch.map((item) => uploadFile(item)));
        position += MAX_PARALLEL_UPLOADS;
      }

      setSelectedFiles([]);
    } catch (error) {
      console.error('Error during file upload submission:', error);
    } finally {
      setUploadInProgress(false);
    }
  }

  async function blobToArrayBuffer(blob: Blob) {
    console.log('Converting blob to ArrayBuffer...');
    if ('arrayBuffer' in blob) {
      return await blob.arrayBuffer();
    }

    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result && typeof reader.result !== 'string') {
          resolve(reader.result);
        }
        reject(new Error('Failed to convert blob to ArrayBuffer.'));
      };
      reader.onerror = () => reject(new Error('Error reading blob.'));
      reader.readAsArrayBuffer(blob);
    });
  }

  async function uploadFilePartsAndComplete(activeFileUpload: ActiveFileUpload, chunkSizeBytes: number) {
    console.log('Initiating upload for file:', activeFileUpload.file.name);
    const initiatedCaseFile = await initiateUpload(activeFileUpload.upoadDto);

    let credentials = initiatedCaseFile.federationCredentials;
    console.log('Upload initiated. Case details:', initiatedCaseFile);

    const credentialsInterval = setInterval(async () => {
      try {
        console.log('Refreshing credentials...');
        await refreshCredentials();
        const refreshRequest = await initiateUpload({
          ...activeFileUpload.upoadDto,
          uploadId: initiatedCaseFile.uploadId,
        });
        credentials = refreshRequest.federationCredentials;
        console.log('Credentials refreshed successfully.');
      } catch (error) {
        console.error('Error refreshing credentials:', error);
      }
    }, 20 * MINUTES_TO_MILLISECONDS);

    try {
      const totalChunks = Math.ceil(activeFileUpload.file.size / chunkSizeBytes);
      for (let i = 0; i < totalChunks; i++) {
        const chunkBlob = activeFileUpload.file.slice(i * chunkSizeBytes, (i + 1) * chunkSizeBytes);
        console.log(`Uploading chunk ${i + 1}/${totalChunks} for file:`, activeFileUpload.file.name);
        await uploadChunk(chunkBlob, initiatedCaseFile, i + 1, credentials);
      }
    } catch (error) {
      console.error('Error during file part upload:', error);
    } finally {
      clearInterval(credentialsInterval);
    }

    try {
      console.log('Completing upload for file:', activeFileUpload.file.name);
      await completeUpload({
        caseUlid: props.caseId,
        ulid: initiatedCaseFile.ulid,
        uploadId: initiatedCaseFile.uploadId,
      });
      updateFileProgress(activeFileUpload.file, UploadStatus.complete);
    } catch (error) {
      console.error('Error completing upload:', error);
    }
  }

  async function uploadChunk(chunkBlob: Blob, initiatedCaseFile: any, partNumber: number, credentials: any) {
    const arrayBuffer = await blobToArrayBuffer(chunkBlob);
    console.log(`Calculated ArrayBuffer for part ${partNumber}`);

    // Calculate SHA-256 hash using Web Crypto API
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const partHash = btoa(String.fromCharCode(...hashArray));

    const url = initiatedCaseFile.preSignedUrls[partNumber - 1];
    console.log(`Uploading part ${partNumber} to URL:`, url);

    try {
      await axios.put(url, arrayBuffer, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-amz-checksum-sha256': partHash,
          'x-amz-algorithm': 'AWS4-HMAC-SHA256',
          'x-amz-credential': `${credentials.accessKeyId}/${credentials.sessionToken}`,
          'x-amz-security-token': credentials.sessionToken,
        },
      });
      console.log(`Successfully uploaded part ${partNumber}`);
    } catch (error) {
      console.error(`Upload of part ${partNumber} failed`, error);
      throw error;
    }
  }

  async function uploadFile(selectedFile: FileWithPath) {
    const fileSizeBytes = Math.max(selectedFile.size, 1);
    const chunkSizeBytes = 300 * ONE_MB;

    try {
      const activeFileUpload: ActiveFileUpload = {
        file: selectedFile,
        upoadDto: {
          caseUlid: props.caseId,
          fileName: selectedFile.name,
          filePath: selectedFile.relativePath,
          fileSizeBytes,
          chunkSizeBytes,
          contentType: selectedFile.type || 'text/plain',
          reason,
          details,
        },
      };
      console.log('Uploading file:', selectedFile.name);
      await uploadFilePartsAndComplete(activeFileUpload, chunkSizeBytes);
    } catch (error) {
      updateFileProgress(selectedFile, UploadStatus.failed);
      console.error('Upload failed for file:', selectedFile.name, error);
    }
  }

  function updateFileProgress(selectedFile: FileWithPath, status: UploadStatus) {
    setUploadedFiles((prev) => {
      const newList = [...prev];
      const fileToUpdateStatus = newList.find(
        (file) =>
          file.fileName === selectedFile.name &&
          file.relativePath === selectedFile.relativePath &&
          file.status === UploadStatus.progress
      );
      if (fileToUpdateStatus) {
        fileToUpdateStatus.status = status;
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
              <span>{uploadProgress.status}</span>
            </SpaceBetween>
          </Box>
        );
      }
      case UploadStatus.failed: {
        return (
          <Box>
            <SpaceBetween direction="horizontal" size="xs" key={uploadProgress.fileName}>
              <Icon name="status-negative" variant="error" />
              <span>{uploadProgress.status}</span>
            </SpaceBetween>
          </Box>
        );
      }
      case UploadStatus.complete: {
        return (
          <Box>
            <SpaceBetween direction="horizontal" size="xs" key={uploadProgress.fileName}>
              <Icon name="check" variant="success" />
              <span>{uploadProgress.status}</span>
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
    return router.push(`/case-detail?caseId=${props.caseId}`);
  }

  function validateFields(): boolean {
    return reason.length > 1 && details.length > 1;
  }

  return (
    <SpaceBetween data-testid="upload-file-form-space" size="xxl">
      <Modal
        data-testid="upload-file-form-modal"
        onDismiss={() => setConfirmationVisible(false)}
        visible={confirmationVisible}
        closeAriaLabel="Close modal"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setConfirmationVisible(false)}>
                Go back
              </Button>
              <Button
                data-testid="confirm-upload-button"
                variant="primary"
                onClick={() => {
                  void onSubmitHandler();
                  setConfirmationVisible(false);
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
          onClick={() => setConfirmationVisible(true)}
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
              id: 'fileName',
              header: commonTableLabels.nameHeader,
              cell: (e) => e.fileName,
              width: 170,
              minWidth: 165,
              sortingField: 'fileName',
            },
            {
              id: 'fileSizeBytes',
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
