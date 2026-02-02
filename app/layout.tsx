import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeSemantic - CSV Analysis Agent",
  description: "AI-powered CSV data analysis with automatic dashboards",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
