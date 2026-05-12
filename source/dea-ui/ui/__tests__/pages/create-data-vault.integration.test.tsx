import wrapper from '@cloudscape-design/components/test-utils/dom';
import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Axios, { AxiosError } from 'axios';
import { breadcrumbLabels, commonLabels, createDataVaultLabels } from '../../src/common/labels';
import { NotificationsProvider } from '../../src/context/NotificationsContext';
import Home from '../../src/pages/create-data-vaults';

afterEach(cleanup);

beforeEach(() => {
  jest.clearAllMocks();
});

const push = jest.fn();

jest.mock('next/router', () => ({
  useRouter: jest.fn().mockImplementation(() => ({
    query: {},
    push,
  })),
}));

jest.mock('axios');
const mockedAxios = Axios as jest.Mocked<typeof Axios>;

describe('CreateDataVaults page', () => {
  it('responds to cancel', async () => {
    const user = userEvent.setup();

    render(<Home />);

    const cancelButton = screen.getByTestId('create-data-vault-cancel');

    await user.click(cancelButton);
    expect(push).toHaveBeenCalledWith('/data-vaults');
  });

  it('responds to form submit', async () => {
    const user = userEvent.setup();

    mockedAxios.create.mockReturnThis();
    mockedAxios.request.mockResolvedValue({
      data: {
        ulid: 'abc',
        name: 'mocked data vault',
        description: 'some description',
      },
      status: 200,
      statusText: 'Ok',
      headers: {},
      config: {},
    });

    render(<Home />);

    const nameField = within(screen.getByTestId('input-name')).getByRole('textbox');
    await user.clear(nameField);
    await user.type(nameField, 'a name');

    const descriptionField = within(screen.getByTestId('input-description')).getByRole('textbox');
    await user.clear(descriptionField);
    await user.type(descriptionField, 'a description');

    await user.click(screen.getByTestId('create-data-vault-submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/data-vault-detail?dataVaultId=abc'));
  });

  it('responds to create button click', async () => {
    mockedAxios.create.mockReturnThis();
    mockedAxios.request.mockResolvedValue({
      data: {
        ulid: 'abc',
        name: 'mocked data vault',
        description: 'some description',
      },
      status: 200,
      statusText: 'Ok',
      headers: {},
      config: {},
    });

    const user = userEvent.setup();
    render(<Home />);

    const nameField = within(screen.getByTestId('input-name')).getByRole('textbox');
    await user.clear(nameField);
    await user.type(nameField, 'a name');

    const descriptionField = within(screen.getByTestId('input-description')).getByRole('textbox');
    await user.clear(descriptionField);
    await user.type(descriptionField, 'a description');

    const button = screen.getByRole('button', { name: commonLabels.createButton });
    await user.click(button);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/data-vault-detail?dataVaultId=abc'));
  });

  it('recovers from creation failure', async () => {
    const dataVaultName = 'mocked data vault';
    const validationMessage = `Data vault with name "${dataVaultName}" is already in use`;
    mockedAxios.create.mockReturnThis();
    mockedAxios.request.mockRejectedValue(
      Object.assign(new AxiosError(validationMessage), {
        response: {
          data: validationMessage,
          status: 400,
          statusText: '',
          headers: {},
          config: {},
        },
      })
    );

    const user = userEvent.setup();
    const page = render(
      <NotificationsProvider>
        <Home />
      </NotificationsProvider>
    );
    const headerWrapper = wrapper(page.container).findHeader();
    expect(page).toBeTruthy();
    expect(headerWrapper).toBeTruthy();
    expect(headerWrapper?.findHeadingText().getElement()).toHaveTextContent(
      createDataVaultLabels.createNewDataVaultLabel
    );

    // assert breadcrumb
    const breadcrumbWrapper = wrapper(page.container).findBreadcrumbGroup();
    expect(breadcrumbWrapper).toBeTruthy();
    const breadcrumbLinks = breadcrumbWrapper?.findBreadcrumbLinks()!;
    expect(breadcrumbLinks.length).toEqual(2);
    expect(breadcrumbLinks[0].getElement()).toHaveTextContent(breadcrumbLabels.dataVaultsLabel);
    expect(breadcrumbLinks[1].getElement()).toHaveTextContent(breadcrumbLabels.createNewDataVaultLabel);

    const nameField = within(screen.getByTestId('input-name')).getByRole('textbox');
    await user.clear(nameField);
    await user.type(nameField, dataVaultName);

    const button = screen.getByRole('button', { name: commonLabels.createButton });
    await user.click(button);

    // error notification is visible
    const notificationsWrapper = wrapper(page.container).findFlashbar()!;
    expect(notificationsWrapper).toBeTruthy();
    await waitFor(() => expect(push).not.toHaveBeenCalled());
    await waitFor(() => expect(notificationsWrapper.findItems().length).toBeGreaterThan(0));
  });
});
