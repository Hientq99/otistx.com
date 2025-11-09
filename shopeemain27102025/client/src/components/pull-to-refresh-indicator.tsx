import { Loader2, RefreshCw } from 'lucide-react';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  progress: number;
}

export const PullToRefreshIndicator = ({
  pullDistance,
  isRefreshing,
  progress
}: PullToRefreshIndicatorProps) => {
  if (pullDistance === 0 && !isRefreshing) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center pointer-events-none"
      style={{
        transform: `translateY(${Math.min(pullDistance, 80)}px)`,
        transition: isRefreshing ? 'transform 0.2s ease-out' : 'none'
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-full p-3 shadow-lg border border-gray-200 dark:border-gray-700">
        {isRefreshing ? (
          <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
        ) : (
          <RefreshCw
            className="h-5 w-5 text-blue-600 transition-transform duration-200"
            style={{
              transform: `rotate(${progress * 3.6}deg)` // 360 degrees at 100%
            }}
          />
        )}
      </div>
    </div>
  );
};
