import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Clock, PlayCircle, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { FixedHeader } from "@/components/fixed-header";

interface RefundStatus {
  isRunning: boolean;
  lastCheck: string;
  nextCheck: string;
  interval: number;
  totalChecks: number;
  lastResult: {
    phoneRentals: number;
    tiktokRentals: number;
    timestamp: string;
  };
}

export default function AutoRefundAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Get auto-refund status
  const { data: status, isLoading, error } = useQuery<RefundStatus>({
    queryKey: ['/api/admin/auto-refund-status'],
    refetchInterval: 60000, // Refresh every 60 seconds (EXTREME EGRESS REDUCTION)
  });

  // Manual check mutation
  const manualCheckMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/auto-refund-manual-check', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to run manual check');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Manual Check Completed",
        description: data.message,
      });
      // Refresh status
      queryClient.invalidateQueries({ queryKey: ['/api/admin/auto-refund-status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to run manual check",
        variant: "destructive",
      });
    },
  });

  const formatTime = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getNextCheckCountdown = () => {
    if (!status?.nextCheck) return 'N/A';
    
    const nextCheck = new Date(status.nextCheck);
    const diff = nextCheck.getTime() - currentTime.getTime();
    
    if (diff <= 0) return 'Checking now...';
    
    const seconds = Math.floor(diff / 1000);
    return `${seconds}s`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <RefreshCw className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-2xl mx-auto">
            <CardContent className="pt-6">
              <div className="text-center">
                <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
                <p className="text-gray-600">You don't have permission to access this page.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <FixedHeader />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Auto-Refund Scheduler Management
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Monitor and manage automatic refund processing for expired sessions
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Scheduler Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status:</span>
                <Badge variant={status?.isRunning ? "default" : "destructive"}>
                  {status?.isRunning ? (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Running
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Stopped
                    </>
                  )}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Check Interval:</span>
                <span className="text-sm">{status?.interval || 30}s</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Checks:</span>
                <span className="text-sm">{status?.totalChecks || 0}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Next Check:</span>
                <Badge variant="outline">{getNextCheckCountdown()}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Timing Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Timing Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-sm font-medium block mb-1">Last Check:</span>
                <span className="text-sm text-gray-600">{formatTime(status?.lastCheck)}</span>
              </div>

              <div>
                <span className="text-sm font-medium block mb-1">Next Check:</span>
                <span className="text-sm text-gray-600">{formatTime(status?.nextCheck)}</span>
              </div>

              <div>
                <span className="text-sm font-medium block mb-1">Current Time:</span>
                <span className="text-sm text-gray-600">{formatTime(currentTime.toISOString())}</span>
              </div>
            </CardContent>
          </Card>

          {/* Last Result */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Last Check Result
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Phone Rentals Processed:</span>
                <Badge variant="outline">{status?.lastResult?.phoneRentals || 0}</Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">TikTok Rentals Processed:</span>
                <Badge variant="outline">{status?.lastResult?.tiktokRentals || 0}</Badge>
              </div>

              <div>
                <span className="text-sm font-medium block mb-1">Last Result Time:</span>
                <span className="text-sm text-gray-600">{formatTime(status?.lastResult?.timestamp)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Manual Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5" />
                Manual Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  Run a manual check to immediately process any expired sessions.
                </p>
                
                <Button
                  onClick={() => manualCheckMutation.mutate()}
                  disabled={manualCheckMutation.isPending}
                  className="w-full"
                >
                  {manualCheckMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Running Manual Check...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4 mr-2" />
                      Run Manual Check
                    </>
                  )}
                </Button>
              </div>

              <Separator />

              <div className="text-xs text-gray-500">
                <p><strong>Note:</strong> Manual checks are useful for testing or immediate processing. The automatic scheduler will continue running in the background.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* System Information */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>System Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium mb-2">Supported Services:</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>• OtisSim v1 (1,900 VND refund)</li>
                  <li>• OtisSim v2 (1,900 VND refund)</li>
                  <li>• OtisSim v3 (2,000 VND refund)</li>
                  <li>• TikTok Rental (1,200 VND refund)</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Features:</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>• Automatic duplicate prevention</li>
                  <li>• Balance tracking and updates</li>
                  <li>• Transaction logging</li>
                  <li>• 24/7 background processing</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}