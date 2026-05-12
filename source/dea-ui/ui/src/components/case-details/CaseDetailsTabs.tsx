/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { CaseStatus } from '@aws/dea-app/lib/models/case-status';
import { Tabs, TabsProps } from '@cloudscape-design/components';
import { useMemo } from 'react';
import { useGetCaseActions } from '../../api/cases';
import { caseDetailLabels } from '../../common/labels';
import { canInvite, canViewFiles } from '../../helpers/userActionSupport';
import CaseFilesTable from './CaseFilesTable';
import ManageAccessForm from './ManageAccessForm';

export interface CaseDetailsTabsProps {
  readonly caseId: string;
  readonly caseStatus: CaseStatus;
  readonly fileCount: number;
  readonly caseName: string;
}

function CaseDetailsTabs(props: CaseDetailsTabsProps): React.ReactNode {
  const { data } = useGetCaseActions(props.caseId);
  const tabs = useMemo<TabsProps.Tab[]>(() => {
    if (!data) {
      return [];
    }

    const tabsContents: TabsProps.Tab[] = [];
    if (canViewFiles(data.actions)) {
      tabsContents.push({
        label: caseDetailLabels.caseFilesLabel,
        id: 'caseFiles',
        content: (
          <CaseFilesTable
            caseId={props.caseId}
            caseStatus={props.caseStatus}
            fileCount={props.fileCount}
            caseName={props.caseName}
          />
        ),
      });
    }
    if (canInvite(data.actions)) {
      tabsContents.push({
        label: caseDetailLabels.manageAccessLabel,
        id: 'caseAccess',
        content: <ManageAccessForm caseId={props.caseId} activeUser={data} />,
      });
    }

    return tabsContents;
  }, [data, props.caseId, props.caseStatus, props.fileCount, props.caseName]);
  return <Tabs data-testid="case-details-tabs" tabs={tabs} />;
}

export default CaseDetailsTabs;
