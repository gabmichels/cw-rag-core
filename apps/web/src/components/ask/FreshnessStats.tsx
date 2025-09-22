"use client";

import type { FreshnessStats } from '@cw-rag-core/shared';

interface FreshnessStatsProps {
  stats: FreshnessStats;
}

function StatCard({
  title,
  count,
  percentage,
  color,
  bgColor
}: {
  title: string;
  count: number;
  percentage: number;
  color: string;
  bgColor: string;
}) {
  return (
    <div className={`${bgColor} rounded-lg p-4 border`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className={`text-sm font-medium ${color}`}>{title}</h3>
          <div className="mt-1">
            <span className={`text-2xl font-bold ${color}`}>{count}</span>
            <span className="text-sm text-gray-600 ml-2">
              ({percentage.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div className={`text-2xl opacity-60`}>
          {title === 'Fresh' && '🟢'}
          {title === 'Recent' && '🟡'}
          {title === 'Stale' && '🔴'}
        </div>
      </div>
    </div>
  );
}

export default function FreshnessStats({ stats }: FreshnessStatsProps) {
  if (stats.totalDocuments === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">Source Freshness</h2>
        <p className="text-sm text-gray-600 mt-1">
          Document age distribution from {stats.totalDocuments} retrieved sources
        </p>
      </div>

      <div className="p-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <StatCard
            title="Fresh"
            count={stats.freshCount}
            percentage={stats.freshPercentage}
            color="text-green-700"
            bgColor="bg-green-50 border-green-200"
          />
          <StatCard
            title="Recent"
            count={stats.recentCount}
            percentage={stats.recentPercentage}
            color="text-yellow-700"
            bgColor="bg-yellow-50 border-yellow-200"
          />
          <StatCard
            title="Stale"
            count={stats.staleCount}
            percentage={stats.stalePercentage}
            color="text-red-700"
            bgColor="bg-red-50 border-red-200"
          />
        </div>

        {/* Visual Progress Bar */}
        <div className="mb-4">
          <div className="flex text-xs text-gray-600 mb-2">
            <span>Freshness Distribution</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            {stats.freshPercentage > 0 && (
              <div
                className="bg-green-500 h-full float-left"
                style={{ width: `${stats.freshPercentage}%` }}
                title={`Fresh: ${stats.freshCount} documents (${stats.freshPercentage.toFixed(1)}%)`}
              />
            )}
            {stats.recentPercentage > 0 && (
              <div
                className="bg-yellow-500 h-full float-left"
                style={{ width: `${stats.recentPercentage}%` }}
                title={`Recent: ${stats.recentCount} documents (${stats.recentPercentage.toFixed(1)}%)`}
              />
            )}
            {stats.stalePercentage > 0 && (
              <div
                className="bg-red-500 h-full float-left"
                style={{ width: `${stats.stalePercentage}%` }}
                title={`Stale: ${stats.staleCount} documents (${stats.stalePercentage.toFixed(1)}%)`}
              />
            )}
          </div>
        </div>

        {/* Average Age */}
        <div className="text-sm text-gray-600">
          <span className="font-medium">Average document age:</span>
          <span className="ml-2">
            {stats.averageAge < 1
              ? 'Less than 1 day'
              : stats.averageAge === 1
                ? '1 day'
                : `${Math.round(stats.averageAge)} days`
            }
          </span>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex flex-wrap gap-4 text-xs text-gray-600">
            <div className="flex items-center space-x-1">
              <span>🟢</span>
              <span>Fresh: ≤7 days</span>
            </div>
            <div className="flex items-center space-x-1">
              <span>🟡</span>
              <span>Recent: ≤30 days</span>
            </div>
            <div className="flex items-center space-x-1">
              <span>🔴</span>
              <span>Stale: {'>'}30 days</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}