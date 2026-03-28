function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function createRadarScheduler(options = {}) {
  const intervalMinutes = toPositiveInt(options.intervalMinutes, 720);
  const runTask = typeof options.runTask === 'function' ? options.runTask : null;

  let timer = null;
  let isRunning = false;
  let isExecuting = false;
  let runCount = 0;
  let lastError = null;
  let lastRunStartedAt = null;
  let lastRunFinishedAt = null;
  let lastRunSummary = null;

  async function execute(trigger = 'manual') {
    if (!runTask) {
      throw new Error('Scheduler task is not configured.');
    }

    if (isExecuting) {
      return {
        skipped: true,
        reason: 'A run is already in progress.',
      };
    }

    isExecuting = true;
    lastError = null;
    lastRunStartedAt = new Date().toISOString();

    try {
      const result = await runTask({ trigger });
      runCount += 1;
      lastRunSummary = {
        trigger,
        generatedAt: result?.generatedAt || new Date().toISOString(),
        alerts: Array.isArray(result?.alerts) ? result.alerts.length : 0,
        symbolsScanned: Number(result?.alphaEvidence?.totalSymbolsScanned || 0),
      };
      return {
        skipped: false,
        summary: lastRunSummary,
      };
    } catch (error) {
      lastError = String(error?.message || error || 'Unknown scheduler error');
      throw error;
    } finally {
      lastRunFinishedAt = new Date().toISOString();
      isExecuting = false;
    }
  }

  function start() {
    if (isRunning) {
      return false;
    }

    isRunning = true;
    timer = setInterval(() => {
      execute('scheduled').catch((error) => {
        // eslint-disable-next-line no-console
        console.error('[radar-scheduler] scheduled run failed:', error?.message || error);
      });
    }, intervalMinutes * 60 * 1000);

    return true;
  }

  function stop() {
    if (!isRunning) {
      return false;
    }

    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    isRunning = false;
    return true;
  }

  function status() {
    return {
      running: isRunning,
      intervalMinutes,
      isExecuting,
      runCount,
      lastError,
      lastRunStartedAt,
      lastRunFinishedAt,
      lastRunSummary,
    };
  }

  return {
    start,
    stop,
    status,
    execute,
  };
}

module.exports = {
  createRadarScheduler,
};
