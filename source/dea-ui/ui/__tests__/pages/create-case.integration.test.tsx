import wrapper from '@cloudscape-design/components/test-utils/dom';
import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Axios, { AxiosError } from 'axios';
import { breadcrumbLabels, commonLabels, createCaseLabels } from '../../src/common/labels';
import { NotificationsProvider } from '../../src/context/NotificationsContext';
import Home from '../../src/pages/create-cases';

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

describe('CreateCases page', () => {
  it('responds to cancel', async () => {
    const user = userEvent.setup();

    render(<Home />);

    const cancelButton = screen.getByTestId('create-case-cancel');

    await user.click(cancelButton);
    expect(push).toHaveBeenCalledWith('/');
  });

  it('responds to form submit', async () => {
    const user = userEvent.setup();

    mockedAxios.create.mockReturnThis();
    mockedAxios.request.mockResolvedValue({
      data: {
        ulid: 'abc',
        name: 'mocked case',
        status: 'ACTIVE',
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

    await user.click(screen.getByTestId('create-case-submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/case-detail?caseId=abc'));
  });

  it('responds to create button click', async () => {
    mockedAxios.create.mockReturnThis();
    mockedAxios.request.mockResolvedValue({
      data: {
        ulid: 'abc',
        name: 'mocked case',
        status: 'ACTIVE',
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
    await waitFor(() => expect(push).toHaveBeenCalledWith('/case-detail?caseId=abc'));
  });

  it('recovers from creation failure', async () => {
    const caseName = 'mocked case';
    const validationMessage = `Case with name "${caseName}" is already in use`;
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
      createCaseLabels.createNewCaseLabel
    );

    // assert breadcrumb
    const breadcrumbWrapper = wrapper(page.container).findBreadcrumbGroup();
    expect(breadcrumbWrapper).toBeTruthy();
    const breadcrumbLinks = breadcrumbWrapper?.findBreadcrumbLinks()!;
    expect(breadcrumbLinks.length).toEqual(2);
    expect(breadcrumbLinks[0].getElement()).toHaveTextContent(breadcrumbLabels.homePageLabel);
    expect(breadcrumbLinks[1].getElement()).toHaveTextContent(breadcrumbLabels.createNewCaseLabel);

    const nameField = within(screen.getByTestId('input-name')).getByRole('textbox');
    await user.clear(nameField);
    await user.type(nameField, caseName);

    const button = screen.getByRole('button', { name: commonLabels.createButton });
    await user.click(button);

    // error notification is visible
    const notificationsWrapper = wrapper(page.container).findFlashbar()!;
    expect(notificationsWrapper).toBeTruthy();
    await waitFor(() => expect(push).not.toHaveBeenCalled());
    await waitFor(() => expect(notificationsWrapper.findItems().length).toBeGreaterThan(0));
  });
});
