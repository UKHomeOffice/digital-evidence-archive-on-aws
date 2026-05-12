import wrapper from '@cloudscape-design/components/test-utils/dom';
import '@testing-library/jest-dom';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Axios from 'axios';
import { commonLabels } from '../../src/common/labels';
import EditCasePage from '../../src/pages/edit-case';

afterEach(cleanup);

const push = jest.fn();
const CASE_ID = '100';
const CASE_NAME = 'mocked case';
jest.mock('next/router', () => ({
  useRouter: jest.fn().mockImplementation(() => ({
    query: { caseId: CASE_ID, caseName: CASE_NAME },
    push,
  })),
}));

jest.mock('axios');
const mockedAxios = Axios as jest.Mocked<typeof Axios>;

describe('EditCase page', () => {
  it('responds to cancel', async () => {
    const user = userEvent.setup();

    mockedAxios.create.mockReturnThis();
    mockedAxios.request.mockResolvedValue({
      data: {
        ulid: CASE_ID,
        name: CASE_NAME,
        status: 'ACTIVE',
      },
      status: 200,
      statusText: 'Ok',
      headers: {},
      config: {},
    });

    render(<EditCasePage />);

    const cancelButton = await screen.findByTestId('edit-case-cancel');
    await user.click(cancelButton);

    expect(push).toHaveBeenCalledWith(`/case-detail?caseId=${CASE_ID}`);
  });

  it('responds to save button click', async () => {
    mockedAxios.create.mockReturnThis();
    mockedAxios.request.mockResolvedValue({
      data: {
        ulid: CASE_ID,
        name: CASE_NAME,
        status: 'ACTIVE',
      },
      status: 200,
      statusText: 'Ok',
      headers: {},
      config: {},
    });

    const user = userEvent.setup();
    render(<EditCasePage />);

    const nameInput = await screen.findByTestId('input-name');
    const nameField = within(nameInput).getByRole('textbox');
    await user.clear(nameField);
    await user.type(nameField, 'a name');

    const descriptionInput = await screen.findByTestId('input-description');
    const descriptionField = within(descriptionInput).getByRole('textbox');
    await user.clear(descriptionField);
    await user.type(descriptionField, 'a description');

    const button = await screen.findByRole('button', { name: commonLabels.saveButton });
    await user.click(button);
    expect(push).toHaveBeenCalledWith(`/case-detail?caseId=${CASE_ID}`);
  });

  it('recovers from edition failure', async () => {
    const validationMessage = 'Case name is already in use';
    mockedAxios.create.mockReturnThis();
    mockedAxios.request.mockImplementation((eventObj) => {
      if (eventObj.method === 'PUT') {
        return Promise.reject({
          data: validationMessage,
          status: 400,
          statusText: '',
          headers: {},
          config: {},
        });
      }
      return Promise.resolve({
        data: {
          ulid: CASE_ID,
          name: CASE_NAME,
          status: 'ACTIVE',
        },
        status: 200,
        statusText: 'Ok',
        headers: {},
        config: {},
      });
    });

    const user = userEvent.setup();
    const page = render(<EditCasePage />);

    const nameInput = await screen.findByTestId('input-name');
    const nameField = within(nameInput).getByRole('textbox');
    await user.clear(nameField);
    await user.type(nameField, 'a name');

    const descriptionInput = await screen.findByTestId('input-description');
    const descriptionField = within(descriptionInput).getByRole('textbox');
    await user.clear(descriptionField);
    await user.type(descriptionField, 'a description');

    const button = await screen.findByRole('button', { name: commonLabels.saveButton });
    await user.click(button);

    // error notification is visible
    const notificationsWrapper = wrapper(page.container).findFlashbar()!;
    expect(notificationsWrapper).toBeTruthy();
  });
});
