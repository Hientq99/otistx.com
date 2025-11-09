import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, Copy, Volume2, Download, MessageSquare, AlertTriangle } from "lucide-react";
import { RentalSession } from './types';
import { StatusBadge } from './StatusBadge';
import { getSessionStatus, getTimeRemaining, formatVietnameseDate } from './utils';
import { useState, useEffect } from 'react';
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ActiveSessionsProps {
  sessions: RentalSession[];
  onCopyToClipboard: (text: string, label: string) => void;
}

export const ActiveSessions = ({ sessions, onCopyToClipboard }: ActiveSessionsProps) => {
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});

  // Function to fetch audio with authentication
  const fetchAuthenticatedAudio = async (sessionId: string): Promise<string | null> => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No auth token found');
        return null;
      }

      const response = await fetch(`/api/phone-rental/call-file/${sessionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
        return null;
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      return audioUrl;
    } catch (error) {
      console.error('Error fetching authenticated audio:', error);
      return null;
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

  // Load audio URLs for call sessions
  useEffect(() => {
    const loadAudioUrls = async () => {
      const callSessions = sessions.filter(session => 
        session.service === 'otissim_v3' && session.isCall && session.callFileUrl
      );

      for (const session of callSessions) {
        if (!audioUrls[session.id]) {
          const audioUrl = await fetchAuthenticatedAudio(session.id);
          if (audioUrl) {
            setAudioUrls(prev => ({ ...prev, [session.id]: audioUrl }));
          }
        }
      }
    };

    loadAudioUrls();
    
    // Cleanup blob URLs when component unmounts
    return () => {
      Object.values(audioUrls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [sessions]);

  if (sessions.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Sessions đang hoạt động</h2>
      <div className="space-y-4">
        {sessions.map((session) => {
          const currentStatus = getSessionStatus(session);
          const now = new Date();
          const expires = new Date(session.expiresAt);
          const startTime = new Date(session.startTime);
          const totalDuration = expires.getTime() - startTime.getTime();
          const timeRemaining = expires.getTime() - now.getTime();
          const progressPercent = Math.max(0, Math.min(100, (timeRemaining / totalDuration) * 100));
          const isExpiringSoon = timeRemaining < 60000 && timeRemaining > 0; // < 60s
          
          return (
            <Card key={session.id} className="shadow-sm border-gray-200">
              <CardContent className="p-6">
                {/* Timeout Warning */}
                {isExpiringSoon && currentStatus === 'waiting' && (
                  <Alert className="mb-4 border-amber-300 bg-amber-50">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800">
                      <strong>Cảnh báo:</strong> Session này sẽ hết hạn trong ít hơn 1 phút!
                    </AlertDescription>
                  </Alert>
                )}
                
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Phone className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{session.phoneNumber}</h3>
                      <p className="text-sm text-gray-600">{session.service} • {session.carrier}</p>
                    </div>
                  </div>
                  <StatusBadge status={currentStatus} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Bắt đầu</p>
                    <p className="text-sm font-medium">
                      {formatVietnameseDate(session.startTime).split(' ')[1]}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Còn lại</p>
                    <p className="text-sm font-medium text-red-600">
                      {getTimeRemaining(session.expiresAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Chi phí</p>
                    <p className="text-sm font-medium text-green-600">
                      {session.cost.toLocaleString()} VND
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Session ID</p>
                    <div className="flex items-center space-x-1">
                      <p className="text-xs font-mono">{session.id}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCopyToClipboard(session.id, 'Session ID')}
                        className="h-4 w-4 p-0 hover:bg-gray-100"
                        title="Copy Session ID"
                      >
                        <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                      </Button>
                    </div>
                  </div>
                </div>
                
                {/* Countdown Progress Bar */}
                {currentStatus === 'waiting' && timeRemaining > 0 && (
                  <div className="mb-4">
                    <Progress 
                      value={progressPercent} 
                      className={`h-2 ${isExpiringSoon ? 'bg-amber-100' : ''}`}
                      indicatorClassName={isExpiringSoon ? 'bg-amber-500' : 'bg-blue-500'}
                    />
                  </div>
                )}

                {session.otpCode && (
                  <div className="space-y-4">
                    {/* OTP Code Display */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-green-700 mb-1">
                            {session.isCall ? 'Mã OTP (Cuộc gọi)' : 'Mã OTP nhận được'}
                          </p>
                          <p className="text-2xl font-mono font-bold text-green-800">{session.otpCode}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onCopyToClipboard(session.otpCode || '', 'OTP')}
                          className="border-green-300 text-green-700 hover:bg-green-100"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* V3 Enhanced Content */}
                    {session.service === 'otissim_v3' && (
                      <div className="space-y-3">
                        {/* Call File - Audio Player */}
                        {session.isCall && session.callFileUrl && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <Volume2 className="w-4 h-4 text-blue-600" />
                              <span className="text-sm font-medium text-blue-700">File âm thanh cuộc gọi</span>
                            </div>
                            <div className="space-y-3">
                              {audioUrls[session.id] ? (
                                <audio 
                                  controls 
                                  className="w-full"
                                  preload="none"
                                  src={audioUrls[session.id]}
                                >
                                  Trình duyệt của bạn không hỗ trợ phát âm thanh.
                                </audio>
                              ) : (
                                <div className="flex items-center justify-center p-4 bg-gray-100 rounded">
                                  <span className="text-sm text-gray-600">Đang tải audio...</span>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => downloadAuthenticatedAudio(session.id, `otp-call-${session.id}.wav`)}
                                  className="flex-1"
                                  disabled={!audioUrls[session.id]}
                                >
                                  <Download className="w-4 h-4 mr-2" />
                                  Tải về
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* SMS Content */}
                        {!session.isCall && session.smsContent && (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <MessageSquare className="w-4 h-4 text-gray-600" />
                              <span className="text-sm font-medium text-gray-700">Nội dung SMS</span>
                            </div>
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm text-gray-800 font-mono bg-white p-2 rounded border flex-1">
                                {session.smsContent}
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onCopyToClipboard(session.smsContent || '', 'Nội dung SMS')}
                                className="hover:bg-gray-200 shrink-0"
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCopyToClipboard(session.phoneNumber, 'Số điện thoại')}
                    className="flex-1"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Sao chép số
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCopyToClipboard(session.id, 'Session ID')}
                    className="flex-1"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Sao chép Session
                  </Button>
                  {session.otpCode && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onCopyToClipboard(session.otpCode || '', 'OTP')}
                      className="flex-1"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Sao chép OTP
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};