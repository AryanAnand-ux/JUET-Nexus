"use client";

import React, { useState, useRef } from "react";
import type { SemesterRecord } from "@/types";
import { Sparkles, TrendingUp } from "lucide-react";

export interface PerformanceChartProps {
  semesters: SemesterRecord[];
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({ semesters = [] }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (!semesters || semesters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border border-slate-200/60 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/10 min-h-[200px]">
        <TrendingUp className="w-8 h-8 text-slate-350 dark:text-slate-650 mb-2" />
        <p className="text-sm font-semibold text-slate-500 font-nunito">
          No semester historical data available to plot.
        </p>
      </div>
    );
  }

  // Chart layout dimensions
  const viewWidth = 600;
  const viewHeight = 250;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 30;
  const paddingBottom = 40;

  const chartWidth = viewWidth - paddingLeft - paddingRight;
  const chartHeight = viewHeight - paddingTop - paddingBottom;

  // Find min/max GPA for scaling
  const allGpas = semesters.flatMap((s) => [s.sgpa, s.cgpa]);
  const minGpa = Math.max(0, Math.floor(Math.min(...allGpas) - 0.5));
  const maxGpa = 10;
  const gpaRange = maxGpa - minGpa;

  // Coordinate conversion helpers
  const getX = (idx: number) => {
    if (semesters.length === 1) {
      return paddingLeft + chartWidth / 2;
    }
    return paddingLeft + (idx * chartWidth) / (semesters.length - 1);
  };

  const getY = (val: number) => {
    const ratio = (val - minGpa) / gpaRange;
    return viewHeight - paddingBottom - ratio * chartHeight;
  };

  // Generate coordinates
  const sgpaPoints = semesters.map((s, idx) => ({ x: getX(idx), y: getY(s.sgpa) }));
  const cgpaPoints = semesters.map((s, idx) => ({ x: getX(idx), y: getY(s.cgpa) }));

