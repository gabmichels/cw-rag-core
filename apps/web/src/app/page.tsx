"use client";

import { useState } from "react";
import { AskResponse, IngestDocumentRequest, DocumentMetadata } from "@cw-rag-core/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

type IngestDocument = {
  meta: Omit<DocumentMetadata, 'tenantId'> & { tenant: string };
  text: string;
};

const samplePayload: IngestDocument = {
  meta: {
    tenant: "demo",
    docId: "sample-doc-1",
    acl: ["public"],
    title: "Sample Document",
    source: "manual",
  },
  text: "This is a sample document for testing the RAG system. It contains some basic content that can be retrieved through vector search.",
};

export default function Home() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);

  const handleIngest = async () => {
    setLoading(true);
    setError(null);
    setIngestStatus(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/ingest/normalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(samplePayload),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      setIngestStatus("Sample document seeded successfully!");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAsk = async () => {
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant: "demo",
          question: question,
          acl: ["public"],
          user: {
            id: "test-user",
            tenant: "demo",
            acl: ["public"],
            name: "Test User",
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      const data: AskResponse = await response.json();
      setAnswer(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-8">RAG UI Demo</h1>

      <button
        onClick={handleIngest}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mb-4"
        disabled={loading}
      >
        {loading && !ingestStatus ? "Seeding..." : "Seed Sample Doc"}
      </button>
      {ingestStatus && <p className="text-green-600 mb-4">{ingestStatus}</p>}
      {error && !ingestStatus && <p className="text-red-600 mb-4">Error: {error}</p>}

      <div className="w-full max-w-lg mb-8">
        <textarea
          className="w-full p-2 border border-gray-300 rounded mb-4"
          rows={4}
          placeholder="Ask a question..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        ></textarea>
        <button
          onClick={handleAsk}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded w-full"
          disabled={loading}
        >
          {loading && question ? "Asking..." : "Ask"}
        </button>
      </div>

      {loading && question && <p>Loading answer...</p>}
      {error && question && <p className="text-red-600">Error: {error}</p>}

      {answer && (
        <div className="w-full max-w-lg bg-white p-6 rounded shadow-md">
          <h2 className="text-2xl font-semibold mb-4">Answer:</h2>
          <p className="mb-4">{answer.answer}</p>

          <h3 className="text-xl font-semibold mb-2">Retrieved Documents:</h3>
          {answer.retrievedDocuments && answer.retrievedDocuments.length > 0 ? (
            <ul className="list-disc pl-5">
              {answer.retrievedDocuments.map((doc, index) => (
                <li key={index} className="mb-2">
                  <p className="font-medium">Title: {(doc.document.metadata?.title as string) ?? "N/A"}</p>
                  <p className="text-sm text-gray-700">Similarity: {doc.score?.toFixed(3)}</p>
                  <p className="text-sm text-gray-700">Source: {(doc.document.metadata?.source as string) ?? "N/A"}</p>
                  <p className="text-sm text-gray-700">Excerpt: {doc.document.content.substring(0, 150)}...</p>
                </li>
              ))}
            </ul>
          ) : (
            <p>No retrieved documents found.</p>
          )}
        </div>
      )}
    </div>
  );
}