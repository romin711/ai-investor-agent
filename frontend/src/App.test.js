import { render, screen } from '@testing-library/react';

import App from './App';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: () => Promise.resolve({ data: {} }),
    post: () => Promise.resolve({ data: {} }),
  },
}));

test('renders dashboard heading', () => {
  render(<App />);
  expect(screen.getByText(/ai investor dashboard/i)).toBeInTheDocument();
});
