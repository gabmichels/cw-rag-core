"use client";

import { useState } from 'react';
import { AskResponse, AskRequest } from '@cw-rag-core/shared';
import { handleApiResponse, APIError } from '@/utils/api';
import QuestionInput from '@/components/ask/QuestionInput';
import AnswerDisplay from '@/components/ask/AnswerDisplay';
import CitationsList from '@/components/ask/CitationsList';
import RawChunksToggle from '@/components/ask/RawChunksToggle';
import IDontKnowCard from '@/components/ask/IDontKnowCard';
import FreshnessStats from '@/components/ask/FreshnessStats';

interface AskPageState {
  query: string;
  response: AskResponse | null;
  loading: boolean;
  error: string | null;
  showRawChunks: boolean;
  selectedCitationId?: string;
  docId: string; // Add docId to state
}

export default function AskPage() {
  const [state, setState] = useState<AskPageState>({
    query: '',
    response: null,
    loading: false,
    error: null,
    showRawChunks: false,
    selectedCitationId: undefined,
    docId: '', // Default value for docId
  });

  const handleSearch = async (query: string) => {
    if (!query.trim()) return;

    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      response: null,
    }));

    try {
      const askRequest: AskRequest = {
        query: query.trim(),
        userContext: {
          id: 'anonymous',
          tenantId: 'zenithfall', // Updated tenantId
          groupIds: ['public'], // Updated groupIds
        },
        k: 10,
        ...(state.docId.trim() && { docId: state.docId.trim() }),
      };

      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(askRequest),
      });

      const result = await handleApiResponse<AskResponse>(response);

      setState(prev => ({
        ...prev,
        response: result,
        loading: false,
        query,
      }));
    } catch (error) {
      console.error('Ask API error:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof APIError ? error.message : 'Failed to get answer',
        loading: false,
      }));
    }
  };

  const handleCitationClick = (citationId: string) => {
    setState(prev => ({ ...prev, selectedCitationId: citationId }));
  };

  const isIDontKnow = state.response?.guardrailDecision?.isAnswerable === false;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Ask a Question</h1>
        <p className="text-gray-600">
          Get answers from your knowledge base with citations and freshness indicators
        </p>
      </div>

      {/* Document ID Input */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <label htmlFor="docId" className="block text-sm font-medium text-gray-700">
          Document ID (Optional, for specific document queries)
        </label>
        <input
          type="text"
          id="docId"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
          value={state.docId}
          onChange={(e) => setState(prev => ({ ...prev, docId: e.target.value }))}
          placeholder="e.g., my-specific-document-id"
        />
      </div>

      {/* Question Input */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <QuestionInput
          onSearch={handleSearch}
          loading={state.loading}
          initialValue={state.query}
        />
      </div>

      {/* Error Display */}
      {state.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-red-500 mr-2">❌</span>
            <span className="text-red-700 font-medium">Error</span>
          </div>
          <p className="text-red-600 mt-1">{state.error}</p>
        </div>
      )}

      {/* Results */}
      {state.response && (
        <div className="space-y-6">
          {/* Freshness Statistics */}
          {state.response.freshnessStats && (
            <FreshnessStats stats={state.response.freshnessStats} />
          )}

          {/* Answer or "I Don't Know" */}
          {isIDontKnow ? (
            <IDontKnowCard
              guardrailDecision={state.response.guardrailDecision!}
              query={state.query}
            />
          ) : (
            <AnswerDisplay
              answer={state.response.answer}
              citations={state.response.citations}
              queryId={state.response.queryId}
              guardrailDecision={state.response.guardrailDecision}
              onCitationClick={handleCitationClick}
            />
          )}

          {/* Citations */}
          {state.response.citations && state.response.citations.length > 0 && (
            <CitationsList
              citations={state.response.citations}
              retrievedDocuments={state.response.retrievedDocuments}
              selectedCitationId={state.selectedCitationId}
            />
          )}

          {/* Raw Retrieved Chunks */}
          <RawChunksToggle
            retrievedDocuments={state.response.retrievedDocuments}
            show={state.showRawChunks}
            onToggle={(show: boolean) => setState(prev => ({ ...prev, showRawChunks: show }))}
          />
        </div>
      )}
    </div>
  );
}