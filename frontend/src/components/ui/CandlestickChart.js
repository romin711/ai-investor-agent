import React, { useEffect, useMemo, useRef } from 'react';
import {
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts';

const priceFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function padTimePart(value) {
  return String(value).padStart(2, '0');
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeTime(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    return value.length >= 10 ? value.slice(0, 10) : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString().slice(0, 10);
  }

  if (typeof value === 'object' && value.year && value.month && value.day) {
    return `${value.year}-${padTimePart(value.month)}-${padTimePart(value.day)}`;
  }

  return null;
}

function formatPrice(value) {
  const numeric = toFiniteNumber(value);
  return numeric === null ? '--' : priceFormatter.format(numeric);
}

function formatCompactNumber(value) {
  const numeric = toFiniteNumber(value);
  return numeric === null ? '--' : compactNumberFormatter.format(numeric);
}

function formatDisplayDate(time) {
  const normalized = normalizeTime(time);
  if (!normalized) {
    return '--';
  }

  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? normalized
    : date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
}

function sanitizeCandles(data) {
  if (!Array.isArray(data)) {
    return [];
  }

  const sortedCandles = data
    .map((point) => {
      const time = normalizeTime(point?.time || point?.date);
      const open = toFiniteNumber(point?.open);
      const high = toFiniteNumber(point?.high);
      const low = toFiniteNumber(point?.low);
      const close = toFiniteNumber(point?.close);
      const volume = toFiniteNumber(point?.volume);

      if (!time || open === null || high === null || low === null || close === null) {
        return null;
      }

      return {
        time,
        open,
        high,
        low,
        close,
        volume,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.time.localeCompare(right.time));

  return sortedCandles.reduce((uniqueCandles, candle) => {
    const previous = uniqueCandles[uniqueCandles.length - 1];

    if (!previous || previous.time !== candle.time) {
      uniqueCandles.push(candle);
      return uniqueCandles;
    }

    uniqueCandles[uniqueCandles.length - 1] = {
      time: candle.time,
      open: previous.open,
      high: Math.max(previous.high, candle.high),
      low: Math.min(previous.low, candle.low),
      close: candle.close,
      volume: candle.volume ?? previous.volume ?? null,
    };

    return uniqueCandles;
  }, []);
}

function buildMovingAverageSeries(candles, period) {
  if (!candles.length || period <= 1) {
    return [];
  }

  let rollingSum = 0;

  return candles.map((candle, index) => {
    rollingSum += candle.close;

    if (index >= period) {
      rollingSum -= candles[index - period].close;
    }

    return {
      time: candle.time,
      value: index >= period - 1 ? Number((rollingSum / period).toFixed(4)) : null,
    };
  });
}

function toLineSeriesData(points) {
  return points.map((point) => (
    point.value === null
      ? { time: point.time }
      : { time: point.time, value: point.value }
  ));
}

function buildVolumeSeries(candles) {
  return candles.map((candle) => {
    if (candle.volume === null || candle.volume < 0) {
      return { time: candle.time };
    }

    return {
      time: candle.time,
      value: candle.volume,
      color: candle.close >= candle.open ? 'rgba(34, 197, 94, 0.58)' : 'rgba(239, 68, 68, 0.58)',
    };
  });
}

function buildDecisionMarkers(candles, meta) {
  if (!candles.length || !meta) {
    return [];
  }

  const decision = String(meta?.decision || '').toUpperCase();
  const confidence = toFiniteNumber(meta?.confidence);
  const breakout = meta?.breakout === true;

  if (!decision) {
    return [];
  }

  const latestCandle = candles[candles.length - 1];

  if (decision === 'BUY' || decision === 'SELL') {
    const isBuy = decision === 'BUY';
    const confidenceSuffix = confidence !== null ? ` ${confidence}%` : '';
    return [{
      time: latestCandle.time,
      position: isBuy ? 'belowBar' : 'aboveBar',
      shape: isBuy ? 'arrowUp' : 'arrowDown',
      color: isBuy ? '#22C55E' : '#EF4444',
      text: `${decision}${confidenceSuffix}`,
      size: 2,
    }];
  }

  return [{
    time: latestCandle.time,
    position: 'aboveBar',
    shape: 'circle',
    color: breakout ? '#38BDF8' : '#F59E0B',
    text: breakout ? 'HOLD | Breakout watch' : 'HOLD | Monitor',
    size: 1,
  }];
}

function CandlestickChart({ data, meta, height = 448, showSignals = false }) {
  const containerRef = useRef(null);
  const initialHeightRef = useRef(height);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const ma20SeriesRef = useRef(null);
  const ma50SeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const markersRef = useRef(null);
  const candlesRef = useRef([]);
  const metaRef = useRef(meta || null);
  const candleMapRef = useRef(new Map());
  const ma20MapRef = useRef(new Map());
  const ma50MapRef = useRef(new Map());
  const legendSymbolRef = useRef(null);
  const legendDateRef = useRef(null);
  const legendMa20Ref = useRef(null);
  const legendMa50Ref = useRef(null);
  const legendOpenRef = useRef(null);
  const legendHighRef = useRef(null);
  const legendLowRef = useRef(null);
  const legendCloseRef = useRef(null);
  const tooltipRef = useRef(null);
  const tooltipDateRef = useRef(null);
  const tooltipOpenRef = useRef(null);
  const tooltipHighRef = useRef(null);
  const tooltipLowRef = useRef(null);
  const tooltipCloseRef = useRef(null);
  const tooltipVolumeRef = useRef(null);
  const tooltipSignalRef = useRef(null);
  const updatePanelsRef = useRef(() => {});

  const candles = useMemo(() => sanitizeCandles(data), [data]);
  const ma20Data = useMemo(() => buildMovingAverageSeries(candles, 20), [candles]);
  const ma50Data = useMemo(() => buildMovingAverageSeries(candles, 50), [candles]);
  const volumeData = useMemo(() => buildVolumeSeries(candles), [candles]);
  const markerData = useMemo(
    () => (showSignals ? buildDecisionMarkers(candles, meta) : []),
    [candles, meta, showSignals]
  );

  const hasEnoughData = candles.length >= 2;

  function setText(ref, value) {
    if (ref.current) {
      ref.current.textContent = value;
    }
  }

  updatePanelsRef.current = (timeKey, showTooltip) => {
    const activeTime = timeKey && candleMapRef.current.has(timeKey)
      ? timeKey
      : candlesRef.current[candlesRef.current.length - 1]?.time || null;

    const candle = activeTime ? candleMapRef.current.get(activeTime) : null;
    const ma20Point = activeTime ? ma20MapRef.current.get(activeTime) : null;
    const ma50Point = activeTime ? ma50MapRef.current.get(activeTime) : null;
    const decision = String(metaRef.current?.decision || '').toUpperCase();
    const confidence = toFiniteNumber(metaRef.current?.confidence);
    const breakout = metaRef.current?.breakout === true;

    setText(legendSymbolRef, metaRef.current?.symbol || 'Price Action');
    setText(legendDateRef, formatDisplayDate(activeTime));
    setText(legendMa20Ref, `MA20 ${formatPrice(ma20Point?.value ?? null)}`);
    setText(legendMa50Ref, `MA50 ${formatPrice(ma50Point?.value ?? null)}`);
    setText(legendOpenRef, formatPrice(candle?.open));
    setText(legendHighRef, formatPrice(candle?.high));
    setText(legendLowRef, formatPrice(candle?.low));
    setText(legendCloseRef, formatPrice(candle?.close));

    setText(tooltipDateRef, formatDisplayDate(activeTime));
    setText(tooltipOpenRef, formatPrice(candle?.open));
    setText(tooltipHighRef, formatPrice(candle?.high));
    setText(tooltipLowRef, formatPrice(candle?.low));
    setText(tooltipCloseRef, formatPrice(candle?.close));
    setText(tooltipVolumeRef, formatCompactNumber(candle?.volume));

    if (!showSignals) {
      setText(tooltipSignalRef, 'Signals hidden');
    } else if (decision && decision !== 'HOLD' && confidence !== null) {
      const breakoutText = breakout ? ' | Breakout' : '';
      setText(tooltipSignalRef, `${decision} ${confidence}%${breakoutText}`);
    } else if (breakout) {
      setText(tooltipSignalRef, 'Breakout');
    } else {
      setText(tooltipSignalRef, 'Monitoring');
    }

    if (tooltipRef.current) {
      tooltipRef.current.style.opacity = showTooltip && candle ? '1' : '0';
      tooltipRef.current.style.transform = showTooltip && candle ? 'translateY(0px)' : 'translateY(-4px)';
    }
  };

  useEffect(() => {
    if (!containerRef.current || chartRef.current) {
      return undefined;
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: initialHeightRef.current,
      layout: {
        background: { color: '#111827' },
        textColor: '#9CA3AF',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(156, 163, 175, 0.45)',
          labelBackgroundColor: '#1F2937',
        },
        horzLine: {
          color: 'rgba(156, 163, 175, 0.35)',
          labelBackgroundColor: '#1F2937',
        },
      },
      rightPriceScale: {
        visible: true,
        borderVisible: false,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        scaleMargins: {
          top: 0.08,
          bottom: 0.2,
        },
      },
      timeScale: {
        visible: true,
        borderVisible: false,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: false,
        secondsVisible: false,
        barSpacing: 10,
        minBarSpacing: 7,
        rightOffset: 8,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22C55E',
      downColor: '#EF4444',
      borderUpColor: '#22C55E',
      borderDownColor: '#EF4444',
      wickUpColor: '#22C55E',
      wickDownColor: '#EF4444',
      borderVisible: true,
      wickVisible: true,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const ma20Series = chart.addSeries(LineSeries, {
      color: '#3B82F6',
      lineWidth: 3,
      lineStyle: 0,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
    });

    const ma50Series = chart.addSeries(LineSeries, {
      color: '#F59E0B',
      lineWidth: 3,
      lineStyle: 0,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: 'volume',
      },
      priceLineVisible: false,
      lastValueVisible: false,
      base: 0,
    }, 1);

    const markerPlugin = createSeriesMarkers(candleSeries, [], {
      autoScale: true,
      zOrder: 'aboveSeries',
    });

    candleSeriesRef.current = candleSeries;
    ma20SeriesRef.current = ma20Series;
    ma50SeriesRef.current = ma50Series;
    volumeSeriesRef.current = volumeSeries;
    markersRef.current = markerPlugin;
    chartRef.current = chart;

    chart.priceScale('right', 1).applyOptions({
      borderVisible: false,
      scaleMargins: {
        top: 0.14,
        bottom: 0,
      },
    });

    const panes = chart.panes();
    if (panes[0]) {
      panes[0].setStretchFactor(4);
    }
    if (panes[1]) {
      panes[1].setStretchFactor(1);
    }

    const handleCrosshairMove = (param) => {
      const point = param?.point;
      const timeKey = normalizeTime(param?.time);
      const width = containerRef.current?.clientWidth ?? 0;
      const chartHeight = containerRef.current?.clientHeight ?? 0;

      if (
        !point
        || !timeKey
        || point.x < 0
        || point.y < 0
        || point.x > width
        || point.y > chartHeight
      ) {
        updatePanelsRef.current(null, false);
        return;
      }

      updatePanelsRef.current(timeKey, true);
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !chartRef.current) {
        return;
      }

      chartRef.current.applyOptions({
        width: Math.floor(entry.contentRect.width),
      });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      markerPlugin.detach();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      ma20SeriesRef.current = null;
      ma50SeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    metaRef.current = meta || null;
    updatePanelsRef.current(null, false);
  }, [meta]);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    chartRef.current.applyOptions({ height });
  }, [height]);

  useEffect(() => {
    candlesRef.current = candles;
    candleMapRef.current = new Map(candles.map((candle) => [candle.time, candle]));
    ma20MapRef.current = new Map(ma20Data.map((point) => [point.time, point]));
    ma50MapRef.current = new Map(ma50Data.map((point) => [point.time, point]));

    if (
      !candleSeriesRef.current
      || !ma20SeriesRef.current
      || !ma50SeriesRef.current
      || !volumeSeriesRef.current
      || !markersRef.current
    ) {
      return;
    }

    candleSeriesRef.current.setData(candles);
    ma20SeriesRef.current.setData(toLineSeriesData(ma20Data));
    ma50SeriesRef.current.setData(toLineSeriesData(ma50Data));
    volumeSeriesRef.current.setData(volumeData);
    markersRef.current.setMarkers(markerData);

    if (candles.length) {
      chartRef.current?.timeScale().fitContent();
    }

    updatePanelsRef.current(null, false);
  }, [candles, ma20Data, ma50Data, volumeData, markerData]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-[#111827] p-2">
      <div ref={containerRef} className="h-full w-full" />

      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3">
        <div className="min-w-0 rounded-xl border border-slate-600/45 bg-[#1F2937]/88 px-3 py-2 shadow-lg backdrop-blur-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            <span ref={legendSymbolRef}>Price Action</span>
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span ref={legendMa20Ref}>MA20 --</span>
            <span className="h-2 w-2 rounded-full bg-orange-400" />
            <span ref={legendMa50Ref}>MA50 --</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-200">
            <span ref={legendDateRef}>--</span>
            <span>O <span ref={legendOpenRef}>--</span></span>
            <span>H <span ref={legendHighRef}>--</span></span>
            <span>L <span ref={legendLowRef}>--</span></span>
            <span>C <span ref={legendCloseRef}>--</span></span>
          </div>
        </div>

        <div
          ref={tooltipRef}
          className="rounded-xl border border-slate-600/50 bg-[#1F2937]/95 px-4 py-3 text-xs text-slate-100 opacity-0 shadow-lg backdrop-blur-sm transition-all duration-150 ease-out"
        >
          <p ref={tooltipDateRef} className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">--</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-slate-400">Open</span>
            <span ref={tooltipOpenRef} className="text-right">--</span>
            <span className="text-slate-400">High</span>
            <span ref={tooltipHighRef} className="text-right">--</span>
            <span className="text-slate-400">Low</span>
            <span ref={tooltipLowRef} className="text-right">--</span>
            <span className="text-slate-400">Close</span>
            <span ref={tooltipCloseRef} className="text-right">--</span>
            <span className="text-slate-400">Volume</span>
            <span ref={tooltipVolumeRef} className="text-right">--</span>
          </div>
          <p ref={tooltipSignalRef} className="mt-3 border-t border-slate-800 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
            Monitoring
          </p>
        </div>
      </div>

      {!hasEnoughData ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70">
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
            Not enough data for chart
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CandlestickChart;
