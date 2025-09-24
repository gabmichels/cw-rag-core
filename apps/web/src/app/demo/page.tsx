"use client";

import { useState } from 'react';
import { AskResponse } from '@cw-rag-core/shared';
import AnswerDisplay from '@/components/ask/AnswerDisplay';
import CitationsList from '@/components/ask/CitationsList';
import RawChunksToggle from '@/components/ask/RawChunksToggle';
import IDontKnowCard from '@/components/ask/IDontKnowCard';
import FreshnessStats from '@/components/ask/FreshnessStats';

// Mock data for demonstrating UI features
const mockHighConfidenceResponse: AskResponse = {
  answer: "Machine learning is a subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed [1]. It works by using algorithms to analyze data, identify patterns, and make predictions or decisions [2]. The process typically involves training a model on historical data, then using that trained model to make predictions on new, unseen data [3].",
  retrievedDocuments: [
    {
      document: {
        id: "doc1",
        content: "Machine learning (ML) is a type of artificial intelligence (AI) that allows software applications to become more accurate at predicting outcomes without being explicitly programmed to do so. Machine learning algorithms use historical data as input to predict new output values.",
        metadata: {
          tenantId: "550e8400-e29b-41d4-a716-446655440001",
          docId: "ml-basics-2024",
          version: "1.2",
          filepath: "/docs/ai/machine-learning-basics.md",
          authors: ["Dr. Sarah Chen", "Prof. Michael Rodriguez"],
          acl: ["public"],
          modifiedAt: "2024-01-15T10:30:00Z",
          createdAt: "2024-01-10T09:00:00Z"
        }
      },
      score: 0.92,
      searchType: "hybrid" as const,
      vectorScore: 0.89,
      keywordScore: 0.85,
      fusionScore: 0.92,
      rerankerScore: 0.94,
      rank: 1,
      freshness: {
        category: "Stale" as const,
        badge: "🔴 Stale",
        ageInDays: 250,
        humanReadable: "8 months ago",
        timestamp: "2024-01-15T10:30:00Z"
      }
    },
    {
      document: {
        id: "doc2",
        content: "The machine learning process involves several key steps: data collection, data preprocessing, model selection, training, evaluation, and deployment. During training, algorithms analyze patterns in the data to build mathematical models.",
        metadata: {
          tenantId: "550e8400-e29b-41d4-a716-446655440001",
          docId: "ml-process-guide",
          version: "2.1",
          filepath: "/guides/ml-workflow.md",
          authors: ["Alex Kim"],
          acl: ["public"],
          modifiedAt: "2025-09-20T14:20:00Z",
          createdAt: "2025-09-15T12:00:00Z"
        }
      },
      score: 0.87,
      searchType: "hybrid" as const,
      vectorScore: 0.83,
      keywordScore: 0.91,
      fusionScore: 0.87,
      rerankerScore: 0.89,
      rank: 2,
      freshness: {
        category: "Fresh" as const,
        badge: "🟢 Fresh",
        ageInDays: 2,
        humanReadable: "2 days ago",
        timestamp: "2025-09-20T14:20:00Z"
      }
    },
    {
      document: {
        id: "doc3",
        content: "Data is the foundation of machine learning. Quality data leads to better model performance. The model learns from training data to make predictions on new data points.",
        metadata: {
          tenantId: "550e8400-e29b-41d4-a716-446655440001",
          docId: "data-importance",
          version: "1.0",
          filepath: "/tutorials/data-quality.md",
          authors: ["Jennifer Walsh"],
          acl: ["public"],
          modifiedAt: "2025-08-25T16:45:00Z",
          createdAt: "2025-08-20T11:30:00Z"
        }
      },
      score: 0.75,
      searchType: "vector_only" as const,
      vectorScore: 0.75,
      fusionScore: 0.75,
      rank: 3,
      freshness: {
        category: "Recent" as const,
        badge: "🟡 Recent",
        ageInDays: 28,
        humanReadable: "4 weeks ago",
        timestamp: "2025-08-25T16:45:00Z"
      }
    }
  ],
  queryId: "demo-query-12345",
  guardrailDecision: {
    isAnswerable: true,
    confidence: 0.85,
    reasonCode: "HIGH_CONFIDENCE",
    scoreStats: {
      mean: 0.78,
      max: 0.94,
      min: 0.62,
      stdDev: 0.12,
      count: 3
    },
    algorithmScores: {
      statistical: 0.82,
      threshold: 0.79,
      mlFeatures: 0.88,
      rerankerConfidence: 0.91
    }
  },
  freshnessStats: {
    totalDocuments: 3,
    freshCount: 1,
    recentCount: 1,
    staleCount: 1,
    freshPercentage: 33.3,
    recentPercentage: 33.3,
    stalePercentage: 33.3,
    avgAgeInDays: 93
  },
  citations: [
    {
      id: "citation-1",
      number: 1,
      source: "ML Basics Guide",
      docId: "ml-basics-2024",
      version: "1.2",
      filepath: "/docs/ai/machine-learning-basics.md",
      authors: ["Dr. Sarah Chen", "Prof. Michael Rodriguez"],
      freshness: {
        category: "Stale" as const,
        badge: "🔴 Stale",
        ageInDays: 250,
        humanReadable: "8 months ago",
        timestamp: "2024-01-15T10:30:00Z"
      }
    },
    {
      id: "citation-2",
      number: 2,
      source: "ML Process Guide",
      docId: "ml-process-guide",
      version: "2.1",
      filepath: "/guides/ml-workflow.md",
      authors: ["Alex Kim"],
      freshness: {
        category: "Fresh" as const,
        badge: "🟢 Fresh",
        ageInDays: 2,
        humanReadable: "2 days ago",
        timestamp: "2025-09-20T14:20:00Z"
      }
    },
    {
      id: "citation-3",
      number: 3,
      source: "Data Quality Tutorial",
      docId: "data-importance",
      version: "1.0",
      filepath: "/tutorials/data-quality.md",
      authors: ["Jennifer Walsh"],
      freshness: {
        category: "Recent" as const,
        badge: "🟡 Recent",
        ageInDays: 28,
        humanReadable: "4 weeks ago",
        timestamp: "2025-08-25T16:45:00Z"
      }
    }
  ]
};

