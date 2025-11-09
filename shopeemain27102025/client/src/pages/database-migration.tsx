import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Database, 
  RefreshCw, 
  Clock, 
  Check, 
  AlertTriangle, 
  Server,
  ArrowRight,
  Play,
  Settings,
  History
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FixedHeader } from "@/components/fixed-header";
import { Textarea } from "@/components/ui/textarea";

interface MigrationStatus {
  isRunning: boolean;
  lastRunTime?: string;
  nextRunTime?: string;
  autoMigrationEnabled: boolean;
  totalRecords?: number;
  migratedRecords?: number;
  errors?: string[];
  currentDatabase: string;
  targetDatabase?: string;
}

interface MigrationHistory {
  id: number;
  startTime: string;
  endTime?: string;
  status: 'running' | 'completed' | 'failed';
  recordsMigrated: number;
  errors?: string;
  sourceDb: string;
  targetDb: string;
}

export default function DatabaseMigrationPage() {
  const [targetDatabaseUrl, setTargetDatabaseUrl] = useState("");
  const [autoMigrationEnabled, setAutoMigrationEnabled] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Only allow superadmin access
  if (user?.role !== 'superadmin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <FixedHeader />
        <div className="container mx-auto px-4 py-8 pt-24">
          <div className="max-w-md mx-auto text-center">
            <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Truy cập bị từ chối
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Chỉ superadmin mới có thể truy cập trang Database Migration
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { data: migrationStatus } = useQuery<MigrationStatus>({
    queryKey: ["/api/database-migration/status"],
    refetchInterval: 30000, // Refresh every 30 seconds (EXTREME EGRESS REDUCTION)
  });

  const { data: migrationHistory } = useQuery<MigrationHistory[]>({
    queryKey: ["/api/database-migration/history"],
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (databaseUrl: string) => {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/database-migration/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ databaseUrl })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Thành công",
        description: "Kết nối database thành công!",
      });
    },
    onError: (error) => {
      toast({
        title: "Lỗi kết nối",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const manualMigrationMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/database-migration/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ 
          targetDatabaseUrl,
          manual: true 
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/database-migration/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/database-migration/history"] });
      toast({
        title: "Migration đã bắt đầu",
        description: "Quá trình chuyển dữ liệu đã được khởi động",
      });
    },
    onError: (error) => {
      toast({
        title: "Lỗi migration",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (config: { targetDatabaseUrl: string; autoMigrationEnabled: boolean }) => {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/database-migration/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/database-migration/status"] });
      toast({
        title: "Cấu hình đã được lưu",
        description: "Cài đặt migration đã được cập nhật",
      });
    },
    onError: (error) => {
      toast({
        title: "Lỗi cập nhật",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveConfig = () => {
    if (!targetDatabaseUrl.trim()) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập URL database đích",
        variant: "destructive",
      });
      return;
    }

    updateConfigMutation.mutate({
      targetDatabaseUrl,
      autoMigrationEnabled
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <FixedHeader />
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 flex items-center justify-center gap-2">
              <Database className="h-8 w-8 text-blue-600" />
              Database Migration Management
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Quản lý chuyển dữ liệu giữa các database
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Current Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Trạng thái hiện tại
                </CardTitle>
                <CardDescription>
                  Thông tin database và migration hiện tại
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Trạng thái migration:</span>
                  <Badge variant={migrationStatus?.isRunning ? "default" : "secondary"}>
                    {migrationStatus?.isRunning ? (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                        Đang chạy
                      </>
                    ) : (
                      <>
                        <Check className="h-3 w-3 mr-1" />
                        Idle
                      </>
                    )}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Auto migration:</span>
                  <Badge variant={migrationStatus?.autoMigrationEnabled ? "default" : "secondary"}>
                    {migrationStatus?.autoMigrationEnabled ? "Bật" : "Tắt"}
                  </Badge>
                </div>

                {migrationStatus?.lastRunTime && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Lần chạy cuối:</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {new Date(migrationStatus.lastRunTime).toLocaleString('vi-VN')}
                    </span>
                  </div>
                )}

                {migrationStatus?.nextRunTime && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Lần chạy tiếp theo:</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {new Date(migrationStatus.nextRunTime).toLocaleString('vi-VN')}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t">
                  <div className="text-sm">
                    <p className="font-medium mb-1">Database hiện tại:</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
                      {migrationStatus?.currentDatabase}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Cấu hình Migration
                </CardTitle>
                <CardDescription>
                  Thiết lập database đích và tự động migration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="target-db">Database URL đích</Label>
                  <Textarea
                    id="target-db"
                    placeholder="postgresql://username:password@host:port/database"
                    value={targetDatabaseUrl}
                    onChange={(e) => setTargetDatabaseUrl(e.target.value)}
                    className="mt-1 font-mono text-xs"
                    rows={3}
                    data-testid="input-target-database"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="auto-migration"
                    checked={autoMigrationEnabled}
                    onCheckedChange={setAutoMigrationEnabled}
                    data-testid="switch-auto-migration"
                  />
                  <Label htmlFor="auto-migration">
                    Tự động migration mỗi 12 giờ
                  </Label>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => testConnectionMutation.mutate(targetDatabaseUrl)}
                    disabled={!targetDatabaseUrl.trim() || testConnectionMutation.isPending}
                    variant="outline"
                    size="sm"
                    data-testid="button-test-connection"
                  >
                    {testConnectionMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Đang test...
                      </>
                    ) : (
                      <>
                        <Database className="h-4 w-4 mr-2" />
                        Test kết nối
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={handleSaveConfig}
                    disabled={updateConfigMutation.isPending}
                    size="sm"
                    data-testid="button-save-config"
                  >
                    {updateConfigMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Đang lưu...
                      </>
                    ) : (
                      "Lưu cấu hình"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Manual Migration */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5" />
                Migration thủ công
              </CardTitle>
              <CardDescription>
                Chạy migration ngay lập tức
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Bấm để bắt đầu chuyển dữ liệu từ database hiện tại sang database đích
                  </p>
                  {migrationStatus?.isRunning && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 text-sm text-blue-600">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Migration đang chạy...
                      </div>
                      {migrationStatus.totalRecords && migrationStatus.migratedRecords && (
                        <div className="mt-1 text-xs text-gray-500">
                          Đã migrate {migrationStatus.migratedRecords}/{migrationStatus.totalRecords} records
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  onClick={() => manualMigrationMutation.mutate()}
                  disabled={
                    !targetDatabaseUrl.trim() || 
                    migrationStatus?.isRunning || 
                    manualMigrationMutation.isPending
                  }
                  data-testid="button-start-migration"
                >
                  {manualMigrationMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Đang khởi động...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Bắt đầu Migration
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Migration History */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Lịch sử Migration
              </CardTitle>
              <CardDescription>
                Các lần migration đã thực hiện
              </CardDescription>
            </CardHeader>
            <CardContent>
              {migrationHistory && migrationHistory.length > 0 ? (
                <div className="space-y-3">
                  {migrationHistory.slice(0, 10).map((history) => (
                    <div key={history.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant={
                          history.status === 'completed' ? 'default' :
                          history.status === 'failed' ? 'destructive' : 'secondary'
                        }>
                          {history.status === 'completed' && <Check className="h-3 w-3 mr-1" />}
                          {history.status === 'failed' && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {history.status === 'running' && <RefreshCw className="h-3 w-3 mr-1 animate-spin" />}
                          {history.status}
                        </Badge>
                        <div>
                          <p className="text-sm font-medium">
                            {history.recordsMigrated} records migrated
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(history.startTime).toLocaleString('vi-VN')}
                            {history.endTime && ` - ${new Date(history.endTime).toLocaleString('vi-VN')}`}
                          </p>
                        </div>
                      </div>
                      {history.errors && (
                        <div className="text-xs text-red-600 max-w-xs truncate">
                          {history.errors}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Chưa có lịch sử migration nào</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}