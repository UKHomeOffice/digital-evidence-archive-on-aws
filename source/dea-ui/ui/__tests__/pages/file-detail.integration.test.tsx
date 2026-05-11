import { CaseFileDTO } from '@aws/dea-app/lib/models/case-file';
import { CaseFileStatus } from '@aws/dea-app/lib/models/case-file-status';
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Axios from 'axios';
import { auditLogLabels } from '../../src/common/labels';
import FileDetailPage from '../../src/pages/file-detail';

afterEach(cleanup);

const push = jest.fn();
const CASE_ID = '100';
const FILE_ID = '200';
const CASE_NAME = 'mocked case';
jest.mock('next/router', () => ({
  useRouter: jest.fn().mockImplementation(() => ({
    query: { caseId: CASE_ID, fileId: FILE_ID, caseName: CASE_NAME },
    push,
  })),
}));

global.fetch = jest.fn(async () => new Response('foo'));
global.window.URL.createObjectURL = jest.fn(() => '');
global.window.open = jest.fn();
HTMLAnchorElement.prototype.click = jest.fn();

jest.mock('axios');
const mockedAxios = jest.mocked(Axios);

const mockedCaseActions = {
  caseUlid: '01GV15BH762P6MW1QH8EQDGBFQ',
  userUlid: '01GVHP0HP5V2A80XJZTHJH4QGD',
  userFirstName: 'John',
  userLastName: 'Doe',
  caseName: 'Investigation One',
  actions: ['VIEW_FILES', 'CASE_AUDIT', 'DOWNLOAD'],
  created: '2023-03-23T15:38:26.955Z',
  updated: '2023-03-23T15:38:26.955Z',
};

const mockedFileInfo: CaseFileDTO = {
  ulid: FILE_ID,
  caseUlid: CASE_ID,
  fileName: 'afile.png',
  contentType: 'image/png',
  createdBy: 'XXXXXXXXXXXXXXXXXXXXXXXXXX',
  filePath: '/food/',
  fileSizeBytes: 1234,
  sha256Hash: 'XXXXXXXXXXXXXXXXXXXXXXXXXX',
  status: CaseFileStatus.ACTIVE,
  created: new Date(),
  updated: new Date(),
  isFile: true,
  reason: 'reason',
  details: 'details',
  fileS3Key: '',
  updatedBy: '',
};

const mockedCaseDetail = {
  ulid: CASE_ID,
  name: 'mocked case',
  status: 'ACTIVE',
};

let csvCall = -1;
const csvResult = [{ status: 'Running' }, { status: 'Running' }, 'csvresults'];

mockedAxios.create.mockReturnThis();
mockedAxios.request.mockImplementation((eventObj) => {
  if (eventObj.url?.endsWith(`${CASE_ID}/files/200/info`)) {
    return Promise.resolve({
      data: mockedFileInfo,
      status: 200,
      statusText: 'Ok',
      headers: {},
      config: {},
    });
  } else if (eventObj.url?.endsWith(`${CASE_ID}/actions`)) {
    return Promise.resolve({
      data: mockedCaseActions,
      status: 200,
      statusText: 'Ok',
      headers: {},
      config: {},
    });
  } else if (eventObj.url?.endsWith('audit')) {
    return Promise.resolve({
      data: { auditId: '11111111-1111-1111-1111-111111111111' },
      status: 200,
      statusText: 'Ok',
      headers: {},
      config: {},
    });
  } else if (eventObj.url?.endsWith('details')) {
    return Promise.resolve({
      data: mockedCaseDetail,
      status: 200,
      statusText: 'Ok',
      headers: {},
      config: {},
    });
  } else if (eventObj.url?.endsWith('contents')) {
    return Promise.resolve({
      data: { downloadUrl: 'hello' },
      status: 200,
      statusText: 'Ok',
      headers: {},
      config: {},
    });
  } /* /csv */ else {
    return Promise.resolve({
      data: csvResult[++csvCall],
      status: 200,
      statusText: 'Ok',
      headers: {},
      config: {},
    });
  }
});

describe('FileDetailPage', () => {
  it('renders a case details page', async () => {
    const view = render(<FileDetailPage />);
    expect(view).toBeTruthy();

    const mockedFileText = await screen.findAllByText(mockedFileInfo.fileName);
    expect(mockedFileText.length).toBeGreaterThanOrEqual(1);
    expect(mockedFileText).toBeTruthy();
  });

  it('downloads a file audit', async () => {
    const view = render(<FileDetailPage />);
    expect(view).toBeTruthy();

    const downloadCsvButton = await screen.findByText(auditLogLabels.downloadFileAuditLabel);
    fireEvent.click(downloadCsvButton);

    // upload button will be disabled while in progress and then re-enabled when done
    await waitFor(() => expect(screen.queryByTestId('download-case-file-audit-button')).toBeDisabled());
    await waitFor(() => expect(screen.queryByTestId('download-case-file-audit-button')).toBeEnabled(), {
      timeout: 4000,
    });
  });

  it('downloads a file-detail file', async () => {
    const user = userEvent.setup();

    const view = render(<FileDetailPage />);
    expect(view).toBeTruthy();

    await waitFor(() =>
      expect(screen.getByTestId('download-file-reason-modal').className).toMatch('awsui_hidden_')
    );
    await user.click(screen.getByTestId('download-file-button'));

    const downloadReasonModal = screen.getByTestId('download-file-reason-modal');
    await waitFor(() => expect(downloadReasonModal.className).not.toMatch('awsui_hidden_'));

    const reasonInput = within(downloadReasonModal).getByRole('textbox');
    await user.clear(reasonInput);
    await user.type(reasonInput, 'Reason for download,;,.');

    await user.click(screen.getByTestId('download-file-reason-modal-primary-button'));

    await waitFor(() => expect(global.window.open).toHaveBeenCalledWith('hello', '_blank'));
    await waitFor(() => expect(screen.queryByTestId('download-file-button')).toBeEnabled(), {
      timeout: 4000,
    });
    await waitFor(() => expect(downloadReasonModal.className).toMatch('awsui_hidden_'));
  });
});
