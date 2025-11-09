import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RentalSession, HistorySession, FilterState, ServiceType } from './types';
import { DEFAULT_FILTER_STATE, POLLING_INTERVAL, HISTORY_REFRESH_INTERVAL, EXPIRED_CHECK_INTERVAL } from './constants';
import { 
  filterHistoryBySearch, 
  filterHistoryByDate, 
  paginateData, 
  copyToClipboard 
} from './utils';
import { notifyOtpSuccess } from '@/lib/notifications';
import confetti from 'canvas-confetti';

export const usePhoneRental = () => {
  const { toast } = useToast();
  
  // Form state
  const [selectedService, setSelectedService] = useState<ServiceType>('otissim_v3');
  const [selectedCarrier, setSelectedCarrier] = useState<string>('');
  
  // Session state
  const [activeSessions, setActiveSessions] = useState<RentalSession[]>([]);
  const [pollingSessions, setPollingSessions] = useState<Set<string>>(new Set());
  
  // Filter state
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);

  // Get current user info for cache isolation
  const { data: currentUser } = useQuery({ queryKey: ["/api/auth/me"] });
  const userId = currentUser?.id;

  // Load active sessions from database with user-specific cache
  const { data: activeSessionsFromDB } = useQuery({
    queryKey: ["/api/phone-rental/active-sessions", userId],
    refetchInterval: POLLING_INTERVAL,
    enabled: !!userId
  });

  // Load complete history with user-specific cache
  const { data: historyData = [], isLoading: historyLoading } = useQuery<HistorySession[]>({
    queryKey: ["/api/phone-rental-history", userId],
    refetchInterval: HISTORY_REFRESH_INTERVAL,
    enabled: !!userId
  });

  // Restore sessions from database
  useEffect(() => {
    if (Array.isArray(activeSessionsFromDB) && activeSessionsFromDB.length > 0) {
      const restoredSessions = activeSessionsFromDB.map((dbSession: any) => ({
        id: dbSession.sessionId,
        service: dbSession.service,
        carrier: dbSession.carrier,
        phoneNumber: dbSession.phoneNumber,
        status: dbSession.status,
        cost: dbSession.cost,
        startTime: dbSession.startTime,
        expiresAt: dbSession.expiresAt,
        sessionData: { sessionId: dbSession.sessionId }
      }));
      
      setActiveSessions(restoredSessions);
      const activeSessionIds = restoredSessions.map((s: any) => s.id);
      setPollingSessions(new Set(activeSessionIds));
    } else if (activeSessionsFromDB && !Array.isArray(activeSessionsFromDB)) {
      setActiveSessions([]);
      setPollingSessions(new Set());
    }
  }, [activeSessionsFromDB]);

  // Start rental session mutation
  const startRentalMutation = useMutation({
    mutationFn: async (data: { service: string; carrier: string }) => {
      return apiRequest({
        url: `/api/phone-rental/start`,
        method: 'POST',
        body: data
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Bắt đầu thuê số thành công",
        description: `Đang tìm số phù hợp cho ${data.service}`,
      });
      
      const newSession: RentalSession = {
        id: data.sessionId,
        service: data.service,
        carrier: data.carrier,
        phoneNumber: data.phoneNumber || 'Đang tìm...',
        status: 'waiting',
        cost: data.cost,
        startTime: new Date().toISOString(),
        expiresAt: data.expiresAt,
        sessionData: data
      };
      
      setActiveSessions(prev => [newSession, ...prev]);
      setPollingSessions(prev => new Set([...Array.from(prev), data.sessionId]));
    },
    onError: (error: any) => {
      // Handle rate limiting error specifically
      if (error.status === 429 || error.message?.includes('quá nhiều lần')) {
        toast({
          title: "Đã vượt quá giới hạn",
          description: error.message || "Bạn đã thuê số quá nhiều lần. Vui lòng chờ một chút để tiếp tục.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Lỗi",
          description: error.message || "Không thể bắt đầu thuê số",
          variant: "destructive"
        });
      }
    }
  });

  // Get OTP mutation
  const getOtpMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return apiRequest({
        url: `/api/phone-rental/get-otp`,
        method: 'POST',
        body: { sessionId }
      });
    },
    onSuccess: (data, sessionId) => {
      if (data.status === 'completed' && data.otp) {
        // Check if this is a v3 response format with enhanced data
        const isV3Format = data.v3Response && data.v3Response.Result;
        let sessionUpdate: Partial<RentalSession> = { 
          status: 'completed', 
          otpCode: data.otp 
        };
        
        if (isV3Format) {
          const result = data.v3Response.Result;
          sessionUpdate = {
            ...sessionUpdate,
            smsContent: result.SMS,
            isCall: result.IsCall,
            callFileUrl: result.IsCall && result.CallFile ? `/api/phone-rental/call-file/${sessionId}` : undefined
          };
        }
        
        setActiveSessions(prev => 
          prev.map(session => 
            session.id === sessionId 
              ? { ...session, ...sessionUpdate }
              : session
          )
        );
        setPollingSessions(prev => {
          const newSet = new Set(prev);
          newSet.delete(sessionId);
          return newSet;
        });
        
        const description = isV3Format && data.v3Response.Result.IsCall 
          ? `Mã OTP: ${data.otp} (Cuộc gọi)`
          : `Mã OTP: ${data.otp}`;
        
        toast({
          title: "Nhận OTP thành công",
          description,
        });
        
        // Sound + Browser notification
        const phoneNumber = activeSessions.find(s => s.id === sessionId)?.phoneNumber;
        notifyOtpSuccess(data.otp, phoneNumber);
        
        // Confetti celebration!
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
        
        // Refresh balance and history after successful OTP
        queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
        queryClient.invalidateQueries({ queryKey: ["/api/phone-rental-history", userId] });
      } else if (data.status === 'expired' && data.refunded) {
        // Session expired and money refunded
        setActiveSessions(prev => 
          prev.map(session => 
            session.id === sessionId 
              ? { ...session, status: 'expired' }
              : session
          )
        );
        setPollingSessions(prev => {
          const newSet = new Set(prev);
          newSet.delete(sessionId);
          return newSet;
        });
        
        toast({
          title: "Session hết hạn",
          description: data.message,
        });
        
        // Refresh balance and history after refund
        queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
        queryClient.invalidateQueries({ queryKey: ["/api/phone-rental-history", userId] });
      } else if (data.status === 'expired') {
        // Handle expired session without explicit refunded flag
        setActiveSessions(prev => 
          prev.map(session => 
            session.id === sessionId 
              ? { ...session, status: 'expired' }
              : session
          )
        );
        setPollingSessions(prev => {
          const newSet = new Set(prev);
          newSet.delete(sessionId);
          return newSet;
        });
        
        toast({
          title: "Session hết hạn",
          description: data.message || "Session đã hết thời gian chờ OTP. Tiền đã được hoàn lại.",
        });
        
        // Refresh balance and history after refund
        queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
        queryClient.invalidateQueries({ queryKey: ["/api/phone-rental-history", userId] });
      }
    },
    onError: (error: any) => {
      console.error('Get OTP error:', error);
    }
  });

  // Check expired sessions mutation (throttled to prevent spam)
  const checkExpiredMutation = useMutation({
    mutationFn: async () => {
      return apiRequest({
        url: `/api/phone-rental/check-expired`,
        method: 'POST',
        body: {}
      });
    },
    onSuccess: (data) => {
      if (data.refundedSessions > 0) {
        toast({
          title: "Hoàn tiền tự động",
          description: data.message,
        });
        
        // Refresh balance and history after refunds
        queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
        queryClient.invalidateQueries({ queryKey: ["/api/phone-rental-history", userId] });
        queryClient.invalidateQueries({ queryKey: ["/api/phone-rental/active-sessions", userId] });
      }
    },
    onError: (error) => {
      console.log('Check expired error (expected during development):', error);
    }
  });



  // Polling effect for active sessions
  useEffect(() => {
    if (pollingSessions.size === 0) return;

    const interval = setInterval(() => {
      pollingSessions.forEach(sessionId => {
        getOtpMutation.mutate(sessionId);
      });
    }, POLLING_INTERVAL);

    return () => clearInterval(interval);
  }, [pollingSessions, getOtpMutation]);

  // Auto-check expired sessions every 5 minutes when user has active sessions
  useEffect(() => {
    if (pollingSessions.size === 0) return;

    const interval = setInterval(() => {
      checkExpiredMutation.mutate();
    }, EXPIRED_CHECK_INTERVAL); // 5 minutes interval

    return () => clearInterval(interval);
  }, [checkExpiredMutation, pollingSessions.size]);

  // Reset page when filters change
  useEffect(() => {
    setFilters(prev => ({ ...prev, currentPage: 1 }));
  }, [filters.searchQuery, filters.dateFilter, filters.itemsPerPage, filters.customStartDate, filters.customEndDate]);

  // Filter and paginate history data
  const filteredBySearch = filterHistoryBySearch(historyData, filters.searchQuery);
  const filteredByDate = filterHistoryByDate(
    filteredBySearch, 
    filters.dateFilter, 
    filters.customStartDate, 
    filters.customEndDate
  );
  
  const {
    paginatedData: paginatedHistory,
    totalPages,
    startIndex,
    endIndex
  } = paginateData(filteredByDate, filters.currentPage, filters.itemsPerPage);

  // Handlers
  const handleStartRental = () => {
    if (!selectedCarrier) {
      toast({
        title: "Vui lòng chọn nhà mạng",
        variant: "destructive"
      });
      return;
    }

    startRentalMutation.mutate({
      service: selectedService,
      carrier: selectedCarrier
    });
  };

  const handleCopyToClipboard = async (text: string, label: string) => {
    await copyToClipboard(text);
    toast({
      title: "Đã sao chép",
      description: `${label}: ${text}`,
    });
  };

  const handleFiltersChange = (newFilters: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, currentPage: page }));
  };

  const refreshHistory = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/phone-rental-history"] });
  };

  // Statistics
  const successToday = historyData.filter(h => 
    h.status === 'completed' && 
    new Date(h.startTime).toDateString() === new Date().toDateString()
  ).length;

  return {
    // Form state
    selectedService,
    selectedCarrier,
    setSelectedService,
    setSelectedCarrier,
    
    // Session state
    activeSessions,
    
    // History state
    historyData: paginatedHistory,
    rawHistoryData: historyData,
    historyLoading,
    filteredHistoryData: filteredByDate,
    filters,
    totalPages,
    startIndex,
    endIndex,
    
    // Statistics
    successToday,
    
    // Loading states
    isStartingRental: startRentalMutation.isPending,
    
    // Handlers
    handleStartRental,
    handleCopyToClipboard,
    handleFiltersChange,
    handlePageChange,
    refreshHistory,
    
    // Check expired functionality
    checkExpiredMutation
  };
};