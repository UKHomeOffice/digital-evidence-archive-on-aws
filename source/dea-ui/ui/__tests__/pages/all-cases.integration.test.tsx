import { fail } from 'assert';
import wrapper from '@cloudscape-design/components/test-utils/dom';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import axios from 'axios';
import { breadcrumbLabels, caseListLabels } from '../../src/common/labels';
import AllCasesPage from '../../src/pages/all-cases';

jest.mock('axios');
const mockedAxios = jest.mocked(axios);
const push = jest.fn();

jest.mock('next/router', () => ({
  useRouter: jest.fn().mockImplementation(() => ({
    query: {},
    push,
  })),
}));

describe('All Cases Dashboard', () => {
  it('renders a list of cases', async () => {
    mockedAxios.create.mockReturnThis();
    mockedAxios.request.mockImplementation((eventObj) => {
      if (eventObj.url?.includes('all-cases')) {
        return Promise.resolve({
          data: {
            cases: [
              {
                ulid: 'abc',
                name: 'mocked case',
                status: 'ACTIVE',
              },
              {
                ulid: 'def',
                name: 'case2',
                status: 'ACTIVE',
              },
            ],
          },
          status: 200,
          statusText: 'Ok',
          headers: {},
          config: {},
        });
      } else {
        //availableEndpoints
        return Promise.resolve({
          data: {
            endpoints: ['/cases/all-casesGET', '/cases/my-casesGET'],
          },
          status: 200,
          statusText: 'Ok',
          headers: {},
          config: {},
        });
      }
    });

    const view = render(<AllCasesPage />);
    const pagewrapper = wrapper(view.baseElement);

    await screen.findByTestId('sideNavigation');
    const sideNav = pagewrapper.findSideNavigation();
    expect(sideNav).toBeDefined();
    if (!sideNav) {
      return;
    }

    // it has both my cases and all cases links
    const myCasesLink = sideNav.findLinkByHref('/');
    expect(myCasesLink).toBeDefined();
    const allCasesLink = sideNav.findLinkByHref('/all-cases');
    expect(allCasesLink).toBeDefined();

    const createCaseButton = screen.queryByText(caseListLabels.createNewCaseLabel);
    expect(createCaseButton).toBeNull();

    // assert breadcrumb
    const breadcrumbWrapper = wrapper(view.container).findBreadcrumbGroup();
    expect(breadcrumbWrapper).toBeTruthy();
    const breadcrumbLinks = breadcrumbWrapper?.findBreadcrumbLinks();
    if (!breadcrumbLinks) {
      fail('breadcrumbLinks is undefined');
    } else {
      expect(breadcrumbLinks.length).toEqual(1);
      expect(breadcrumbLinks[0].getElement()).toHaveTextContent(breadcrumbLabels.homePageLabel);
    }
  });

  it('navigates to manage case details', async () => {
    mockedAxios.create.mockReturnThis();
    mockedAxios.request.mockResolvedValue({
      data: {
        cases: [
          {
            ulid: 'abc',
            name: 'mocked case',
            status: 'ACTIVE',
          },
        ],
      },
      status: 200,
      statusText: 'Ok',
      headers: {},
      config: {},
    });
    render(<AllCasesPage />);

    const table = await screen.findByTestId('case-table');
    const link = wrapper(table).findLink();

    if (!link) {
      fail();
    }
    link.click();

    expect(push).toHaveBeenCalledWith('/manage-case?caseId=abc');
  });
});
