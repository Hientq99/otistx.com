import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, History, Phone, Copy, ChevronLeft, ChevronRight, Volume2, Download, MessageSquare } from "lucide-react";
import { HistorySession, FilterState } from './types';
import { StatusBadge } from './StatusBadge';
import { getHistorySessionStatus, formatVietnameseDate, generatePageNumbers } from './utils';
import { useState, useEffect, useRef } from 'react';

interface HistoryDisplayProps {
  sessions: HistorySession[];
  isLoading: boolean;
  filters: FilterState;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  onCopyToClipboard: (text: string, label: string) => void;
  onPageChange: (page: number) => void;
}

export const HistoryDisplay = ({
  sessions,
  isLoading,
  filters,
  totalPages,
  startIndex,
  endIndex,
  onCopyToClipboard,
  onPageChange
}: HistoryDisplayProps) => {
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [loadingAudio, setLoadingAudio] = useState<Record<string, boolean>>({});
  const [audioAvailable, setAudioAvailable] = useState<Record<string, boolean>>({});
  const [checkingAudio, setCheckingAudio] = useState<Record<string, boolean>>({});
  const audioUrlsRef = useRef<Record<string, string>>({});

  // Function to check if audio is available for a session
  const checkAudioAvailability = async (sessionId: string): Promise<void> => {
    if (audioAvailable[sessionId] !== undefined || checkingAudio[sessionId]) return;
    
    setCheckingAudio(prev => ({ ...prev, [sessionId]: true }));
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setAudioAvailable(prev => ({ ...prev, [sessionId]: false }));
        return;
      }

      const response = await fetch(`/api/phone-rental/call-file/${sessionId}`, {
        method: 'HEAD',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      setAudioAvailable(prev => ({ ...prev, [sessionId]: response.ok }));
    } catch (error) {
      setAudioAvailable(prev => ({ ...prev, [sessionId]: false }));
    } finally {
      setCheckingAudio(prev => ({ ...prev, [sessionId]: false }));
    }
  };

  // Function to fetch audio with authentication (lazy load)
  const fetchAudioForSession = async (sessionId: string): Promise<void> => {
    if (audioUrls[sessionId] || loadingAudio[sessionId]) return;
    
    setLoadingAudio(prev => ({ ...prev, [sessionId]: true }));
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No auth token found');
        return;
      }

      const response = await fetch(`/api/phone-rental/call-file/${sessionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
        setAudioAvailable(prev => ({ ...prev, [sessionId]: false }));
        return;
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      audioUrlsRef.current[sessionId] = audioUrl;
      setAudioUrls(prev => ({ ...prev, [sessionId]: audioUrl }));
    } catch (error) {
      console.error('Error fetching authenticated audio:', error);
      setAudioAvailable(prev => ({ ...prev, [sessionId]: false }));
    } finally {
      setLoadingAudio(prev => ({ ...prev, [sessionId]: false }));
    }
  };

  // Function to download audio with authentication
  const downloadAuthenticatedAudio = async (sessionId: string, filename: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No auth token found');
        return;
      }

      const response = await fetch(`/api/phone-rental/call-file/${sessionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error(`Failed to download audio: ${response.status} ${response.statusText}`);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading authenticated audio:', error);
    }
  };

  // Track which sessions are currently available for cleanup and check audio availability
  const currentV3Sessions = sessions
    .filter(session => session.service === 'otissim_v3')
    .map(session => session.sessionId);

  // Auto-check audio availability for v3 sessions
  useEffect(() => {
    currentV3Sessions.forEach(sessionId => {
      if (audioAvailable[sessionId] === undefined && !checkingAudio[sessionId]) {
        checkAudioAvailability(sessionId);
      }
    });
  }, [currentV3Sessions.join(',')]);

  // Clean up audio URLs for sessions that are no longer present
  useEffect(() => {
    Object.keys(audioUrlsRef.current).forEach(sessionId => {
      if (!currentV3Sessions.includes(sessionId)) {
        URL.revokeObjectURL(audioUrlsRef.current[sessionId]);
        delete audioUrlsRef.current[sessionId];
        setAudioUrls(prev => {
          const { [sessionId]: removed, ...rest } = prev;
          return rest;
        });
      }
    });
  }, [currentV3Sessions.join(',')]); // Only trigger when session list changes

  // Cleanup all blob URLs on component unmount
  useEffect(() => {
    return () => {
      Object.values(audioUrlsRef.current).forEach(url => URL.revokeObjectURL(url));
      audioUrlsRef.current = {};
    };
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="shadow-sm border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="space-y-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    const hasActiveFilters = filters.searchQuery || filters.dateFilter !== 'all';
    return (
      <Card className="shadow-sm border-gray-200">
        <CardContent className="p-12 text-center">
          <History className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {hasActiveFilters ? 'Không tìm thấy kết quả' : 'Chưa có lịch sử'}
          </h3>
          <p className="text-gray-600 mb-6">
            {hasActiveFilters 
              ? 'Không tìm thấy kết quả phù hợp với bộ lọc. Hãy thử điều chỉnh bộ lọc hoặc xóa bộ lọc để xem tất cả.' 
              : 'Chưa có lịch sử thuê số nào. Hãy bắt đầu thuê số đầu tiên của bạn!'
            }
          </p>
          <Button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white"
            data-testid="button-start-rental"
          >
            <Phone className="w-4 h-4 mr-2" />
            Thuê số ngay
          </Button>
        </CardContent>
      </Card>
    );
  }

  const pageNumbers = generatePageNumbers(filters.currentPage, totalPages);

  return (
    <>
      <div className="space-y-3">
        {sessions.map((session) => (
          <Card key={session.id} className="group shadow-sm border-gray-200 hover:shadow-md hover:border-gray-300 transition-all duration-200 bg-white">
            <CardContent className="p-4 sm:p-6">
              {/* Main Info - Responsive */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-start space-x-4">
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100 group-hover:bg-blue-100 transition-colors">
                      <Phone className="w-5 h-5 text-blue-600" />
                    </div>
                    {/* Status indicator dot */}
                    <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white shadow-sm ${
                      getHistorySessionStatus(session) === 'completed' ? 'bg-green-500' :
                      getHistorySessionStatus(session) === 'failed' ? 'bg-red-500' :
                      getHistorySessionStatus(session) === 'expired' ? 'bg-orange-500' :
                      'bg-yellow-500'
                    }`}></div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="font-semibold text-gray-900 text-base">{session.phoneNumber}</p>
                      <p className="text-sm text-gray-600 flex items-center gap-2">
                        <span>{formatVietnameseDate(session.startTime)}</span>
                        <span className="text-gray-400">•</span>
                        <span className="font-medium text-gray-700">{session.cost.toLocaleString('vi-VN')} VND</span>
                      </p>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        session.service === 'otissim_v3' ? 'bg-blue-100 text-blue-800' :
                        session.service === 'otissim_v2' ? 'bg-green-100 text-green-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {session.service.toUpperCase()}
                      </span>
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">
                        {session.carrier}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500">ID:</span>
                      <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-md border">
                        <span className="text-xs font-mono text-gray-600 truncate max-w-[120px] sm:max-w-[200px]">
                          {session.sessionId}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onCopyToClipboard(session.sessionId, 'Session ID')}
                          className="h-5 w-5 p-0 hover:bg-gray-200 shrink-0 rounded transition-colors"
                          title="Sao chép Session ID"
                        >
                          <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Enhanced Actions Section */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-end">
                  {session.otpCode && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-medium">Mã OTP:</span>
                      <div className="flex items-center gap-1 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg px-3 py-1.5 shadow-sm">
                        <span className="text-sm font-mono font-bold text-green-800 tracking-wider">
                          {session.otpCode}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onCopyToClipboard(session.otpCode || '', 'Mã OTP')}
                          className="h-5 w-5 p-0 hover:bg-green-200 shrink-0 rounded transition-colors ml-1"
                          title="Sao chép mã OTP"
                          data-testid={`button-copy-otp-${session.id}`}
                        >
                          <Copy className="w-3 h-3 text-green-600 hover:text-green-800" />
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <StatusBadge status={getHistorySessionStatus(session)} />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onCopyToClipboard(session.phoneNumber, 'Số điện thoại')}
                      className="shrink-0 hover:bg-gray-100 rounded-lg p-2.5 transition-colors group/copy"
                      title="Sao chép số điện thoại"
                    >
                      <Copy className="w-4 h-4 text-gray-500 group-hover/copy:text-gray-700" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* V3 Enhanced Content - Professional Design */}
              {session.service === 'otissim_v3' && (audioAvailable[session.sessionId] || session.smsContent) && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <div className="space-y-4">
                    {/* Audio Section - Only show if audio is available */}
                    {audioAvailable[session.sessionId] && (
                      <div className="group relative bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 hover:shadow-sm transition-all duration-200">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                              <Volume2 className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-900 text-sm">Bản ghi cuộc gọi OTP</h4>
                              <p className="text-xs text-gray-500">Âm thanh xác thực từ hệ thống</p>
                            </div>
                          </div>
                          {checkingAudio[session.sessionId] && (
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <div className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
                              Kiểm tra...
                            </div>
                          )}
                        </div>
                        
                        <div className="space-y-3">
                          {audioUrls[session.sessionId] ? (
                            <div className="bg-white/70 backdrop-blur-sm rounded-lg p-3 border border-blue-100">
                              <audio 
                                controls 
                                className="w-full h-10"
                                preload="metadata"
                                src={audioUrls[session.sessionId]}
                                controlsList="nodownload"
                                onError={(e) => {
                                  console.error('Audio playback error:', e);
                                  setAudioAvailable(prev => ({ ...prev, [session.sessionId]: false }));
                                }}
                              >
                                Trình duyệt của bạn không hỗ trợ phát âm thanh.
                              </audio>
                            </div>
                          ) : loadingAudio[session.sessionId] ? (
                            <div className="flex items-center justify-center py-8 bg-white/50 rounded-lg border border-blue-100">
                              <div className="flex items-center gap-3 text-blue-600">
                                <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
                                <span className="text-sm font-medium">Đang tải bản ghi âm...</span>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-white/50 rounded-lg border border-blue-100 p-4">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => fetchAudioForSession(session.sessionId)}
                                className="w-full flex items-center justify-center gap-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 py-3 rounded-lg font-medium transition-colors"
                              >
                                <Volume2 className="w-5 h-5" />
                                Phát bản ghi âm
                              </Button>
                            </div>
                          )}
                          
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadAuthenticatedAudio(session.sessionId, `otp-call-${session.phoneNumber}-${session.id}.wav`)}
                              className="flex-1 text-xs font-medium bg-white/70 border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Tải xuống (.wav)
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SMS Content Section - Only show if SMS content exists */}
                    {session.smsContent && (
                      <div className="group relative bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all duration-200">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            <MessageSquare className="w-5 h-5 text-gray-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 text-sm">Nội dung tin nhắn</h4>
                            <p className="text-xs text-gray-500">Thông tin chi tiết từ SMS</p>
                          </div>
                        </div>
                        
                        <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <p className="text-sm text-gray-800 font-mono leading-relaxed whitespace-pre-wrap break-words bg-gradient-to-r from-gray-50 to-white p-3 rounded-md border border-gray-100">
                                {session.smsContent}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onCopyToClipboard(session.smsContent || '', 'Nội dung SMS')}
                              className="shrink-0 hover:bg-gray-100 p-2 rounded-lg transition-colors"
                              title="Sao chép nội dung SMS"
                            >
                              <Copy className="w-4 h-4 text-gray-500" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pagination - Responsive */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6">
          <div className="text-xs sm:text-sm text-gray-600 order-2 sm:order-1 text-center sm:text-left">
            Hiển thị {startIndex + 1}-{Math.min(endIndex, sessions.length)} trong {sessions.length} bản ghi
          </div>
          <div className="flex items-center justify-center space-x-1 sm:space-x-2 order-1 sm:order-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, filters.currentPage - 1))}
              disabled={filters.currentPage === 1}
              className="text-xs sm:text-sm"
            >
              <ChevronLeft className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Trước</span>
            </Button>
            
            <div className="flex items-center space-x-1">
              {pageNumbers.map((pageNum) => (
                <Button
                  key={pageNum}
                  variant={filters.currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange(pageNum)}
                  className="w-7 h-7 sm:w-8 sm:h-8 p-0 text-xs sm:text-sm"
                >
                  {pageNum}
                </Button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, filters.currentPage + 1))}
              disabled={filters.currentPage === totalPages}
              className="text-xs sm:text-sm"
            >
              <span className="hidden sm:inline">Tiếp</span>
              <ChevronRight className="w-4 h-4 sm:ml-1" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
};