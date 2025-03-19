/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { DeleteDTO } from '@aws/dea-app/lib/models/case-file';
import { CaseFileStatus } from '@aws/dea-app/lib/models/case-file-status';
import { CaseStatus } from '@aws/dea-app/lib/models/case-status';
import { Button, SpaceBetween, Spinner } from '@cloudscape-design/components';
import { useState } from 'react';
import { removeCaseFile, useGetCaseActions } from '../../api/cases';
import { commonLabels, fileOperationsLabels } from '../../common/labels';
import { useNotifications } from '../../context/NotificationsContext';
import { canDeleteFiles } from '../../helpers/userActionSupport';
import { FormFieldModal } from '../common-components/FormFieldModal';

export interface DeleteButtonProps {
  readonly caseId: string;
  readonly caseStatus: CaseStatus;
  readonly selectedFiles: DeleteDTO[];
  selectedFilesCallback: (setSelectedFiles: DeleteDTO[]) => void;
  readonly deleteInProgress: boolean;
  deleteInProgressCallback: (setDownloadInProgress: boolean) => void;
  readonly filesToRestore: DeleteDTO[];
  filesToRestoreCallback: (setFilesToRestore: DeleteDTO[]) => void;
}

function DeleteButton(props: DeleteButtonProps): JSX.Element {
  const { pushNotification } = useNotifications();
  const userActions = useGetCaseActions(props.caseId);
  const [deleteReasonModalOpen, setDeleteReasonModalOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');

  async function deleteFilesHandler() {
    const filesToDelete: string[] = [];
    try {
      setDeleteReasonModalOpen(false);
      props.deleteInProgressCallback(true);

      let allFilesDeleted = true;
      for (const file of props.selectedFiles) {
        filesToDelete.push(file.fileName);
      }
      try {
        console.log('Files being deleted:', filesToDelete.toString());
        await removeCaseFile(props.caseId, filesToDelete);
      } catch (e) {
        pushNotification('error', fileOperationsLabels.deleteFailed(filesToDelete.toString()));
        console.log(`failed to delete ${filesToDelete.toString()}`, e);
        allFilesDeleted = false;
      }

      if (allFilesDeleted) {
        pushNotification('success', fileOperationsLabels.deleteSucceeds(props.selectedFiles.length));
      }
    } finally {
      props.deleteInProgressCallback(false);
      setDeleteReason('');
      props.selectedFilesCallback([]);
    }
  }

  return (
    <SpaceBetween direction="horizontal" size="xs">
      <FormFieldModal
        modalTestId="delete-file-reason-modal"
        inputTestId="delete-file-reason-modal-input"
        cancelButtonTestId="delete-file-reason-modal-cancel-button"
        primaryButtonTestId="delete-file-reason-modal-primary-button"
        isOpen={deleteReasonModalOpen}
        title={fileOperationsLabels.deleteFileReasonLabel}
        inputHeader={fileOperationsLabels.deleteFileReasonInputHeader}
        inputDetails={fileOperationsLabels.deleteFileReasonInputDetails}
        inputField={deleteReason}
        setInputField={setDeleteReason}
        confirmAction={deleteFilesHandler}
        confirmButtonText={commonLabels.deleteButton}
        cancelAction={() => {
          // close modal and delete any reason inputted
          setDeleteReasonModalOpen(false);
          setDeleteReason('');
        }}
        cancelButtonText={commonLabels.cancelButton}
      />
      <Button
        data-testid="delete-file-button"
        variant="primary"
        onClick={() => {
          setDeleteReasonModalOpen(true);
        }}
        disabled={
          props.selectedFiles.length === 0 ||
          props.deleteInProgress ||
          !canDeleteFiles(userActions?.data?.actions) ||
          // inactive case can't download evidence, even if evidence are all active/not destroyed
          props.caseStatus !== CaseStatus.ACTIVE ||
          // individual evidence download page needs special disallow case since the page requires a selectedFiles entry to load metadata
          (props.selectedFiles.length === 1 && props.selectedFiles[0].status !== CaseFileStatus.ACTIVE)
        }
      >
        {commonLabels.deleteButton}
        {props.deleteInProgress ? <Spinner size="normal" /> : null}
      </Button>
    </SpaceBetween>
  );
}

export default DeleteButton;
