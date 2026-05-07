import { render, screen } from '@testing-library/react';
import Navigation from '../../src/components/Navigation';

jest.mock('next/router', () => ({
  useRouter: jest.fn().mockReturnValue({
    push: jest.fn(),
    query: {},
  }),
}));

jest.mock('../../src/api/auth', () => ({
  useAvailableEndpoints: jest.fn().mockReturnValue({
    data: ['/cases/my-casesGET'],
    isLoading: false,
  }),
}));

describe('Navigation', () => {
  it('should render navigation with a default header', async () => {
    render(<Navigation />);

    const sideNavigation = await screen.findByTestId('sideNavigation');
    expect(sideNavigation).toBeTruthy();
    // https://github.com/testing-library/jest-dom#custom-matchers
  });

  it('should render a custom header', async () => {
    render(<Navigation />);

    const sideNavigation = await screen.findByTestId('sideNavigation');
    expect(sideNavigation).toBeTruthy();
    expect(sideNavigation).toHaveTextContent('Documentation');
  });
});
