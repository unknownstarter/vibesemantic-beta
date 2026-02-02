"use client";

import type { ChartData } from "../page";
import ChartCard from "./ChartCard";

interface DashboardProps {
  charts: ChartData[];
  pinnedCharts: ChartData[];
  onUnpinChart: (chartId: string) => void;
}

export default function Dashboard({
  charts,
  pinnedCharts,
  onUnpinChart,
}: DashboardProps) {
  const allCharts = [...pinnedCharts, ...charts];

  if (allCharts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-6xl opacity-20">📊</div>
          <h2 className="mb-2 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            데이터를 업로드하세요
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            CSV 파일을 사이드바에 드래그하면 자동으로 대시보드가 생성됩니다
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Pinned Charts */}
      {pinnedCharts.length > 0 && (
        <section className="mb-6">
          <h2
            className="mb-3 text-sm font-medium uppercase tracking-wider"
            style={{ color: "var(--accent-purple)" }}
          >
            📌 고정된 차트
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pinnedCharts.map((chart) => (
              <ChartCard
                key={chart.id}
                chart={chart}
                pinned
                onUnpin={() => onUnpinChart(chart.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Auto-generated Charts */}
      {charts.length > 0 && (
        <section>
          <h2
            className="mb-3 text-sm font-medium uppercase tracking-wider"
            style={{ color: "var(--text-secondary)" }}
          >
            자동 분석 결과
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {charts.map((chart) => (
              <ChartCard key={chart.id} chart={chart} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