const mockLowConfidenceResponse: AskResponse = {
  answer: "I don't have enough confidence in the available information to provide a reliable answer to your question.",
  retrievedDocuments: [],
  queryId: "demo-idk-query-67890",
  guardrailDecision: {
    isAnswerable: false,
    confidence: 0.25,
    reasonCode: "LOW_CONFIDENCE",
    suggestions: [
      "Try rephrasing your question with more specific keywords",
      "Check if the information exists in your knowledge base",
      "Consider breaking your question into smaller, more focused parts"
    ],
    scoreStats: {
      mean: 0.15,
      max: 0.42,
      min: 0.03,
      stdDev: 0.18,
      count: 5
    },
    algorithmScores: {
      statistical: 0.12,
      threshold: 0.08,
      mlFeatures: 0.31,
      rerankerConfidence: 0.19
    }
  }
};

export default function DemoPage() {
  const [selectedDemo, setSelectedDemo] = useState<'high' | 'low'>('high');
  const [selectedCitationId, setSelectedCitationId] = useState<string>();
  const [showRawChunks, setShowRawChunks] = useState(false);

  const currentResponse = selectedDemo === 'high' ? mockHighConfidenceResponse : mockLowConfidenceResponse;
  const isIDontKnow = currentResponse.guardrailDecision?.isAnswerable === false;

  const handleCitationClick = (citationId: string) => {
    setSelectedCitationId(citationId);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">UI Demo - Answer Page</h1>
        <p className="text-gray-600">
          Demonstrating citation chips, freshness badges, confidence indicators, and chunk toggles
        </p>
      </div>

      {/* Demo Controls */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Demo Controls</h2>
        <div className="flex space-x-4">
          <button
            onClick={() => setSelectedDemo('high')}
            className={`px-4 py-2 rounded-lg border transition-all ${
              selectedDemo === 'high'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            High Confidence Response
          </button>
          <button
            onClick={() => setSelectedDemo('low')}
            className={`px-4 py-2 rounded-lg border transition-all ${
              selectedDemo === 'low'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Low Confidence (IDK) Response
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-6">
        {/* Freshness Statistics */}
        {currentResponse.freshnessStats && (
          <FreshnessStats stats={currentResponse.freshnessStats} />
        )}

        {/* Answer or "I Don't Know" */}
        {isIDontKnow ? (
          <IDontKnowCard
            guardrailDecision={currentResponse.guardrailDecision!}
            query="What is quantum computing and how does it differ from classical computing?"
          />
        ) : (
          <AnswerDisplay
            answer={currentResponse.answer}
            citations={currentResponse.citations}
            queryId={currentResponse.queryId}
            guardrailDecision={currentResponse.guardrailDecision}
            onCitationClick={handleCitationClick}
          />
        )}

        {/* Citations */}
        {currentResponse.citations && currentResponse.citations.length > 0 && (
          <CitationsList
            citations={currentResponse.citations}
            retrievedDocuments={currentResponse.retrievedDocuments}
            selectedCitationId={selectedCitationId}
          />
        )}

        {/* Raw Retrieved Chunks */}
        <RawChunksToggle
          retrievedDocuments={currentResponse.retrievedDocuments}
          show={showRawChunks}
          onToggle={setShowRawChunks}
        />
      </div>

      {/* Feature Checklist */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">✅ Implemented Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center space-x-2">
            <span className="text-green-600">✅</span>
            <span>Citation chips (title/docId/version)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-green-600">✅</span>
            <span>Click-to-scroll functionality</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-green-600">✅</span>
            <span>Freshness badges (Fresh/Recent/Stale)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-green-600">✅</span>
            <span>Confidence visualization (High/Med/Low)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-green-600">✅</span>
            <span>Retrieved chunks toggle</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-green-600">✅</span>
            <span>IDK card styling</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-green-600">✅</span>
            <span>Streaming/non-streaming support</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-green-600">✅</span>
            <span>Responsive design</span>
          </div>
        </div>
      </div>
    </div>
  );
}