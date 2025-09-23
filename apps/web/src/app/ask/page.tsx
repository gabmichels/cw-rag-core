"use client";

import ChatContainer from '@/components/ask/ChatContainer';

export default function AskPage() {
  return (
    <div className="h-[calc(100vh-4rem)]">
      <ChatContainer
        placeholder="Ask me anything about your documents..."
        welcomeMessage="👋 Welcome to the modern RAG interface! Ask me anything about your documents and I'll provide real-time streaming answers with citations."
      />
    </div>
  );
}