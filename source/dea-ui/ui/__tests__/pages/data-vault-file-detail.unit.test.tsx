import wrapper from '@cloudscape-design/components/test-utils/dom';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAvailableEndpoints } from '../../src/api/auth';
import {
  removeDataVaultFileCaseAssociation,
  useGetDataVaultFileDetailsById,
} from '../../src/api/data-vaults';
import { commonLabels } from '../../src/common/labels';
import DataVaultFileDetailsBody, {
  DELETE_DATA_VAULT_FILE_CASE_ASSOCIATION_PATH,
} from '../../src/components/data-vault-file-details/DataVaultFileDetailsBody';
import DataVaultFileDetailPage from '../../src/pages/data-vault-file-detail';

const mockedSetFileName = jest.fn();
let query: { dataVaultId: any; fileId: any; setFileName: any; dataVaultName: any } = {
  dataVaultId: '100',
  fileId: '200',
  setFileName: mockedSetFileName,
  dataVaultName: 'mocked data vault',
};
jest.mock('next/router', () => ({
  useRouter: jest.fn().mockImplementation(() => ({
    query,
    push: jest.fn(),
  })),
}));

jest.mock('../../src/api/data-vaults', () => ({
  removeDataVaultFileCaseAssociation: jest.fn(),
  useGetDataVaultFileDetailsById: jest.fn(),
}));

jest.mock('../../src/api/auth', () => ({
  useAvailableEndpoints: jest.fn(),
}));

const mockUseGetDataVaultFileDetailsById = jest.mocked(useGetDataVaultFileDetailsById);
const mockRemoveDataVaultFileCaseAssociation = jest.mocked(removeDataVaultFileCaseAssociation);
const mockUseAvailableEndpoints = jest.mocked(useAvailableEndpoints);

const dataVaultFile = {
  ulid: '01HD2SGVHV8DEAZQP5ZEEZ6F81',
  fileName: 'README.md',
  filePath: '/joi-17.9.1/',
  dataVaultUlid: '01HD2S8KR23WJNNFGSBZEEGGA5',
  isFile: true,
  fileSizeBytes: 458,
  createdBy: 'John Doe',
  contentType: 'md',
  sha256Hash: 'SHA256:52773d75ca79b81253ad1409880ab061d66f0e5bbcc1e820b008e7617c78d745',
  versionId: 'ss6KHy3J4ErNEGgFn0kTEq5caL11bYqU',
  fileS3Key: 'DATAVAULT01HD2S8KR23WJNNFGSBZEEGGA5/destination/joi-17.9.1/README.md',
  executionId: 'exec-07a3f261f2f985d5f',
  updated: new Date('2023-10-19T01:41:39.515Z'),
  updatedBy: 'John Doe',
  caseCount: 1,
  cases: [{ ulid: '01HD2SGVHV8DEAZQP5ZEEZ6F81', name: 'Boodycam footage' }],
};

