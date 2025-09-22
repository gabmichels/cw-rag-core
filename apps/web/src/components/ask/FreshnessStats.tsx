"use client";

import { FreshnessStats as FreshnessStatsType } from '@cw-rag-core/shared';

interface FreshnessStatsProps {
  stats: FreshnessStatsType;
}

export default function FreshnessStats({ stats }: FreshnessStatsProps) {
  if (stats.totalDocuments === 0) {
    return null;
  }

  const getPercentageColor = (percentage: number, type: 'fresh' | 'recent' | 'stale') => {
    if (type === 'fresh') {
      return percentage > 50 ? 'text-green-700' : percentage > 25 ? 'text-green-600' : 'text-green-500';
    }
    if (type === 'recent') {
      return percentage > 50 ? 'text-yellow-700' : percentage > 25 ? 'text-yellow-600' : 'text-yellow-500';
    }
    // stale
    return percentage > 50 ? 'text-red-700' : percentage > 25 ? 'text-red-600' : 'text-red-500';
  };

  const formatPercentage = (percentage: number) => {
    return percentage.toFixed(1) + '%';
  };

  const formatAverageAge = (averageAge: number) => {
    if (averageAge < 1) return 'Less than 1 day';
    if (averageAge === 1) return '1 day';
    if (averageAge < 7) return `${Math.round(averageAge)} days`;
    if (averageAge < 30) return `${Math.round(averageAge / 7)} weeks`;
    if (averageAge < 365) return `${Math.round(averageAge / 30)} months`;
    return `${Math.round(averageAge / 365)} years`;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2">
          <span>📊</span>
          <h3 className="text-lg font-semibold text-gray-900">Document Freshness</h3>
          <span className="text-sm text-gray-500">
            ({stats.totalDocuments} documents analyzed)
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Fresh Documents */}
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-700">
                  {stats.freshCount}
                </div>
                <div className="text-sm text-green-600 font-medium">Fresh 🟢</div>
              </div>
              <div className={`text-lg font-semibold ${getPercentageColor(stats.freshPercentage, 'fresh')}`}>
                {formatPercentage(stats.freshPercentage)}
              </div>
            </div>
            <div className="mt-2 text-xs text-green-600">
              Recently updated content
            </div>
          </div>

          {/* Recent Documents */}
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-yellow-700">
                  {stats.recentCount}
                </div>
                <div className="text-sm text-yellow-600 font-medium">Recent 🟡</div>
              </div>
              <div className={`text-lg font-semibold ${getPercentageColor(stats.recentPercentage, 'recent')}`}>
                {formatPercentage(stats.recentPercentage)}
              </div>
            </div>
            <div className="mt-2 text-xs text-yellow-600">
              Moderately current content
            </div>
          </div>

          {/* Stale Documents */}
          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-700">
                  {stats.staleCount}
                </div>
                <div className="text-sm text-red-600 font-medium">Stale 🔴</div>
              </div>
              <div className={`text-lg font-semibold ${getPercentageColor(stats.stalePercentage, 'stale')}`}>
                {formatPercentage(stats.stalePercentage)}
              </div>
            </div>
            <div className="mt-2 text-xs text-red-600">
              Potentially outdated content
            </div>
          </div>

          {/* Average Age */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-blue-700">
                  {formatAverageAge(stats.averageAge)}
                </div>
                <div className="text-sm text-blue-600 font-medium">Average Age</div>
              </div>
              <div className="text-2xl">
                📅
              </div>
            </div>
            <div className="mt-2 text-xs text-blue-600">
              Across all sources
            </div>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>Freshness Distribution</span>
            <span>{stats.totalDocuments} total documents</span>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div className="h-full flex">
              {/* Fresh segment */}
              <div
                className="bg-green-500 h-full"
                style={{ width: `${stats.freshPercentage}%` }}
                title={`Fresh: ${formatPercentage(stats.freshPercentage)} (${stats.freshCount} docs)`}
              />
              {/* Recent segment */}
              <div
                className="bg-yellow-500 h-full"
                style={{ width: `${stats.recentPercentage}%` }}
                title={`Recent: ${formatPercentage(stats.recentPercentage)} (${stats.recentCount} docs)`}
              />
              {/* Stale segment */}
              <div
                className="bg-red-500 h-full"
                style={{ width: `${stats.stalePercentage}%` }}
                title={`Stale: ${formatPercentage(stats.stalePercentage)} (${stats.staleCount} docs)`}
              />
            </div>
          </div>

          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Quality Indicator */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700">Content Quality:</span>
            {stats.freshPercentage + stats.recentPercentage >= 70 ? (
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                ✅ High Quality
              </span>
            ) : stats.freshPercentage + stats.recentPercentage >= 40 ? (
              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                ⚠️ Moderate Quality
              </span>
            ) : (
              <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                ❌ Consider Updating
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Based on the proportion of fresh and recent content in your sources
          </p>
        </div>
      </div>
    </div>
  );
}