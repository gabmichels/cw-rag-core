"use client";

interface GuardrailDecision {
  isAnswerable: boolean;
  confidence: number;
  reasonCode?: string;
  suggestions?: string[];
}

interface IDontKnowCardProps {
  guardrailDecision: GuardrailDecision;
  query: string;
}

export default function IDontKnowCard({ guardrailDecision, query }: IDontKnowCardProps) {
  const getReasonMessage = (reasonCode?: string) => {
    switch (reasonCode) {
      case 'LOW_CONFIDENCE':
        return 'The system has low confidence in providing an accurate answer based on the available documents.';
      case 'NO_RELEVANT_DOCS':
        return 'No relevant documents were found in the knowledge base for this query.';
      case 'INSUFFICIENT_CONTEXT':
        return 'The available documents do not contain sufficient context to answer this question.';
      case 'OUT_OF_SCOPE':
        return 'This question appears to be outside the scope of the available knowledge base.';
      case 'AMBIGUOUS_QUERY':
        return 'The question is too ambiguous to provide a specific answer.';
      default:
        return 'The system cannot provide a reliable answer for this query.';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence < 0.3) return 'bg-red-100 text-red-800 border-red-200';
    if (confidence < 0.6) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-orange-100 text-orange-800 border-orange-200';
  };

  const getSuggestionTips = () => {
    return [
      'Try rephrasing your question with more specific terms',
      'Break down complex questions into simpler parts',
      'Check if your question relates to the available documents',
      'Use different keywords or synonyms',
      'Be more specific about what you\'re looking for',
    ];
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-orange-50">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">🤷</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">I Don't Know</h2>
            <p className="text-sm text-gray-600">
              Unable to provide a confident answer for this query
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-4">
        {/* Query Display */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Your Question:</h3>
          <p className="text-gray-900 italic">"{query}"</p>
        </div>

        {/* Reason */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Reason:</h3>
          <p className="text-gray-800 leading-relaxed">
            {getReasonMessage(guardrailDecision.reasonCode)}
          </p>
        </div>

        {/* Confidence Score */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Confidence Score:</span>
          <span
            className={`
              px-3 py-1 text-sm font-medium rounded-full border
              ${getConfidenceColor(guardrailDecision.confidence)}
            `}
          >
            {Math.round(guardrailDecision.confidence * 100)}%
          </span>
        </div>

        {/* Custom Suggestions from Guardrail */}
        {guardrailDecision.suggestions && guardrailDecision.suggestions.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Suggestions:</h3>
            <ul className="space-y-2">
              {guardrailDecision.suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <span className="flex-shrink-0 w-4 h-4 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                    {index + 1}
                  </span>
                  <span className="text-gray-800">{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* General Tips */}
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">💡 Tips for Better Results:</h3>
          <ul className="space-y-2">
            {getSuggestionTips().map((tip, index) => (
              <li key={index} className="flex items-start space-x-2">
                <span className="flex-shrink-0 text-gray-400 mt-1">•</span>
                <span className="text-sm text-gray-600">{tip}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
          <button
            onClick={() => window.location.reload()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium text-sm"
          >
            🔄 Try Again
          </button>
          <button
            onClick={() => {
              const mailto = `mailto:support@example.com?subject=Question Not Answered&body=Query: ${encodeURIComponent(query)}%0A%0AReason: ${encodeURIComponent(getReasonMessage(guardrailDecision.reasonCode))}`;
              window.location.href = mailto;
            }}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 font-medium text-sm border border-gray-300"
          >
            📧 Contact Support
          </button>
        </div>

        {/* Debug Info */}
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
            🔧 Debug Information
          </summary>
          <div className="mt-2 p-3 bg-gray-50 rounded text-xs font-mono">
            <div>Reason Code: {guardrailDecision.reasonCode || 'UNKNOWN'}</div>
            <div>Confidence: {guardrailDecision.confidence.toFixed(4)}</div>
            <div>Answerable: {guardrailDecision.isAnswerable.toString()}</div>
          </div>
        </details>
      </div>
    </div>
  );
}