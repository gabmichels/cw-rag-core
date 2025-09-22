"use client";

import { useState, FormEvent, KeyboardEvent } from 'react';

interface QuestionInputProps {
  onSearch: (query: string) => void;
  loading: boolean;
  initialValue?: string;
}

export default function QuestionInput({ onSearch, loading, initialValue = '' }: QuestionInputProps) {
  const [query, setQuery] = useState(initialValue);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (query.trim() && !loading) {
      onSearch(query.trim());
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (query.trim() && !loading) {
        onSearch(query.trim());
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="question" className="block text-sm font-medium text-gray-700 mb-2">
          Ask a question about your documents
        </label>
        <textarea
          id="question"
          name="question"
          rows={3}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What would you like to know? Press Enter to search or Shift+Enter for new line..."
          disabled={loading}
          autoFocus
          className={`
            w-full px-4 py-3 border border-gray-300 rounded-lg
            focus:ring-2 focus:ring-blue-500 focus:border-transparent
            resize-none text-gray-900 placeholder-gray-500
            disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
            transition-colors duration-200
          `}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {query.length > 0 && (
            <span>{query.length} characters</span>
          )}
        </div>

        <button
          type="submit"
          disabled={!query.trim() || loading}
          className={`
            px-6 py-2 rounded-lg font-medium text-sm transition-all duration-200
            flex items-center space-x-2
            ${
              query.trim() && !loading
                ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Searching...</span>
            </>
          ) : (
            <>
              <span>🔍</span>
              <span>Search</span>
            </>
          )}
        </button>
      </div>

      {loading && (
        <div className="text-center py-4">
          <div className="inline-flex items-center space-x-2 text-gray-600">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Processing your question...</span>
          </div>
        </div>
      )}
    </form>
  );
}