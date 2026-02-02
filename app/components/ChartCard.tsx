"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { ChartData } from "../page";

const COLORS = ["#ffffff", "#c0c0c0", "#909090", "#686868", "#484848", "#303030", "#1a1a1a"];

interface ChartCardProps {
  chart: ChartData;
  pinned?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
}

export default function ChartCard({ chart, pinned, onPin, onUnpin }: ChartCardProps) {
  const renderChart = () => {
    if (chart.imageUrl) {
      return (
        <img
          src={chart.imageUrl}
          alt={chart.title}
          className="h-64 w-full object-contain"
        />
      );
    }

    if (chart.type === "summary") {
      return (
        <div className="grid grid-cols-2 gap-3 p-4">
          {chart.data.map((item, i) => (
            <div
              key={i}
              className="rounded-lg p-3"
              style={{ background: "var(--bg-primary)" }}
            >
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {String(item.label || item.name || "")}
              </p>
              <p className="text-lg font-bold" style={{ color: COLORS[i % COLORS.length] }}>
                {String(item.value || "")}
              </p>
            </div>
          ))}
        </div>
      );
    }

    const xKey = chart.xKey || "name";
    const yKey = chart.yKey || "value";

    if (chart.type === "bar" || chart.type === "histogram") {
      return (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey={xKey} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                color: "var(--text-primary)",
              }}
            />
            <Bar dataKey={yKey} fill="var(--accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chart.type === "line") {
      return (
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey={xKey} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                color: "var(--text-primary)",
              }}
            />
            <Line
              type="monotone"
              dataKey={yKey}
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (chart.type === "pie") {
      return (
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={chart.data}
              dataKey={yKey}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={(props) => {
                const name = String(props.name ?? '')
                const percent = Number(props.percent ?? 0)
                return `${name} ${(percent * 100).toFixed(0)}%`
              }}
            >
              {chart.data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                color: "var(--text-primary)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    return null;
  };

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{
        background: "var(--bg-card)",
        borderColor: pinned ? "var(--accent-muted)" : "var(--border-color)",
      }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "var(--border-color)" }}
      >
        <h3 className="text-sm font-medium">{chart.title}</h3>
        <div className="flex gap-1">
          {pinned && onUnpin && (
            <button
              onClick={onUnpin}
              className="rounded px-2 py-0.5 text-xs hover:bg-white/10"
              style={{ color: "var(--text-secondary)" }}
            >
              Unpin
            </button>
          )}
          {!pinned && onPin && (
            <button
              onClick={onPin}
              className="rounded px-2 py-0.5 text-xs opacity-50 hover:bg-white/10 hover:opacity-100"
              style={{ color: "var(--text-tertiary)" }}
            >
              Pin
            </button>
          )}
        </div>
      </div>
      <div className="p-2">{renderChart()}</div>
    </div>
  );
}
