"use client";

import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import ChatPanel from "./components/ChatPanel";

export interface UploadedFile {
  id: string;
  name: string;
  columns: string[];
  rowCount: number;
  sample: Record<string, unknown>[];
}

export interface ChartData {
  id: string;
  type: "bar" | "line" | "pie" | "histogram" | "summary";
  title: string;
  data: Record<string, unknown>[];
  xKey?: string;
  yKey?: string;
  imageUrl?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  charts?: ChartData[];
  code?: string;
}

export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [dashboardCharts, setDashboardCharts] = useState<ChartData[]>([]);
  const [pinnedCharts, setPinnedCharts] = useState<ChartData[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(true);

  const handleFilesUploaded = (
    newFiles: UploadedFile[],
    charts: ChartData[]
  ) => {
    setFiles((prev) => [...prev, ...newFiles]);
    setSelectedFileIds((prev) => [...prev, ...newFiles.map((f) => f.id)]);
    setDashboardCharts((prev) => [...prev, ...charts]);
  };

  const handlePinChart = (chart: ChartData) => {
    setPinnedCharts((prev) => {
      if (prev.some((c) => c.id === chart.id)) return prev;
      return [...prev, chart];
    });
  };

  const handleUnpinChart = (chartId: string) => {
    setPinnedCharts((prev) => prev.filter((c) => c.id !== chartId));
  };

  const handleToggleFile = (fileId: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(fileId)
        ? prev.filter((id) => id !== fileId)
        : [...prev, fileId]
    );
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        files={files}
        selectedFileIds={selectedFileIds}
        onToggleFile={handleToggleFile}
        onFilesUploaded={handleFilesUploaded}
      />

      {/* Main Dashboard */}
      <main className="flex-1 overflow-y-auto p-6">
        <Dashboard
          charts={dashboardCharts}
          pinnedCharts={pinnedCharts}
          onUnpinChart={handleUnpinChart}
        />
      </main>

      {/* Chat Panel */}
      {isChatOpen && (
        <ChatPanel
          files={files}
          selectedFileIds={selectedFileIds}
          messages={chatMessages}
          onMessagesChange={setChatMessages}
          onPinChart={handlePinChart}
          onClose={() => setIsChatOpen(false)}
        />
      )}

      {/* Chat Toggle Button */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed right-4 bottom-4 rounded-full p-4"
          style={{ background: "var(--accent)" }}
        >
          <svg
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}
    </div>
  );
}
