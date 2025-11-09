import { useEffect } from 'react';
import { FixedHeader } from "@/components/fixed-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, RefreshCw, Plus, Keyboard } from "lucide-react";
import { ServiceSelector } from './ServiceSelector';
import { PricingSidebar } from './PricingSidebar';
import { ActiveSessions } from './ActiveSessions';
import { HistoryFilters } from './HistoryFilters';
import { HistoryDisplay } from './HistoryDisplay';
import { usePhoneRental } from './usePhoneRental';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { PullToRefreshIndicator } from '@/components/pull-to-refresh-indicator';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';

export const PhoneRentalPage = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  
  const {
    // Form state
    selectedService,
    selectedCarrier,
    setSelectedService,
    setSelectedCarrier,
    
    // Session state
    activeSessions,
    
    // History state
    historyData,
    rawHistoryData,
    historyLoading,
    filteredHistoryData,
    filters,
    totalPages,
    startIndex,
    endIndex,
    
    // Statistics
    successToday,
    
    // Loading states
    isStartingRental,
    
    // Handlers
    handleStartRental,
    handleCopyToClipboard,
    handleFiltersChange,
    handlePageChange,
    refreshHistory,
    
    // Refund functionality
    checkExpiredMutation
  } = usePhoneRental();
  
  // Pull-to-refresh for mobile
  const { isRefreshing, pullDistance, refreshIndicatorProgress } = usePullToRefresh({
    onRefresh: async () => {
      await refreshHistory();
      toast({
        title: "Đã làm mới",
        description: "Dữ liệu đã được cập nhật",
      });
    },
    enabled: isMobile
  });
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.ctrlKey || e.metaKey) {
        switch(e.key.toLowerCase()) {
          case 'r': // Ctrl+R - Refresh
            e.preventDefault();
            refreshHistory();
            toast({ title: "Đã làm mới lịch sử" });
            break;
          case 'n': // Ctrl+N - Scroll to form
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            toast({ title: "Đã chuyển đến form thuê số" });
            break;
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [refreshHistory, toast]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <FixedHeader />
      
      {/* Pull-to-refresh indicator */}
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        progress={refreshIndicatorProgress}
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Thuê số điện thoại Shopee</h1>
          <p className="text-sm sm:text-base text-gray-600">Thuê số tạm thời để nhận mã OTP đăng ký tài khoản Shopee</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-6">
          {/* Main Rental Form - Mobile-first responsive */}
          <div className="lg:col-span-3">
            <Card className="shadow-sm border-gray-200">
              <CardHeader className="pb-3 sm:pb-4">
                <CardTitle className="text-base sm:text-lg font-semibold">Tạo phiên thuê số mới</CardTitle>
                <CardDescription className="text-sm">Chọn dịch vụ và nhà mạng phù hợp</CardDescription>
              </CardHeader>
              <CardContent>
                <ServiceSelector
                  selectedService={selectedService}
                  selectedCarrier={selectedCarrier}
                  isLoading={isStartingRental}
                  onServiceChange={setSelectedService}
                  onCarrierChange={setSelectedCarrier}
                  onStartRental={handleStartRental}
                />
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Responsive */}
          <div className="space-y-4 lg:space-y-4">
            <PricingSidebar
              activeSessions={activeSessions.length}
              totalHistory={rawHistoryData.length}
              successToday={successToday}
            />
          </div>
        </div>

        {/* Active Sessions */}
        <ActiveSessions
          sessions={activeSessions}
          onCopyToClipboard={handleCopyToClipboard}
        />

        {/* History Section - Responsive */}
        <div className="mt-6 sm:mt-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-6 mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center">
              <History className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Lịch sử thuê số ({filteredHistoryData.length})
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshHistory}
              className="self-start sm:self-auto"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Làm mới
            </Button>
          </div>

          {/* Filters */}
          <HistoryFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
          />

          {/* History Display */}
          <HistoryDisplay
            sessions={historyData}
            isLoading={historyLoading}
            filters={filters}
            totalPages={totalPages}
            startIndex={startIndex}
            endIndex={endIndex}
            onCopyToClipboard={handleCopyToClipboard}
            onPageChange={handlePageChange}
          />
        </div>
        
        {/* Floating Action Button for mobile */}
        {isMobile && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-20 right-4 z-40 bg-gradient-to-r from-orange-500 to-red-500 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 active:scale-95"
            aria-label="Thuê số mới"
            data-testid="fab-new-rental"
          >
            <Plus className="h-6 w-6" />
          </button>
        )}
        
        {/* Keyboard shortcuts hint */}
        {!isMobile && (
          <div className="fixed bottom-4 right-4 z-30 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
            <Keyboard className="h-3 w-3" />
            <span>Ctrl+R: Làm mới | Ctrl+N: Form mới</span>
          </div>
        )}
      </div>
    </div>
  );
};