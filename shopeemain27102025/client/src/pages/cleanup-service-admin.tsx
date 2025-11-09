/**
 * CLEANUP SERVICE ADMIN PANEL
 * ===========================
 * 
 * Trang quản lý Cleanup Service cho admin
 * Cho phép:
 * - Xem trạng thái service
 * - Trigger cleanup thủ công
 * - Force Windows cleanup
 * - Test tất cả cleanup methods
 * - Restart service
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  RefreshCw, 
  Play, 
  Square, 
  TestTube, 
  Monitor, 
  Clock,
  CheckCircle,
  AlertTriangle,
  Terminal
} from 'lucide-react';

interface CleanupServiceStatus {
  running: boolean;
  nextCleanup?: string;
  config?: {
    enabled: boolean;
    intervalMinutes: number;
    platform: string;
  };
}

interface TestResult {
  method: string;
  success: boolean;
  error?: string;
}

interface TestResults {
  platform: string;
  results: TestResult[];
}

export default function CleanupServiceAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [testResults, setTestResults] = useState<TestResults | null>(null);

  // Query để lấy trạng thái cleanup service
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['/api/admin/cleanup-service/status'],
    refetchInterval: 30000, // Refresh mỗi 30 giây
  });

  // Mutations
  const manualCleanupMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/cleanup-service/manual', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to trigger manual cleanup');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Thành công",
        description: "CMD đã được xóa thành công",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/cleanup-service/status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể thực hiện cleanup",
        variant: "destructive",
      });
    },
  });

  const forceWindowsCleanupMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/cleanup-service/force-windows', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to force Windows cleanup');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.success ? "Thành công" : "Thất bại",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể thực hiện force Windows cleanup",
        variant: "destructive",
      });
    },
  });

  const restartServiceMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/cleanup-service/restart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to restart cleanup service');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Thành công",
        description: "Cleanup service đã được khởi động lại",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/cleanup-service/status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể khởi động lại service",
        variant: "destructive",
      });
    },
  });

  const testMethodsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/cleanup-service/test-methods', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to test cleanup methods');
      return response.json();
    },
    onSuccess: (data) => {
      setTestResults(data);
      toast({
        title: "Test hoàn thành",
        description: `Đã test ${data.results.length} phương pháp cleanup`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể test cleanup methods",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cleanup Service Management</h1>
          <p className="text-muted-foreground mt-2">
            Quản lý dịch vụ tự động xóa CMD/Terminal
          </p>
        </div>
        <Button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/admin/cleanup-service/status'] })}
          variant="outline"
          size="sm"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Service Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Trạng thái Service
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Đang tải...
            </div>
          ) : status ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Status:</span>
                  <Badge variant={status.running ? "default" : "secondary"}>
                    {status.running ? "Đang chạy" : "Đã dừng"}
                  </Badge>
                </div>
                {status.config && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Platform:</span>
                    <Badge variant="outline">{status.config.platform}</Badge>
                  </div>
                )}
              </div>
              
              {status.nextCleanup && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm text-muted-foreground">
                    Cleanup tiếp theo: {status.nextCleanup}
                  </span>
                </div>
              )}
              
              {status.config && (
                <div className="text-sm text-muted-foreground">
                  Interval: {status.config.intervalMinutes} phút | 
                  Enabled: {status.config.enabled ? "Yes" : "No"}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Không thể tải trạng thái service
            </div>
          )}
        </CardContent>
      </Card>

      {/* Control Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Điều khiển Service</CardTitle>
          <CardDescription>
            Các thao tác để quản lý cleanup service
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button
              onClick={() => manualCleanupMutation.mutate()}
              disabled={manualCleanupMutation.isPending}
              className="flex flex-col gap-2 h-20"
            >
              <Terminal className="h-5 w-5" />
              <span className="text-xs">Manual Cleanup</span>
            </Button>

            <Button
              onClick={() => forceWindowsCleanupMutation.mutate()}
              disabled={forceWindowsCleanupMutation.isPending}
              variant="outline"
              className="flex flex-col gap-2 h-20"
            >
              <Monitor className="h-5 w-5" />
              <span className="text-xs">Force Windows</span>
            </Button>

            <Button
              onClick={() => testMethodsMutation.mutate()}
              disabled={testMethodsMutation.isPending}
              variant="secondary"
              className="flex flex-col gap-2 h-20"
            >
              <TestTube className="h-5 w-5" />
              <span className="text-xs">Test Methods</span>
            </Button>

            <Button
              onClick={() => restartServiceMutation.mutate()}
              disabled={restartServiceMutation.isPending}
              variant="destructive"
              className="flex flex-col gap-2 h-20"
            >
              <RefreshCw className="h-5 w-5" />
              <span className="text-xs">Restart Service</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test Results */}
      {testResults && (
        <Card>
          <CardHeader>
            <CardTitle>Kết quả Test Cleanup Methods</CardTitle>
            <CardDescription>
              Platform: {testResults.platform}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {testResults.results.map((result, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {result.success ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="font-mono text-sm">{result.method}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={result.success ? "default" : "destructive"}>
                      {result.success ? "Success" : "Failed"}
                    </Badge>
                    {result.error && (
                      <span className="text-xs text-muted-foreground truncate max-w-40">
                        {result.error}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            <Separator className="my-4" />
            
            <div className="flex gap-4 text-sm">
              <span className="text-green-600">
                ✓ Success: {testResults.results.filter(r => r.success).length}
              </span>
              <span className="text-red-600">
                ✗ Failed: {testResults.results.filter(r => !r.success).length}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}