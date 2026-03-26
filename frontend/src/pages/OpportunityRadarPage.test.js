import { fireEvent, render, screen } from '@testing-library/react';
import OpportunityRadarPage from './OpportunityRadarPage';

jest.mock('../context/PortfolioContext', () => ({
  usePortfolio: jest.fn(),
}));

const { usePortfolio } = require('../context/PortfolioContext');

function buildMockPortfolioContext() {
  return {
    opportunityRadarData: {
      workflow: ['detect_signal', 'enrich_with_portfolio_context', 'generate_actionable_alert'],
      alerts: [
        {
          symbol: 'TCS',
          action: 'HOLD',
          signalType: 'oversold-reversal-watch',
          explanation: 'TCS signal explanation',
          priorityScore: 30,
          signalStrength: 25,
          confidence: 35,
          backtestedSuccessRate: null,
          riskFlags: ['oversold'],
          contextSignals: [
            {
              type: 'quarterly_result',
              impact: 'positive',
              title: 'TCS result',
              source: 'ET Markets',
              credibilityTier: 'news',
              ageDays: 4,
            },
          ],
          sources: ['Yahoo Finance'],
        },
        {
          symbol: 'ICICIBANK',
          action: 'BUY',
          signalType: 'breakout',
          explanation: 'ICICI signal explanation',
          priorityScore: 60,
          signalStrength: 50,
          confidence: 70,
          backtestedSuccessRate: 68,
          riskFlags: ['overbought'],
          contextSignals: [
            {
              type: 'regulatory_approval',
              impact: 'positive',
              title: 'RBI approval',
              source: 'RBI Official',
              credibilityTier: 'regulatory',
              ageDays: 2,
            },
          ],
          sources: ['Yahoo Finance'],
        },
      ],
    },
    opportunityRadarHistory: [
      {
        generatedAt: '2026-03-25T10:00:00.000Z',
        portfolioInsight: 'Run one',
        portfolioRows: [{ symbol: 'TCS', weight: 50 }],
        alerts: [
          { priorityScore: 10 },
          { priorityScore: 20 },
        ],
      },
      {
        generatedAt: '2026-03-24T10:00:00.000Z',
        portfolioInsight: 'Run two',
        portfolioRows: [{ symbol: 'ICICIBANK', weight: 50 }],
        alerts: [
          { priorityScore: 90 },
          { priorityScore: 70 },
        ],
      },
    ],
    fetchOpportunityRadarHistory: jest.fn(),
    runOpportunityRadar: jest.fn(),
    isRunningOpportunityRadar: false,
    apiError: '',
  };
}

describe('OpportunityRadarPage', () => {
  beforeEach(() => {
    usePortfolio.mockReturnValue(buildMockPortfolioContext());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('filters latest alerts by action', () => {
    render(<OpportunityRadarPage />);

    expect(screen.getByText(/TCS: HOLD/i)).toBeInTheDocument();
    expect(screen.getByText(/ICICIBANK: BUY/i)).toBeInTheDocument();

    const selects = screen.getAllByRole('combobox');
    const actionSelect = selects[0];
    fireEvent.change(actionSelect, { target: { value: 'BUY' } });

    expect(screen.queryByText(/TCS: HOLD/i)).not.toBeInTheDocument();
    expect(screen.getByText(/ICICIBANK: BUY/i)).toBeInTheDocument();
  });

  test('filters latest alerts by credibility tier', () => {
    render(<OpportunityRadarPage />);

    const selects = screen.getAllByRole('combobox');
    const tierSelect = selects[2];
    fireEvent.change(tierSelect, { target: { value: 'REGULATORY' } });

    expect(screen.queryByText(/TCS: HOLD/i)).not.toBeInTheDocument();
    expect(screen.getByText(/ICICIBANK: BUY/i)).toBeInTheDocument();
  });

  test('sorts history by highest average priority', () => {
    render(<OpportunityRadarPage />);

    const selects = screen.getAllByRole('combobox');
    const historySortSelect = selects[4];
    fireEvent.change(historySortSelect, { target: { value: 'highest-priority' } });

    const summaryRows = screen.getAllByText(/Avg Priority:/i);
    expect(summaryRows.length).toBeGreaterThan(1);
    expect(summaryRows[0]).toHaveTextContent('Avg Priority: 80.00');
  });
});