  // Helper to construct smooth cubic bezier path
  const getCurvePath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cp1x = p0.x + (p1.x - p0.x) / 3;
      const cp1y = p0.y;
      const cp2x = p1.x - (p1.x - p0.x) / 3;
      const cp2y = p1.y;
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
    }
    return path;
  };

  // Paths
  const sgpaPath = getCurvePath(sgpaPoints);
  const cgpaPath = getCurvePath(cgpaPoints);

  // Closed paths for gradients
  const getAreaPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return "";
    const linePath = getCurvePath(points);
    const startY = viewHeight - paddingBottom;
    return `${linePath} L ${points[points.length - 1].x} ${startY} L ${points[0].x} ${startY} Z`;
  };

  const sgpaAreaPath = getAreaPath(sgpaPoints);

  // Grid lines
  const gridLinesCount = 4;
  const gridLines = Array.from({ length: gridLinesCount + 1 }).map((_, i) => {
    const val = minGpa + (i * gpaRange) / gridLinesCount;
    return { val, y: getY(val) };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 font-nunito uppercase tracking-wider">
            <TrendingUp className="w-4 h-4 text-accent-primary" /> SGPA & CGPA Semester Trends
          </h4>
          <p className="text-xs text-slate-400 dark:text-slate-500 font-nunito mt-0.5">
            Hover over points to see GPA breakdowns per semester
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs font-bold font-nunito select-none">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-accent-primary rounded-full" />
            <span className="text-slate-600 dark:text-slate-400">SGPA</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-slate-400 dark:bg-slate-600 border-dashed border-t rounded-full" />
            <span className="text-slate-600 dark:text-slate-400">CGPA</span>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full border border-slate-100 dark:border-slate-800/80 rounded-2xl bg-white/50 dark:bg-slate-950/20 p-4 shadow-sm">
        <svg
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          width="100%"
          height="100%"
          className="overflow-visible select-none"
        >
          <defs>
            {/* Area Fill Gradient */}
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.0" />
            </linearGradient>

            {/* Accent Line Glow */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="var(--accent-primary)" floodOpacity="0.1" />
            </filter>
          </defs>

          {/* Grid lines & Y-axis labels */}
          {gridLines.map((line, idx) => (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={line.y}
                x2={viewWidth - paddingRight}
                y2={line.y}
                className="stroke-slate-100 dark:stroke-slate-800/60"
                strokeWidth={1}
              />
              <text
                x={paddingLeft - 10}
                y={line.y + 4}
                textAnchor="end"
                className="text-[10px] font-bold fill-slate-400 dark:fill-slate-500 font-mono"
              >
                {line.val.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Area under SGPA curve */}
          {sgpaAreaPath && (
            <path d={sgpaAreaPath} fill="url(#areaGrad)" />
          )}

          {/* SGPA Path */}
          {sgpaPath && (
            <path
              d={sgpaPath}
              fill="none"
              stroke="var(--accent-primary)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
            />
          )}

          {/* CGPA Path */}
          {cgpaPath && (
            <path
              d={cgpaPath}
              fill="none"
              stroke="#94A3B8"
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Column indicators when hovered */}
          {hoveredIdx !== null && (
            <line
              x1={getX(hoveredIdx)}
              y1={paddingTop}
              x2={getX(hoveredIdx)}
              y2={viewHeight - paddingBottom}
              className="stroke-accent-primary/20 dark:stroke-accent-primary/30"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          )}

          {/* Node Dots & Highlight Rings */}
          {semesters.map((s, idx) => {
            const isHovered = hoveredIdx === idx;
            return (
              <g key={idx}>
                {/* SGPA Nodes */}
                <circle
                  cx={getX(idx)}
                  cy={getY(s.sgpa)}
                  r={isHovered ? 6 : 4}
                  fill="var(--accent-primary)"
                  className="transition-all duration-150 cursor-pointer"
                />
                {isHovered && (
                  <circle
                    cx={getX(idx)}
                    cy={getY(s.sgpa)}
                    r={10}
                    fill="none"
                    stroke="var(--accent-primary)"
                    strokeWidth={1.5}
                    className="opacity-40 animate-pulse"
                  />
                )}

                {/* CGPA Nodes */}
                <circle
                  cx={getX(idx)}
                  cy={getY(s.cgpa)}
                  r={isHovered ? 5 : 3}
                  fill="#94A3B8"
                  className="transition-all duration-150 cursor-pointer"
                />
              </g>
            );
          })}

          {/* X-axis labels (Semester labels) */}
          {semesters.map((s, idx) => (
            <text
              key={idx}
              x={getX(idx)}
              y={viewHeight - paddingBottom + 20}
              textAnchor="middle"
              className={`text-[10px] font-extrabold font-nunito transition-colors duration-150 ${
                hoveredIdx === idx ? "fill-accent-primary" : "fill-slate-400 dark:fill-slate-500"
              }`}
            >
              Sem {s.semester}
            </text>
          ))}

          {/* Invisible hover rectangles for easy mouse interaction */}
          {semesters.map((_, idx) => {
            const width = semesters.length === 1 ? chartWidth : chartWidth / (semesters.length - 1);
            const x = getX(idx) - width / 2;
            return (
              <rect
                key={idx}
                x={x}
                y={paddingTop}
                width={width}
                height={chartHeight}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            );
          })}
        </svg>

        {/* Custom HTML Glassmorphic Tooltip */}
        {hoveredIdx !== null && semesters[hoveredIdx] && (
          <div
            className="absolute z-10 bg-white/90 dark:bg-slate-950/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xl pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95 duration-100 font-nunito"
            style={{
              left: `${Math.min(
                Math.max(10, (getX(hoveredIdx) / viewWidth) * 100 - 15),
                70
              )}%`,
              top: "10px",
            }}
          >
            <div className="flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-900 pb-1.5 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
              <p className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Semester {semesters[hoveredIdx].semester}
              </p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between items-center gap-4">
                <span className="font-bold text-slate-500 dark:text-slate-400">Semester SGPA:</span>
                <span className="font-black text-accent-primary font-mono">{semesters[hoveredIdx].sgpa.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="font-bold text-slate-500 dark:text-slate-400">Cumulative CGPA:</span>
                <span className="font-black text-slate-700 dark:text-slate-300 font-mono">{semesters[hoveredIdx].cgpa.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center gap-4 pt-1 border-t border-slate-100/60 dark:border-slate-900/60 text-[10px]">
                <span className="font-semibold text-slate-400 dark:text-slate-500">Credits Earned:</span>
                <span className="font-extrabold text-slate-600 dark:text-slate-400">{semesters[hoveredIdx].earnedCredits} / {semesters[hoveredIdx].credits}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

PerformanceChart.displayName = "PerformanceChart";
