import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import ErrorBoundary from "@/components/ErrorBoundary";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RAG Core Ops Console",
  description: "Operations console for RAG document ingestion and management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ErrorBoundary>
          <Navigation />
          <main className="min-h-screen bg-gray-50">
            {children}
          </main>
        </ErrorBoundary>
      </body>
    </html>
  );
}