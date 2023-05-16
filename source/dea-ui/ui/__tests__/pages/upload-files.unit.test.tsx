import wrapper from '@cloudscape-design/components/test-utils/dom';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail } from 'assert';
import axios from 'axios';
import { breadcrumbLabels, commonLabels } from '../../src/common/labels';
import Home from '../../src/pages/upload-files';

const push = jest.fn();
const CASE_ID = '100';

global.fetch = jest.fn(() => ({}));
jest.mock('next/router', () => ({
  useRouter: jest.fn().mockImplementation(() => ({
    query: { caseId: CASE_ID, filePath: '/' },
    push,
  })),
}));

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;
mockedAxios.create.mockReturnThis();
mockedAxios.request.mockResolvedValue({
  data: {
    ulid: 'abc',
    name: 'mocked case',
    status: 'ACTIVE',
    presignedUrls: ['hello', 'world'],
  },
  status: 200,
  statusText: 'Ok',
  headers: {},
  config: {},
});

describe('UploadFiles page', () => {
  it('renders the component', () => {
    const page = render(<Home />);

    // assert breadcrumb
    const breadcrumbWrapper = wrapper(page.container).findBreadcrumbGroup();
    expect(breadcrumbWrapper).toBeTruthy();
    const breadcrumbLinks = breadcrumbWrapper?.findBreadcrumbLinks()!;
    expect(breadcrumbLinks.length).toEqual(3);
    expect(breadcrumbLinks[0].getElement()).toHaveTextContent(breadcrumbLabels.homePageLabel);
    expect(breadcrumbLinks[1].getElement()).toHaveTextContent(breadcrumbLabels.caseDetailsLabel);
    expect(breadcrumbLinks[2].getElement()).toHaveTextContent(breadcrumbLabels.uploadFilesAndFoldersLabel);
  });
  it('responds to cancel', () => {
    render(<Home />);

    const cancelButton = screen.getByText(commonLabels.cancelButton);

    const btn = wrapper(cancelButton);
    btn.click();
    expect(push).toHaveBeenCalledWith(`/case-detail?caseId=${CASE_ID}`);
  });

  it('responds to form submit', async () => {
    const page = render(<Home />);

    const selectFileInput = screen.getByTestId('file-select');
    expect(selectFileInput).toBeTruthy();
    const testFile = new File(['hello'], 'hello.world', { type: 'text/plain' });
    File.prototype.text = jest.fn().mockResolvedValueOnce('hello');
    await userEvent.upload(selectFileInput, [testFile]);

    const tagInput = screen.getByTestId('input-tag');
    const wrappedTag = wrapper(tagInput).findInput();
    if (!wrappedTag) {
      fail();
    }
    wrappedTag.setInputValue('tag');

    const detailsInput = screen.getByTestId('input-details');
    const wrappedDetails = wrapper(detailsInput).findTextarea();
    if (!wrappedDetails) {
      fail();
    }
    wrappedDetails.setTextareaValue('description');

    const reasonInput = screen.getByTestId('input-reason');
    const wrappedReason = wrapper(reasonInput).findInput();
    if (!wrappedReason) {
      fail();
    }
    wrappedReason.setInputValue('reason');

    const uploadButton = screen.getByText(commonLabels.uploadButton);
    const uploadButtonWrapper = wrapper(uploadButton);
    uploadButtonWrapper.click();

    // upload button will be disabled while in progress and then re-enabled when done
    await waitFor(() => expect(screen.queryByTestId('upload-file-submit')).toBeDisabled());
    await waitFor(() => expect(screen.queryByTestId('upload-file-submit')).toBeEnabled());
  });
});
