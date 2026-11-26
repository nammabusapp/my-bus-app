import { useCallback, useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Filter,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { TRANSLATIONS } from '../i18n/translations';
import {
  AppLang,
  DailyPunctualityPoint,
  DriverPerformanceSummary,
  PerformanceOverviewData,
  ThemeMode,
} from '../types';

interface PerformanceOverviewProps {
  adminToken: string;
  theme: ThemeMode;
  lang: AppLang;
  onBack: () => void;
  onUnauthorized: () => void;
}

interface HoveredDayState {
  point: DailyPunctualityPoint;
  x: number;
  y: number;
}

function getPunctualityColor(pct: number, isDark: boolean): string {
  if (pct >= 90) return isDark ? '#34d399' : '#16a34a';
  if (pct >= 75) return isDark ? '#fbbf24' : '#d97706';
  return isDark ? '#f87171' : '#dc2626';
}

export function PerformanceOverview({
  adminToken,
  theme,
  lang,
  onBack,
  onUnauthorized,
}: PerformanceOverviewProps) {
  const t = TRANSLATIONS[lang];
  const isDark = theme === 'dark';

  const [selectedDriverId, setSelectedDriverId] = useState<string>('ALL');
  const [data, setData] = useState<PerformanceOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const trendContainerRef = useRef<HTMLDivElement | null>(null);
  const trendSvgRef = useRef<SVGSVGElement | null>(null);
  const [trendWidth, setTrendWidth] = useState(640);
  const [hoveredDay, setHoveredDay] = useState<HoveredDayState | null>(null);

  const barContainerRef = useRef<HTMLDivElement | null>(null);
  const barSvgRef = useRef<SVGSVGElement | null>(null);
  const [barWidth, setBarWidth] = useState(480);

  const fetchPerformance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: '30' });
      if (selectedDriverId !== 'ALL') {
        params.set('driverId', selectedDriverId);
      }
      const res = await fetch(`/api/admin/performance?${params.toString()}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not load punctuality metrics.');
        return;
      }
      setData(json as PerformanceOverviewData);
    } catch {
      setError('Network error while loading 30-day punctuality analytics.');
    } finally {
      setLoading(false);
    }
  }, [adminToken, selectedDriverId, onUnauthorized]);

  useEffect(() => {
    void fetchPerformance();
  }, [fetchPerformance]);

  // Responsive container measurement for D3 charts
  useEffect(() => {
    const trendEl = trendContainerRef.current;
    const barEl = barContainerRef.current;
    if (!trendEl && !barEl) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w <= 0) continue;
        if (entry.target === trendEl) setTrendWidth(w);
        if (entry.target === barEl) setBarWidth(w);
      }
    });
    if (trendEl) observer.observe(trendEl);
    if (barEl) observer.observe(barEl);

    return () => observer.disconnect();
  }, [data]);

  // D3 Chart 1: 30-Day Punctuality Trend (Area + Line + Target Line + Hover Crosshair)
  useEffect(() => {
    const svgEl = trendSvgRef.current;
    if (!svgEl || !data || data.dailySeries.length === 0) return;

    const width = Math.max(300, trendWidth);
    const height = 280;
    const margin = { top: 20, right: 20, bottom: 34, left: 44 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const parseDate = d3.utcParse('%Y-%m-%d');
    const formatAxisDate = d3.utcFormat('%b %d');

    const parsedPoints = data.dailySeries
      .map((d) => ({
        raw: d,
        dateObj: parseDate(d.date) || new Date(d.date),
      }))
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

    const activePoints = parsedPoints.filter((p) => p.raw.totalTrips > 0);
    if (parsedPoints.length === 0) return;

    const xScale = d3
      .scaleUtc()
      .domain(
        d3.extent(parsedPoints, (d) => d.dateObj) as [Date, Date]
      )
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);

    const defs = svg.append('defs');
    const gradId = `punctuality-grad-${isDark ? 'dark' : 'light'}`;
    const gradient = defs
      .append('linearGradient')
      .attr('id', gradId)
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    gradient
      .append('stop')
      .attr('offset', '0%')
      .attr('stop-color', isDark ? '#3b82f6' : '#1d4ed8')
      .attr('stop-opacity', isDark ? 0.34 : 0.22);
    gradient
      .append('stop')
      .attr('offset', '100%')
      .attr('stop-color', isDark ? '#3b82f6' : '#1d4ed8')
      .attr('stop-opacity', 0.02);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const gridStroke = isDark ? '#1e293b' : '#e2e8f0';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const lineStroke = isDark ? '#60a5fa' : '#1d4ed8';

    // Horizontal gridlines (0%, 25%, 50%, 75%, 100%)
    const yTicks = [0, 25, 50, 75, 100];
    g.selectAll('.y-grid')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', gridStroke)
      .attr('stroke-width', 1);

    // 90% Target SLA reference line
    const targetY = yScale(90);
    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', targetY)
      .attr('y2', targetY)
      .attr('stroke', isDark ? '#34d399' : '#16a34a')
      .attr('stroke-width', 1.25)
      .attr('stroke-dasharray', '4,4')
      .attr('opacity', 0.8);

    g.append('text')
      .attr('x', innerWidth - 4)
      .attr('y', targetY - 6)
      .attr('text-anchor', 'end')
      .attr('fill', isDark ? '#34d399' : '#15803d')
      .style('font-size', '10px')
      .style('font-weight', '600')
      .text('90% Target');

    // Axes
    const xAxis = d3
      .axisBottom<Date>(xScale)
      .ticks(width < 480 ? 5 : 7)
      .tickFormat((d) => formatAxisDate(d));

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call((axis) => axis.select('.domain').attr('stroke', gridStroke))
      .call((axis) => axis.selectAll('.tick line').attr('stroke', gridStroke))
      .call((axis) =>
        axis
          .selectAll('.tick text')
          .attr('fill', textColor)
          .style('font-size', '11px')
      );

    const yAxis = d3
      .axisLeft<number>(yScale)
      .tickValues(yTicks)
      .tickFormat((d) => `${d}%`);

    g.append('g')
      .call(yAxis)
      .call((axis) => axis.select('.domain').remove())
      .call((axis) => axis.selectAll('.tick line').remove())
      .call((axis) =>
        axis
          .selectAll('.tick text')
          .attr('fill', textColor)
          .style('font-size', '11px')
          .style('font-variant-numeric', 'tabular-nums')
      );

    if (activePoints.length > 0) {
      const areaGen = d3
        .area<(typeof activePoints)[number]>()
        .x((d) => xScale(d.dateObj))
        .y0(innerHeight)
        .y1((d) => yScale(d.raw.onTimePct))
        .curve(d3.curveMonotoneX);

      const lineGen = d3
        .line<(typeof activePoints)[number]>()
        .x((d) => xScale(d.dateObj))
        .y((d) => yScale(d.raw.onTimePct))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(activePoints)
        .attr('fill', `url(#${gradId})`)
        .attr('d', areaGen);

      g.append('path')
        .datum(activePoints)
        .attr('fill', 'none')
        .attr('stroke', lineStroke)
        .attr('stroke-width', 2.25)
        .attr('d', lineGen);

      g.selectAll('.day-dot')
        .data(activePoints)
        .enter()
        .append('circle')
        .attr('cx', (d) => xScale(d.dateObj))
        .attr('cy', (d) => yScale(d.raw.onTimePct))
        .attr('r', 3.4)
        .attr('fill', (d) => getPunctualityColor(d.raw.onTimePct, isDark))
        .attr('stroke', isDark ? '#0f172a' : '#ffffff')
        .attr('stroke-width', 1.5);
    }

    // Crosshair & Hover Overlay
    const crosshair = g
      .append('line')
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', isDark ? '#64748b' : '#94a3b8')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .style('opacity', 0);

    const focusRing = g
      .append('circle')
      .attr('r', 5.5)
      .attr('fill', lineStroke)
      .attr('stroke', isDark ? '#0f172a' : '#ffffff')
      .attr('stroke-width', 2)
      .style('opacity', 0);

    const bisect = d3.bisector<(typeof parsedPoints)[number], Date>(
      (d) => d.dateObj
    ).left;

    g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mousemove', (event) => {
        const [mx] = d3.pointer(event);
        const hoveredDate = xScale.invert(mx);
        const idx = bisect(parsedPoints, hoveredDate, 1);
        const d0 = parsedPoints[idx - 1];
        const d1 = parsedPoints[idx];
        const chosen =
          !d1 ||
          hoveredDate.getTime() - d0.dateObj.getTime() <
            d1.dateObj.getTime() - hoveredDate.getTime()
            ? d0
            : d1;
        if (!chosen) return;

        const cx = xScale(chosen.dateObj);
        const cy = yScale(chosen.raw.onTimePct);

        crosshair.attr('x1', cx).attr('x2', cx).style('opacity', 1);
        focusRing
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('fill', getPunctualityColor(chosen.raw.onTimePct, isDark))
          .style('opacity', chosen.raw.totalTrips > 0 ? 1 : 0.3);

        setHoveredDay({
          point: chosen.raw,
          x: margin.left + cx,
          y: margin.top + cy,
        });
      })
      .on('mouseleave', () => {
        crosshair.style('opacity', 0);
        focusRing.style('opacity', 0);
        setHoveredDay(null);
      });
  }, [data, trendWidth, isDark]);

  // D3 Chart 2: Driver Punctuality Horizontal Bar Ranking
  useEffect(() => {
    const svgEl = barSvgRef.current;
    if (!svgEl || !data || data.driverSummaries.length === 0) return;

    const drivers = data.driverSummaries;
    const width = Math.max(280, barWidth);
    const barRowHeight = 42;
    const margin = { top: 10, right: 56, bottom: 26, left: 124 };
    const height = Math.max(
      180,
      margin.top + margin.bottom + drivers.length * barRowHeight
    );
    const innerWidth = Math.max(100, width - margin.left - margin.right);
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const yScale = d3
      .scaleBand<string>()
      .domain(drivers.map((d) => d.driverId))
      .range([0, innerHeight])
      .padding(0.32);

    const xScale = d3.scaleLinear().domain([0, 100]).range([0, innerWidth]);

    const trackFill = isDark ? '#0f172a' : '#f1f5f9';
    const labelColor = isDark ? '#e2e8f0' : '#1e293b';
    const subLabelColor = isDark ? '#94a3b8' : '#64748b';
    const gridStroke = isDark ? '#1e293b' : '#e2e8f0';

    // X-axis ticks
    const xAxis = d3
      .axisBottom<number>(xScale)
      .tickValues([0, 50, 75, 90, 100])
      .tickFormat((d) => `${d}%`);

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call((axis) => axis.select('.domain').attr('stroke', gridStroke))
      .call((axis) => axis.selectAll('.tick line').attr('stroke', gridStroke))
      .call((axis) =>
        axis
          .selectAll('.tick text')
          .attr('fill', subLabelColor)
          .style('font-size', '10px')
          .style('font-variant-numeric', 'tabular-nums')
      );

    // 90% Target vertical line
    g.append('line')
      .attr('x1', xScale(90))
      .attr('x2', xScale(90))
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', isDark ? '#34d399' : '#16a34a')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .attr('opacity', 0.6);

    const rows = g
      .selectAll('.driver-bar-row')
      .data(drivers)
      .enter()
      .append('g')
      .attr('class', 'driver-bar-row')
      .style('cursor', 'pointer')
      .on('click', (_event, d: DriverPerformanceSummary) => {
        setSelectedDriverId((cur) =>
          cur === d.driverId ? 'ALL' : d.driverId
        );
      });

    // Background tracks
    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', (d) => yScale(d.driverId) ?? 0)
      .attr('width', innerWidth)
      .attr('height', yScale.bandwidth())
      .attr('rx', 5)
      .attr('fill', trackFill);

    // Active value bars
    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', (d) => yScale(d.driverId) ?? 0)
      .attr('width', (d) => Math.max(4, xScale(d.punctualityPct)))
      .attr('height', yScale.bandwidth())
      .attr('rx', 5)
      .attr('fill', (d) => getPunctualityColor(d.punctualityPct, isDark))
      .attr('opacity', (d) =>
        selectedDriverId === 'ALL' || selectedDriverId === d.driverId ? 1 : 0.35
      );

    // Driver name + bus left labels
    rows
      .append('text')
      .attr('x', -10)
      .attr('y', (d) => (yScale(d.driverId) ?? 0) + yScale.bandwidth() / 2 - 2)
      .attr('text-anchor', 'end')
      .attr('fill', labelColor)
      .style('font-size', '12px')
      .style('font-weight', '600')
      .text((d) =>
        d.driverName.length > 14
          ? `${d.driverName.slice(0, 13)}…`
          : d.driverName
      );

    rows
      .append('text')
      .attr('x', -10)
      .attr('y', (d) => (yScale(d.driverId) ?? 0) + yScale.bandwidth() / 2 + 11)
      .attr('text-anchor', 'end')
      .attr('fill', subLabelColor)
      .style('font-size', '10px')
      .style('font-family', 'ui-monospace, SFMono-Regular, monospace')
      .text((d) => d.busNo);

    // Percentage right labels
    rows
      .append('text')
      .attr('x', innerWidth + 8)
      .attr('y', (d) => (yScale(d.driverId) ?? 0) + yScale.bandwidth() / 2 + 4)
      .attr('fill', labelColor)
      .style('font-size', '12px')
      .style('font-weight', '700')
      .style('font-family', 'ui-monospace, SFMono-Regular, monospace')
      .style('font-variant-numeric', 'tabular-nums')
      .text((d) => `${d.punctualityPct.toFixed(1)}%`);
  }, [data, barWidth, isDark, selectedDriverId]);

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-w-[44px] min-h-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 text-sm font-medium cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.back}</span>
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-700 dark:text-blue-400" />
              <span>{t.performanceOverview}</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              {t.performanceOverviewDesc}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 min-h-[42px]">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              aria-label="Filter by driver"
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="bg-transparent text-xs sm:text-sm font-medium text-slate-900 dark:text-white focus:outline-none cursor-pointer"
            >
              <option
                value="ALL"
                className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                {lang === 'kn' ? 'ಎಲ್ಲಾ ಚಾಲಕರು (30 ದಿನ)' : 'All Drivers (Last 30 Days)'}
              </option>
              {data?.driverSummaries.map((drv) => (
                <option
                  key={drv.driverId}
                  value={drv.driverId}
                  className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  {drv.driverName} · {drv.busNo}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void fetchPerformance()}
            disabled={loading}
            className="min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{lang === 'kn' ? 'ರಿಫ್ರೆಶ್' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center text-sm text-slate-500 dark:text-slate-400">
          {lang === 'kn'
            ? '30 ದಿನಗಳ ಸಮಯಪಾಲನೆ ವರದಿ ಲೋಡ್ ಆಗುತ್ತಿದೆ...'
            : 'Loading 30-day driver punctuality analytics...'}
        </div>
      ) : !data || data.kpis.totalTrips === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center">
          <TrendingUp className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <p className="text-base font-semibold text-slate-900 dark:text-white mb-1">
            {lang === 'kn'
              ? 'ಕಳೆದ 30 ದಿನಗಳಲ್ಲಿ ಯಾವುದೇ ಪ್ರಯಾಣದ ದಾಖಲೆಗಳಿಲ್ಲ'
              : 'No trip punctuality records logged in the last 30 days'}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {lang === 'kn'
              ? 'ಚಾಲಕರು ನೇರ ಪ್ರಯಾಣವನ್ನು ಪ್ರಾರಂಭಿಸಿದಾಗ ಇಲ್ಲಿ ಅಂಕಿಅಂಶಗಳು ಕಾಣಿಸುತ್ತವೆ.'
              : 'Metrics appear automatically as drivers log departures and live trip statuses.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 4-Card KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                {lang === 'kn' ? '30 ದಿನದ ಸಮಯಪಾಲನೆ' : '30-Day On-Time Rate'}
              </p>
              <p
                className={`text-2xl sm:text-3xl font-bold font-mono tabular-nums ${
                  data.kpis.overallOnTimePct >= 90
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : data.kpis.overallOnTimePct >= 75
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {data.kpis.overallOnTimePct.toFixed(1)}%
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                {data.kpis.onTimeTrips} / {data.kpis.totalTrips} on-time trips
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                {lang === 'kn' ? 'ಒಟ್ಟು ಪ್ರಯಾಣಗಳು' : 'Trips Evaluated (30d)'}
              </p>
              <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {data.kpis.totalTrips}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                {data.kpis.delayedTrips} delayed trips
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                {lang === 'kn' ? 'ಸರಾಸರಿ ವಿಳಂಬ' : 'Average Departure Delay'}
              </p>
              <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {data.kpis.avgDelayMin.toFixed(1)}{' '}
                <span className="text-sm font-normal text-slate-500">min</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                SLA tolerance: ≤ 5 min
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                {lang === 'kn' ? 'ಅಗ್ರ ಚಾಲಕ' : 'Most Punctual Driver'}
              </p>
              <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">
                {data.kpis.topDriverName}
              </p>
              <p className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400 mt-1.5 tabular-nums">
                {data.kpis.topDriverPct.toFixed(1)}% on-time
              </p>
            </div>
          </div>

          {/* D3 Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* D3 Trend Area/Line Chart */}
            <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {lang === 'kn'
                      ? 'ದೈನಂದಿನ ಸಮಯಪಾಲನೆ ಪ್ರವೃತ್ತಿ (30 ದಿನಗಳು)'
                      : '30-Day Punctuality Trend'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedDriverId === 'ALL'
                      ? 'Fleet-wide daily on-time percentage'
                      : `Filtered to ${selectedDriverId}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                    ≥ 90%
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600 dark:bg-amber-400" />
                    75–89%
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 dark:bg-red-400" />
                    &lt; 75%
                  </span>
                </div>
              </div>

              <div ref={trendContainerRef} className="relative w-full">
                <svg
                  ref={trendSvgRef}
                  className="w-full h-[280px] overflow-visible select-none"
                  role="img"
                  aria-label="D3 30-day driver punctuality trend chart"
                />

                {hoveredDay && (
                  <div
                    className="pointer-events-none absolute z-20 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-950/95 shadow-md text-xs whitespace-nowrap"
                    style={{
                      left: Math.min(
                        Math.max(8, hoveredDay.x - 70),
                        Math.max(8, trendWidth - 175)
                      ),
                      top: Math.max(4, hoveredDay.y - 76),
                    }}
                  >
                    <div className="font-mono font-semibold text-slate-900 dark:text-white mb-0.5">
                      {hoveredDay.point.date}
                    </div>
                    {hoveredDay.point.totalTrips > 0 ? (
                      <div className="space-y-0.5 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        <div>
                          On-Time:{' '}
                          <strong className="text-slate-900 dark:text-white">
                            {hoveredDay.point.onTimePct.toFixed(1)}%
                          </strong>{' '}
                          ({hoveredDay.point.onTimeTrips}/
                          {hoveredDay.point.totalTrips})
                        </div>
                        <div>
                          Avg Delay: {hoveredDay.point.avgDelayMin.toFixed(1)} min
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-400">No trips recorded</div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* D3 Driver Ranking Horizontal Bar Chart */}
            <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {lang === 'kn'
                      ? 'ಚಾಲಕರ ಸಮಯಪಾಲನೆ ಶ್ರೇಣಿ'
                      : 'Punctuality by Driver'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Click a driver bar to isolate their 30-day trend
                  </p>
                </div>
                {selectedDriverId !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedDriverId('ALL')}
                    className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>

              <div ref={barContainerRef} className="w-full">
                <svg
                  ref={barSvgRef}
                  className="w-full select-none"
                  role="img"
                  aria-label="D3 driver punctuality ranking bar chart"
                />
              </div>
            </section>
          </div>

          {/* Per-Driver 30-Day Summary Ledger Table */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <span>30-Day Driver Punctuality Breakdown</span>
              </h2>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {data.driverSummaries.length} drivers
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <th className="py-3 px-4 whitespace-nowrap">Driver</th>
                    <th className="py-3 px-4 whitespace-nowrap">Bus No.</th>
                    <th className="py-3 px-4 whitespace-nowrap text-right">
                      Trips (30d)
                    </th>
                    <th className="py-3 px-4 whitespace-nowrap text-right">
                      On-Time
                    </th>
                    <th className="py-3 px-4 whitespace-nowrap text-right">
                      Delayed
                    </th>
                    <th className="py-3 px-4 whitespace-nowrap text-right">
                      Avg Delay
                    </th>
                    <th className="py-3 px-4 whitespace-nowrap text-right">
                      Max Delay
                    </th>
                    <th className="py-3 px-4 whitespace-nowrap text-right">
                      Punctuality
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {data.driverSummaries.map((drv) => {
                    const isSelected = selectedDriverId === drv.driverId;
                    return (
                      <tr
                        key={drv.driverId}
                        onClick={() =>
                          setSelectedDriverId((cur) =>
                            cur === drv.driverId ? 'ALL' : drv.driverId
                          )
                        }
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50/70 dark:bg-blue-950/30'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {drv.driverName}
                          </div>
                          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {drv.driverId}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {drv.busNo}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {drv.totalTrips}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {drv.onTimeTrips}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                          {drv.delayedTrips}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {drv.avgDelayMin.toFixed(1)} min
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {drv.maxDelayMin} min
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                          <span
                            className={
                              drv.punctualityPct >= 90
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : drv.punctualityPct >= 75
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                            }
                          >
                            {drv.punctualityPct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
