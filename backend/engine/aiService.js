function formatIndicatorValue(value, suffix = '') {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  return `${value.toFixed(2)}${suffix}`;
}

async function generateReasoning(signals, sector, sectorExposure, riskScore, finalScore, decision, geminiApiKey) {
  if (!geminiApiKey) {
    return {
      reason: "Gemini API key not configured.",
      next_action: "Evaluate manually based on signals."
    };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
  
  const exposureText = Number.isFinite(sectorExposure)
    ? `${sector} is ${sectorExposure.toFixed(2)}% of portfolio`
    : `${sector} exposure unavailable`;

  const prompt = [
    'You are an investment assistant. Based on:',
    '- technical indicators',
    '- portfolio exposure',
    '- risk score',
    '',
    `Technical indicators: Trend=${signals.trend}, RSI=${formatIndicatorValue(signals.rsi)}, Momentum=${formatIndicatorValue(signals.momentum, '%')}, Breakout=${signals.breakout === null ? 'n/a' : signals.breakout}`,
    `Portfolio exposure: ${exposureText}`,
    `Risk score: ${riskScore}/3`,
    `Final score and decision: ${finalScore} => ${decision}`,
    '',
    'Generate:',
    '- decision reasoning (max 2 lines)',
    '- next action (clear recommendation)',
    '',
    'Be concise and practical.',
    'Respond with raw JSON only: {"reason":"...","next_action":"..."}'
  ].join('\n');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const payload = await response.json();
    let text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    text = text.replace(/```json/gi, '').replace(/```/gi, '').trim();
    const result = JSON.parse(text);

    const reasonText = String(result.reason || 'Analysis complete.')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join('\n');

    return {
      reason: reasonText || 'Analysis complete.',
      next_action: String(result.next_action || 'Follow standard procedure.').trim()
    };
  } catch (error) {
    return {
      reason: "AI reasoning failed to generate.",
      next_action: "Review numerical scores manually."
    };
  }
}

module.exports = {
  generateReasoning
};
