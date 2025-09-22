"use client";

import { AskResponse } from '@cw-rag-core/shared';

interface IDontKnowCardProps {
  guardrailDecision: NonNullable<AskResponse['guardrailDecision']>;
  query: string;
}

export default function IDontKnowCard({ guardrailDecision, query }: IDontKnowCardProps) {
  const confidence = guardrailDecision.confidence || 0;
  const reasonCode = guardrailDecision.reasonCode;
  const suggestions = guardrailDecision.suggestions || [];

  const getReasonMessage = (code?: string) => {
    switch (code) {
      case 'NO_RELEVANT_DOCS':
        return 'No relevant documents found in the knowledge base.';
      case 'LOW_CONFIDENCE':
        return 'The available information is not sufficient to provide a confident answer.';
      case 'POOR_RETRIEVAL_SCORES':
        return 'The retrieved documents do not contain relevant information for this query.';
      case 'CONTEXT_INSUFFICIENT':
        return 'The context provided is insufficient to generate a reliable answer.';
      default:
        return 'Unable to provide a reliable answer based on the available information.';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="flex items-center p-4 border-b border-gray-100">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <span className="text-orange-600 text-xl">🤔</span>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">I don't know</h2>
            <p className="text-sm text-gray-600">
              Confidence: {Math.round(confidence * 100)}% (below threshold)
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Your question */}
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Your question:</h3>
          <div className="bg-gray-50 p-3 rounded border-l-4 border-blue-400">
            <p className="text-gray-800 italic">"{query}"</p>
          </div>
        </div>

        {/* Reason */}
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Why I can't answer:</h3>
          <div className="bg-orange-50 p-3 rounded border-l-4 border-orange-400">
            <p className="text-gray-700">{getReasonMessage(reasonCode)}</p>
          </div>
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Suggestions:</h3>
            <ul className="bg-blue-50 p-3 rounded border-l-4 border-blue-400 space-y-1">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="text-gray-700 flex items-start">
                  <span className="text-blue-600 mr-2">•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Algorithm details */}
        {guardrailDecision.algorithmScores && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <details className="group">
              <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">
                <span className="group-open:hidden">Show technical details ↓</span>
                <span className="hidden group-open:inline">Hide technical details ↑</span>
              </summary>
              <div className="mt-3 text-xs text-gray-600 space-y-2">
                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
                  <div>
                    <span className="font-medium">Statistical Score:</span>
                    <span className="ml-2">{guardrailDecision.algorithmScores.statistical.toFixed(3)}</span>
                  </div>
                  <div>
                    <span className="font-medium">Threshold Score:</span>
                    <span className="ml-2">{guardrailDecision.algorithmScores.threshold.toFixed(3)}</span>
                  </div>
                  <div>
                    <span className="font-medium">ML Features:</span>
                    <span className="ml-2">{guardrailDecision.algorithmScores.mlFeatures.toFixed(3)}</span>
                  </div>
                  {guardrailDecision.algorithmScores.rerankerConfidence && (
                    <div>
                      <span className="font-medium">Reranker Confidence:</span>
                      <span className="ml-2">{guardrailDecision.algorithmScores.rerankerConfidence.toFixed(3)}</span>
                    </div>
                  )}
                </div>

                {guardrailDecision.scoreStats && (
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="font-medium mb-2">Score Statistics:</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>Mean: {guardrailDecision.scoreStats.mean.toFixed(3)}</div>
                      <div>Max: {guardrailDecision.scoreStats.max.toFixed(3)}</div>
                      <div>Min: {guardrailDecision.scoreStats.min.toFixed(3)}</div>
                      <div>Std Dev: {guardrailDecision.scoreStats.stdDev.toFixed(3)}</div>
                    </div>
                  </div>
                )}
              </div>
            </details>
          </div>
        )}

        {/* Help text */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-blue-900 mb-2">💡 Tips for better results:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Try rephrasing your question with different keywords</li>
              <li>• Be more specific about what you're looking for</li>
              <li>• Check if the information exists in your knowledge base</li>
              <li>• Consider breaking complex questions into simpler parts</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}