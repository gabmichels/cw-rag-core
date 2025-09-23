import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import ErrorBoundary from "@/components/ErrorBoundary";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "RAG Chat Interface",
  description: "Modern streaming RAG interface with real-time AI responses",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${poppins.variable} font-sans`}>
        <ErrorBoundary>
          <Navigation />
          <main className="min-h-[calc(100vh-4rem)] bg-dark-gradient">
            {children}
          </main>
        </ErrorBoundary>
      </body>
    </html>
  );
}