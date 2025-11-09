import { useEffect, useRef, useState } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  maxPullDistance?: number;
  enabled?: boolean;
}

export const usePullToRefresh = ({
  onRefresh,
  threshold = 80,
  maxPullDistance = 120,
  enabled = true
}: UsePullToRefreshOptions) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef(0);
  const scrollableElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Only trigger if we're at the top of the page
      if (window.scrollY === 0 || (scrollableElement.current && scrollableElement.current.scrollTop === 0)) {
        touchStartY.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isRefreshing) return;

      const touchY = e.touches[0].clientY;
      const pullDist = touchY - touchStartY.current;

      // Only pull down if we're at the top
      if (pullDist > 0 && (window.scrollY === 0 || (scrollableElement.current && scrollableElement.current.scrollTop === 0))) {
        e.preventDefault();
        const distance = Math.min(pullDist * 0.5, maxPullDistance); // Apply resistance
        setPullDistance(distance);
      }
    };

    const handleTouchEnd = async () => {
      if (pullDistance >= threshold && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(threshold); // Lock at threshold while refreshing
        
        try {
          await onRefresh();
        } catch (error) {
          console.error('Refresh error:', error);
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, isRefreshing, pullDistance, threshold, maxPullDistance, onRefresh]);

  const refreshIndicatorProgress = Math.min((pullDistance / threshold) * 100, 100);

  return {
    isRefreshing,
    pullDistance,
    refreshIndicatorProgress,
    setScrollableElement: (el: HTMLElement | null) => {
      scrollableElement.current = el;
    }
  };
};