describe('CaseDetailsPage', () => {
  beforeEach(() => {
    query = {
      dataVaultId: '100',
      fileId: '200',
      setFileName: mockedSetFileName,
      dataVaultName: 'mocked data vault',
    };
    mockRemoveDataVaultFileCaseAssociation.mockResolvedValue(undefined);
  });

  it('renders a data vault file details page', async () => {
    mockUseGetDataVaultFileDetailsById.mockImplementation(() => ({
      data: dataVaultFile,
      isLoading: false,
      mutate: jest.fn(),
    }));
    mockUseAvailableEndpoints.mockImplementation(() => ({
      data: [DELETE_DATA_VAULT_FILE_CASE_ASSOCIATION_PATH],
      isLoading: false,
    }));
    const page = render(<DataVaultFileDetailPage />);
    const pageWrapper = wrapper(page.baseElement);
    expect(page).toBeTruthy();

    const mockedFileText = await screen.findAllByText(dataVaultFile.fileName);
    expect(mockedFileText.length).toEqual(2); // Header and breadcrumb
    expect(mockedFileText).toBeTruthy();

    const disassociateButton = screen.queryByTestId('disassociate-data-vault-file-button');
    await waitFor(() => expect(disassociateButton).toBeEnabled());
    fireEvent.click(disassociateButton!);

    const cancelCaseAsssociationButton = screen.queryByTestId('cancel-case-disassociation');
    expect(cancelCaseAsssociationButton).toBeTruthy();
    fireEvent.click(cancelCaseAsssociationButton!);

    fireEvent.click(disassociateButton!);

    const checkboxWrapper = pageWrapper.findCheckbox();
    expect(checkboxWrapper).toBeTruthy();
    fireEvent.click(checkboxWrapper!.findNativeInput().getElement());

    const confirmCaseDisasssociationButton = screen.queryByTestId('submit-case-disassociation');
    expect(confirmCaseDisasssociationButton).toBeTruthy();
    fireEvent.click(confirmCaseDisasssociationButton!);
    await waitFor(() => expect(mockRemoveDataVaultFileCaseAssociation).toHaveBeenCalled());

    // success notification is visible
    const notificationsWrapper = wrapper(page.container).findFlashbar()!;
    expect(notificationsWrapper).toBeTruthy();
  });

  it('renders a blank page with no dataVaultId', async () => {
    mockUseGetDataVaultFileDetailsById.mockImplementation(() => ({
      data: undefined,
      isLoading: false,
      mutate: jest.fn(),
    }));
    render(<DataVaultFileDetailPage />);
    await screen.findByText(commonLabels.notFoundLabel);
  });

  it('renders a loading label during fetch', () => {
    mockUseGetDataVaultFileDetailsById.mockImplementation(() => ({
      data: undefined,
      isLoading: true,
      mutate: jest.fn(),
    }));
    render(<DataVaultFileDetailPage />);
    screen.findByText(commonLabels.loadingLabel);
  });

  it('disables submit when a previously selected case is no longer in the current cases list', async () => {
    const mutate = jest.fn();
    let currentData = dataVaultFile;

    mockUseGetDataVaultFileDetailsById.mockImplementation(() => ({
      data: currentData,
      isLoading: false,
      mutate,
    }));
    mockUseAvailableEndpoints.mockImplementation(() => ({
      data: [DELETE_DATA_VAULT_FILE_CASE_ASSOCIATION_PATH],
      isLoading: false,
    }));

    const view = render(
      <DataVaultFileDetailsBody dataVaultId="100" fileId="200" setFileName={mockedSetFileName} />
    );

    fireEvent.click(await screen.findByTestId('disassociate-data-vault-file-button'));
    fireEvent.click(wrapper(view.baseElement).findCheckbox()!.findNativeInput().getElement());

    await waitFor(() => expect(screen.getByTestId('submit-case-disassociation')).toBeEnabled());

    currentData = {
      ...dataVaultFile,
      caseCount: 1,
      cases: [{ ulid: '01OTHERCASEULID', name: 'Another case' }],
    };

    view.rerender(
      <DataVaultFileDetailsBody dataVaultId="100" fileId="200" setFileName={mockedSetFileName} />
    );

    await waitFor(() => expect(screen.getByTestId('submit-case-disassociation')).toBeDisabled());
  });

  it('disables submit when the current cases list becomes empty after a case was selected', async () => {
    const mutate = jest.fn();
    let currentData = dataVaultFile;

    mockUseGetDataVaultFileDetailsById.mockImplementation(() => ({
      data: currentData,
      isLoading: false,
      mutate,
    }));
    mockUseAvailableEndpoints.mockImplementation(() => ({
      data: [DELETE_DATA_VAULT_FILE_CASE_ASSOCIATION_PATH],
      isLoading: false,
    }));

    const view = render(
      <DataVaultFileDetailsBody dataVaultId="100" fileId="200" setFileName={mockedSetFileName} />
    );

    fireEvent.click(await screen.findByTestId('disassociate-data-vault-file-button'));
    fireEvent.click(wrapper(view.baseElement).findCheckbox()!.findNativeInput().getElement());

    await waitFor(() => expect(screen.getByTestId('submit-case-disassociation')).toBeEnabled());
    expect(screen.getAllByText('Boodycam footage').length).toBeGreaterThan(0);

    currentData = {
      ...dataVaultFile,
      caseCount: 0,
      cases: [],
    };

    view.rerender(
      <DataVaultFileDetailsBody dataVaultId="100" fileId="200" setFileName={mockedSetFileName} />
    );

    await waitFor(() => expect(screen.getByTestId('submit-case-disassociation')).toBeDisabled());
    await waitFor(() => expect(screen.queryByText('Boodycam footage')).not.toBeInTheDocument());
  });

  it('renders a not found warning if no dataVaultId is provided', () => {
    query = {
      dataVaultId: undefined,
      fileId: '200',
      setFileName: mockedSetFileName,
      dataVaultName: 'mocked data vault',
    };
    render(<DataVaultFileDetailPage />);
    screen.findByText(commonLabels.notFoundLabel);
  });

  it('renders a not found warning if no fileId is provided', () => {
    query = {
      dataVaultId: '100',
      fileId: undefined,
      setFileName: mockedSetFileName,
      dataVaultName: 'mocked data vault',
    };
    render(<DataVaultFileDetailPage />);
    screen.findByText(commonLabels.notFoundLabel);
  });

  it('renders a not found warning if dataVaultId is not a string', () => {
    query = {
      dataVaultId: {},
      fileId: '200',
      setFileName: mockedSetFileName,
      dataVaultName: 'mocked data vault',
    };
    render(<DataVaultFileDetailPage />);
    screen.findByText(commonLabels.notFoundLabel);
  });

  it('renders a not found warning if fileId is not a string', () => {
    query = {
      dataVaultId: '100',
      fileId: {},
      setFileName: mockedSetFileName,
      dataVaultName: 'mocked data vault',
    };
    render(<DataVaultFileDetailPage />);
    screen.findByText(commonLabels.notFoundLabel);
  });
});
