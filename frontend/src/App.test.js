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
  window.history.pushState({}, '', '/');
  render(<App />);
  expect(screen.getByText(/arthasanket/i)).toBeInTheDocument();
});

test('renders opportunity radar route content', async () => {
  window.history.pushState({}, '', '/opportunity-radar');
  render(<App />);
  expect(
    await screen.findByText(/autonomous workflow with saved daily runs and source-cited alerts/i)
  ).toBeInTheDocument();
});
