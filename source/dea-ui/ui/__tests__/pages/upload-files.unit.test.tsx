import { fail } from 'assert';

import wrapper from '@cloudscape-design/components/test-utils/dom';
import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';

import * as casesApi from '../../src/api/cases';
import { breadcrumbLabels, commonLabels } from '../../src/common/labels';
import { NotificationsProvider } from '../../src/context/NotificationsContext';
import Home from '../../src/pages/upload-files';

const push = jest.fn();
const CASE_ID = '100';
const CASE_NAME = 'mocked case';

const mockFetch = jest.fn(async () => new Response());
Object.defineProperty(globalThis, 'fetch', {
  value: mockFetch,
  writable: true,
});
jest.mock('next/router', () => ({
  useRouter: jest.fn().mockImplementation(() => ({
    query: { caseId: CASE_ID, filePath: '/huh', caseName: CASE_NAME },
    push,
  })),
}));

jest.mock('../../src/api/cases', () => ({
  useListCaseFiles: jest.fn().mockReturnValue({ data: [], isLoading: false }),
  initiateUpload: jest.fn().mockResolvedValue({
    ulid: 'abc',
    uploadId: 'upload-1',
    fileS3Key: 'test/key',
    presignedUrls: ['https://example.com/upload-part-1'],
  }),
  completeUpload: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/helpers/authService', () => ({
  refreshCredentials: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('axios');

const mockedAxios = jest.mocked(axios);
const mockedCompleteUpload = jest.mocked(casesApi.completeUpload);
mockedAxios.create.mockReturnThis();
mockedAxios.request.mockResolvedValue({
  data: {
    ulid: 'abc',
    name: CASE_NAME,
    status: 'ACTIVE',
    federationCredentials: [],
  },
  status: 200,
  statusText: 'Ok',
  headers: {},
  config: {},
});

const renderHome = () =>
  render(
    <NotificationsProvider>
      <Home />
    </NotificationsProvider>
  );

const fillUploadMetadata = async (): Promise<void> => {
  const detailsField = screen.getByTestId('input-details');
  const detailsTextarea = within(detailsField).getByRole('textbox');
  await userEvent.clear(detailsTextarea);
  await userEvent.type(detailsTextarea, 'description');

  const reasonField = screen.getByTestId('input-reason');
  const reasonInput = within(reasonField).getByRole('textbox');
  await userEvent.clear(reasonInput);
  await userEvent.type(reasonInput, 'reason');
};

describe('UploadFiles page', () => {
  afterEach(() => {
    mockFetch.mockClear();
    jest.clearAllMocks();
  });

  it('renders the component', () => {
    const view = renderHome();

    // assert breadcrumb
    const breadcrumbWrapper = wrapper(view.container).findBreadcrumbGroup();
    expect(breadcrumbWrapper).toBeTruthy();
    const breadcrumbLinks = breadcrumbWrapper?.findBreadcrumbLinks();
    expect(breadcrumbLinks?.length).toEqual(3);
    if (breadcrumbLinks) {
      expect(breadcrumbLinks[0].getElement()).toHaveTextContent(breadcrumbLabels.homePageLabel);
      expect(breadcrumbLinks[1].getElement()).toHaveTextContent(CASE_NAME);
      expect(breadcrumbLinks[2].getElement()).toHaveTextContent(breadcrumbLabels.uploadFilesAndFoldersLabel);
    } else {
      fail('breadcrumbLinks is undefined');
    }
  });
  it('responds to done', () => {
    renderHome();

    const doneButton = screen.getByText(commonLabels.doneButton);

    const btn = wrapper(doneButton);
    btn.click();
    expect(push).toHaveBeenCalledWith(`/case-detail?caseId=${CASE_ID}`);
  });

  it('responds to form submit', async () => {
    renderHome();

    const selectFileInput = screen.getByTestId('file-select');
    expect(selectFileInput).toBeTruthy();
    const testFile = new File(['hello'], 'hello.world', { type: 'text/plain' });
    await userEvent.upload(selectFileInput, [testFile]);
    await fillUploadMetadata();

    // modal is not visible initially
    expect(wrapper(document.body).findModal()?.isVisible()).toBe(false);

    const uploadButton = screen.getByText(commonLabels.uploadAndSaveButton);
    const uploadButtonWrapper = wrapper(uploadButton);
    uploadButtonWrapper.click();

    await waitFor(() => expect(wrapper(document.body).findModal()?.isVisible()).toBe(true));
    const submitButton = screen.getByTestId('confirm-upload-button');
    const submitButtonWrapper = wrapper(submitButton);
    submitButtonWrapper.click();
    await waitFor(() => expect(wrapper(document.body).findModal()?.isVisible()).toBe(false));

    // upload button is enabled again when upload finishes
    await waitFor(() => expect(screen.queryByTestId('upload-file-submit')).toBeEnabled());
  });

  it('should reject empty files and mark them as failed', async () => {
    const view = renderHome();

    const selectFileInput = screen.getByTestId('file-select');
    expect(selectFileInput).toBeTruthy();

    // Create an empty file and a valid file
    const emptyFile = new File([], 'empty.txt', { type: 'text/plain' });
    const validFile = new File(['content'], 'valid.txt', { type: 'text/plain' });
    await userEvent.upload(selectFileInput, [emptyFile, validFile]);
    await fillUploadMetadata();

    const uploadButton = screen.getByText(commonLabels.uploadAndSaveButton);
    const uploadButtonWrapper = wrapper(uploadButton);
    uploadButtonWrapper.click();

    await waitFor(() => expect(wrapper(document.body).findModal()?.isVisible()).toBe(true));
    const submitButton = screen.getByTestId('confirm-upload-button');
    const submitButtonWrapper = wrapper(submitButton);
    submitButtonWrapper.click();

    await waitFor(() => expect(wrapper(document.body).findModal()?.isVisible()).toBe(false));

    // Wait for upload to complete
    await waitFor(() => expect(screen.queryByTestId('upload-file-submit')).toBeEnabled());

    // Check that empty file is marked as failed in the table
    const table = wrapper(view.container).findTable();
    expect(table).toBeTruthy();
    const rows = table?.findRows();
    expect(rows?.length).toBeGreaterThanOrEqual(2);

    // Find the empty file row and verify it shows failed status
    const emptyFileRow = rows?.find((row) => {
      const cells = row.findAll('[data-testid]');
      return cells.some((cell) => cell.getElement().textContent?.includes('empty.txt'));
    });

    if (emptyFileRow) {
      expect(emptyFileRow.getElement().textContent).toContain('Upload failed');
    }
  });

  it('should show upload failed status for empty files in the status table', async () => {
    renderHome();

    const selectFileInput = screen.getByTestId('file-select');
    const emptyFile = new File([], 'empty.txt', { type: 'text/plain' });
    await userEvent.upload(selectFileInput, [emptyFile]);
    await fillUploadMetadata();

    const uploadButton = screen.getByText(commonLabels.uploadAndSaveButton);
    const uploadButtonWrapper2 = wrapper(uploadButton);
    uploadButtonWrapper2.click();

    await waitFor(() => expect(wrapper(document.body).findModal()?.isVisible()).toBe(true));
    const submitButton = screen.getByTestId('confirm-upload-button');
    const submitButtonWrapper = wrapper(submitButton);
    submitButtonWrapper.click();

    await waitFor(() => expect(wrapper(document.body).findModal()?.isVisible()).toBe(false));

    // Verify table shows the file with failed status
    expect(await screen.findByText('Upload failed | 0%')).toBeInTheDocument();
  });

  it('shows the backend completion error when completing an upload fails', async () => {
    mockedCompleteUpload.mockRejectedValueOnce(new Error('Cannot complete upload for an empty file.'));

    const view = renderHome();

    const selectFileInput = screen.getByTestId('file-select');
    const testFile = new File(['hello'], 'hello.world', { type: 'text/plain' });
    await userEvent.upload(selectFileInput, [testFile]);
    await fillUploadMetadata();

    const uploadButton = screen.getByText(commonLabels.uploadAndSaveButton);
    wrapper(uploadButton).click();

    await waitFor(() => expect(wrapper(document.body).findModal()?.isVisible()).toBe(true));
    const submitButton = screen.getByTestId('confirm-upload-button');
    wrapper(submitButton).click();
    await waitFor(() => expect(wrapper(document.body).findModal()?.isVisible()).toBe(false));
    await waitFor(() => expect(screen.queryByTestId('upload-file-submit')).toBeEnabled());

    const failedRow = await screen.findByRole('row', {
      name: /Cannot complete upload for an empty file\./i,
    });

    expect(within(failedRow).queryByText(/^Uploaded\s*\|/i)).not.toBeInTheDocument();
    const failureMessage = await screen.findByText('Cannot complete upload for an empty file.');
    expect(failureMessage).toBeInTheDocument();
    expect(view.container).toHaveTextContent('Upload failed');
  });
});
