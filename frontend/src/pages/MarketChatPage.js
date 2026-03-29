import React, { useMemo, useState } from 'react';
import Card from '../components/ui/Card';
import { usePortfolio } from '../context/PortfolioContext';

function formatTime(value) {
  if (!value) {
    return '--';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return date.toLocaleString();
}

function examplePrompts() {
  return [
    'Top 2 symbols to act on this week?',
    'What should I reduce to control risk now?',
    'Best risk-adjusted BUY candidate today?',
  ];
}

function summarizeProvider(response) {
  if (!response) {
    return 'No response yet';
  }

  const provider = String(response?.aiProvider || '').toLowerCase();
  if (provider === 'gemini') {
    return `Gemini${response?.model ? ` (${response.model})` : ''}`;
  }
  if (provider === 'rule_based_fallback') {
    return 'Local intelligence fallback';
  }
  return 'Portfolio intelligence engine';
}

function parseStructuredResponse(text) {
  const safe = String(text || '').trim();
  if (!safe) {
    return {
      primarySignal: 'No clear signal yet.',
      answer: 'No response yet.',
      why: [],
      action: [],
    };
  }

  const lines = safe.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let mode = 'answer';
  let primarySignal = '';
  let answer = '';
  const why = [];
  const action = [];

  lines.forEach((line) => {
    const lower = line.toLowerCase();
    if (lower.startsWith('primary signal:')) {
      mode = 'primary';
      primarySignal = line.replace(/^primary\s+signal:\s*/i, '').trim();
      return;
    }
    if (lower.startsWith('answer:')) {
      mode = 'answer';
      answer = line.replace(/^answer:\s*/i, '').trim();
      return;
    }
    if (lower === 'why:' || lower.startsWith('why:')) {
      mode = 'why';
      const tail = line.replace(/^why:\s*/i, '').trim();
      if (tail) {
        why.push(tail);
      }
      return;
    }
    if (lower === 'action:' || lower.startsWith('action:')) {
      mode = 'action';
      const tail = line.replace(/^action:\s*/i, '').trim();
      if (tail) {
        action.push(tail);
      }
      return;
    }

    const normalized = line.replace(/^[-*]\s*/, '').trim();
    if (!normalized) {
      return;
    }

    if (mode === 'why') {
      why.push(normalized);
    } else if (mode === 'action') {
      action.push(normalized);
    } else if (!answer) {
      answer = normalized;
    } else {
      why.push(normalized);
    }
  });

  return {
    primarySignal: primarySignal || 'No clear signal yet.',
    answer: answer || 'Current signals are mixed, so selective positioning is preferred.',
    why: why.slice(0, 3),
    action: action.slice(0, 3),
  };
}

function deriveDecisionFromText(text) {
  const safe = String(text || '').toUpperCase();
  if (safe.includes(' SELL')) return 'SELL';
  if (safe.includes(' BUY')) return 'BUY';
  return 'HOLD';
}

function deriveConfidenceFromText(text) {
  const matched = String(text || '').match(/(\d{1,3})\s*%/);
  if (!matched) {
    return null;
  }
  const parsed = Number(matched[1]);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
}

function buildDecisionIntel(response) {
  const provided = response?.decisionIntel;
  if (provided && typeof provided === 'object') {
    return provided;
  }

  return {
    overallDecision: deriveDecisionFromText(response?.answer),
    confidencePercent: deriveConfidenceFromText(response?.answer),
    keySignals: ['Portfolio-aware synthesis', 'Live market context'],
    portfolioRisk: {
      sectorExposurePercent: null,
      riskLevel: 'unknown',
    },
    riskLevel: 'Medium',
    nextBestAction: 'Wait for a confirmed setup before adding risk.',
    alternativeStrategy: 'Use smaller staggered entries until momentum confirms.',
    marketSentiment: 'Market sentiment unavailable.',
  };
}

function decisionToneClass(decision) {
  const upper = String(decision || '').toUpperCase();
  if (upper === 'BUY') return 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/25 dark:text-emerald-300';
  if (upper === 'SELL') return 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/25 dark:text-rose-300';
  return 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/25 dark:text-amber-300';
}

function riskToneClass(level) {
  const safe = String(level || '').toLowerCase();
  if (safe === 'high') return 'text-rose-700 dark:text-rose-300';
  if (safe === 'moderate' || safe === 'medium') return 'text-amber-700 dark:text-amber-300';
  if (safe === 'low') return 'text-emerald-700 dark:text-emerald-300';
  return 'text-[#9CA3AF]';
}

function MarketChatPage() {
  const { askMarketChat, getMarketChatSession, apiError, isAskingMarketChat } = usePortfolio();
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [sessionTurns, setSessionTurns] = useState([]);

  const promptIdeas = useMemo(() => examplePrompts(), []);
  const totalTurns = Math.max(0, Math.floor(sessionTurns.length / 2));

  const handleAsk = async (event) => {
    event.preventDefault();

    try {
      const result = await askMarketChat(question, null, sessionId);
      setResponse(result);
      if (result?.sessionId) {
        setSessionId(result.sessionId);
      }
      const normalizedQuestion = String(question || '').trim();
      if (normalizedQuestion) {
        setSessionTurns((prev) => ([
          ...prev,
          {
            role: 'user',
            content: normalizedQuestion,
            createdAt: new Date().toISOString(),
          },
          {
            role: 'assistant',
            content: String(result?.answer || '').trim(),
            decisionIntel: result?.decisionIntel || null,
            aiProvider: result?.aiProvider || '',
            model: result?.model || '',
            createdAt: result?.generatedAt || new Date().toISOString(),
          },
        ]));
      }
      setQuestion('');
    } catch (_error) {
      // Context already contains a user-friendly API error string.
    }
  };

  const handleLoadSession = async () => {
    try {
      const session = await getMarketChatSession(sessionId);
      const turns = Array.isArray(session?.turns) ? session.turns : [];

      const messages = [];
      turns.forEach((turn) => {
        messages.push({
          role: 'user',
          content: turn?.question || '',
          createdAt: turn?.createdAt || '',
        });
        messages.push({
          role: 'assistant',
          content: turn?.answer || '',
          decisionIntel: turn?.decisionIntel || null,
          aiProvider: turn?.aiProvider || '',
          model: turn?.model || '',
          createdAt: turn?.createdAt || '',
        });
      });

      setSessionTurns(messages);
      const latestTurn = turns.length ? turns[turns.length - 1] : null;
      if (latestTurn) {
        setResponse({
          answer: latestTurn?.answer || '',
          workflow: Array.isArray(latestTurn?.workflow) ? latestTurn.workflow : [],
          citations: Array.isArray(latestTurn?.citations) ? latestTurn.citations : [],
          aiProvider: latestTurn?.aiProvider || '',
          model: latestTurn?.model || '',
          aiErrorCode: latestTurn?.aiErrorCode || null,
          decisionIntel: latestTurn?.decisionIntel || null,
          generatedAt: latestTurn?.createdAt || '',
        });
      }
    } catch (_error) {
      // Context displays API error details.
    }
  };

  const handleNewSession = () => {
    setSessionId('');
    setSessionTurns([]);
    setResponse(null);
  };

  const decisionIntel = useMemo(() => buildDecisionIntel(response), [response]);

  return (
    <div className="space-y-5">
      <Card className="relative overflow-hidden p-0" interactive={false}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_8%,rgba(15,118,110,0.18),transparent_40%),radial-gradient(circle_at_88%_16%,rgba(30,64,175,0.14),transparent_38%)]" />
        <div className="relative border-b border-[#334155] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">AI Advisor</p>
              <h2 className="mt-1 text-xl font-bold text-[#F3F4F6]">Portfolio Decision Assistant</h2>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#9CA3AF]">{summarizeProvider(response)}</p>
              <p className="text-xs text-[#9CA3AF]">Turns: {totalTurns}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-10">
          <section className="lg:col-span-7 border-b border-[#334155] p-5 lg:border-b-0 lg:border-r">
            <form onSubmit={handleAsk} className="space-y-3">
              <div className="flex gap-2">
                <input
                  id="market-chat-question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask for a decision, risk adjustment, or symbol priority"
                  className="h-11 w-full rounded-xl border border-[#334155] bg-[#0B1220] px-3 text-sm text-[#E5E7EB] outline-none transition-all duration-200 focus:border-[#3B82F6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.18)]"
                />
                <button
                  type="submit"
                  disabled={isAskingMarketChat}
                  className="h-11 rounded-xl bg-[#3B82F6] px-4 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#2563EB] hover:shadow-lg disabled:opacity-65"
                >
                  {isAskingMarketChat ? 'Asking...' : 'Ask'}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {promptIdeas.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setQuestion(item)}
                    className="rounded-full border border-[#334155] bg-[#111827] px-3 py-1 text-xs font-medium text-[#CBD5E1] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#3B82F6] hover:text-[#E5E7EB]"
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  value={sessionId}
                  onChange={(event) => setSessionId(event.target.value)}
                  placeholder="Session ID"
                  className="h-9 w-52 rounded-lg border border-[#334155] bg-[#0B1220] px-3 text-xs text-[#E5E7EB] outline-none"
                />
                <button
                  type="button"
                  onClick={handleLoadSession}
                  disabled={!sessionId}
                  className="h-9 rounded-lg border border-[#334155] bg-[#111827] px-3 text-xs font-semibold text-[#CBD5E1] transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60"
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={handleNewSession}
                  className="h-9 rounded-lg border border-[#334155] bg-[#111827] px-3 text-xs font-semibold text-[#CBD5E1] transition-all duration-200 hover:-translate-y-0.5"
                >
                  New
                </button>
              </div>

              {apiError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
                  {apiError}
                </p>
              ) : null}
            </form>

            <div className="mt-5 space-y-4">
              {sessionTurns.length ? sessionTurns.map((turn, index) => {
                const structured = parseStructuredResponse(turn.content);
                const isAssistant = turn.role === 'assistant';
                return (
                  <article
                    key={`${turn.role}-${index}`}
                    className={`rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${isAssistant
                      ? 'border-emerald-500/30 bg-emerald-900/12'
                      : 'border-[#334155] bg-[#0F172A]'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">
                        {isAssistant ? 'AI Advisor' : 'You'}
                      </p>
                      <p className="text-xs text-[#9CA3AF]">{formatTime(turn.createdAt)}</p>
                    </div>

                    {isAssistant ? (
                      <div className="mt-3 space-y-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Primary Signal</p>
                          <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{structured.primarySignal}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Answer</p>
                          <p className="mt-1 text-sm font-semibold text-[#E5E7EB]">{structured.answer}</p>
                        </div>
                        {structured.why.length ? (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Why</p>
                            <ul className="mt-1 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                              {structured.why.map((item, whyIndex) => (
                                <li key={`why-${whyIndex}`} className="leading-6">• {item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {structured.action.length ? (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Action</p>
                            <ul className="mt-1 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                              {structured.action.map((item, actionIndex) => (
                                <li key={`action-${actionIndex}`} className="leading-6">• {item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#E5E7EB]">{turn.content}</p>
                    )}
                  </article>
                );
              }) : (
                <div className="rounded-2xl border border-dashed border-[#334155] bg-[#0F172A] p-8 text-center">
                  <p className="text-sm font-semibold text-[#E5E7EB]">Ask one focused question to get a direct portfolio decision.</p>
                </div>
              )}
            </div>
          </section>

          <aside className="lg:col-span-3 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Decision Intelligence</h3>

            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-[#334155] bg-[#0F172A] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[#9CA3AF]">Overall Decision</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${decisionToneClass(decisionIntel?.overallDecision)}`}>
                    {String(decisionIntel?.overallDecision || 'HOLD').toUpperCase()}
                  </span>
                  <span className="text-sm font-semibold text-[#F3F4F6]">
                    {decisionIntel?.confidencePercent === null || decisionIntel?.confidencePercent === undefined
                      ? 'N/A'
                      : `${decisionIntel.confidencePercent}%`}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-[#334155] bg-[#0F172A] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[#9CA3AF]">Key Signals</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(Array.isArray(decisionIntel?.keySignals) ? decisionIntel.keySignals : []).length
                    ? decisionIntel.keySignals.map((signal) => (
                      <span key={signal} className="rounded-full border border-[#334155] bg-[#111827] px-2.5 py-1 text-[11px] font-semibold text-[#CBD5E1]">
                        {signal}
                      </span>
                    ))
                    : <span className="text-xs text-[#9CA3AF]">No key signals yet.</span>}
                </div>
              </div>

              <div className="rounded-2xl border border-[#334155] bg-[#0F172A] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[#9CA3AF]">Portfolio Risk</p>
                <p className={`mt-2 text-sm font-semibold ${riskToneClass(decisionIntel?.portfolioRisk?.riskLevel)}`}>
                  Sector risk: {String(decisionIntel?.portfolioRisk?.riskLevel || 'unknown').toUpperCase()}
                </p>
                <p className="mt-1 text-xs text-[#9CA3AF]">
                  Max sector exposure: {decisionIntel?.portfolioRisk?.sectorExposurePercent === null || decisionIntel?.portfolioRisk?.sectorExposurePercent === undefined
                    ? 'N/A'
                    : `${Number(decisionIntel.portfolioRisk.sectorExposurePercent).toFixed(1)}%`}
                </p>
              </div>

              <div className="rounded-2xl border border-[#334155] bg-[#0F172A] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[#9CA3AF]">Next Best Action</p>
                <p className="mt-2 text-sm leading-6 text-[#E5E7EB]">{String(decisionIntel?.nextBestAction || 'No action recommendation yet.')}</p>
              </div>

              <div className="rounded-2xl border border-[#334155] bg-[#0F172A] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[#9CA3AF]">Risk Level</p>
                <p className={`mt-2 text-sm font-semibold ${riskToneClass(String(decisionIntel?.riskLevel || '').toLowerCase())}`}>
                  {String(decisionIntel?.riskLevel || 'Medium')}
                </p>
              </div>

              <div className="rounded-2xl border border-[#334155] bg-[#0F172A] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[#9CA3AF]">Alternative Strategy</p>
                <p className="mt-2 text-sm leading-6 text-[#E5E7EB]">{String(decisionIntel?.alternativeStrategy || 'No alternative strategy yet.')}</p>
              </div>

              <div className="rounded-2xl border border-[#334155] bg-[#0F172A] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[#9CA3AF]">Market Sentiment</p>
                <p className="mt-2 text-sm leading-6 text-[#E5E7EB]">
                  {String(decisionIntel?.marketSentiment || 'Market sentiment unavailable.')}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </Card>
    </div>
  );
}

export default MarketChatPage;
