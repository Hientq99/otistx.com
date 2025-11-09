import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { AuditTable } from "@/components/audit-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type AuditLog } from "@shared/schema";
import { type User } from "@/lib/auth";
import { Shield, Activity, AlertTriangle, Users } from "lucide-react";

export default function Audit() {
  const { data: auditLogs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs"],
  });

  // Mock users for audit table - in real app this would come from API
  const users: User[] = [
    { id: 1, username: "admin", fullName: "Nguyễn Thành", role: "admin" }
  ];

  // Calculate audit stats
  const todayLogs = auditLogs.filter(log => {
    const today = new Date();
    const logDate = new Date(log.timestamp);
    return logDate.toDateString() === today.toDateString();
  });

  const loginActions = auditLogs.filter(log => log.action === 'LOGIN');
  const criticalActions = auditLogs.filter(log => 
    ['BUDGET_APPROVE', 'PROJECT_CREATE', 'BUDGET_MODIFY'].includes(log.action)
  );

  return (
    <Layout>
      <div className="space-y-8">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nhật ký Kiểm toán</h1>
          <p className="mt-1 text-sm text-gray-600">
            Theo dõi tất cả hoạt động của người dùng trong hệ thống
          </p>
        </div>

        {/* Audit Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-primary bg-opacity-10 rounded-md flex items-center justify-center">
                    <Activity className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Hoạt động Hôm nay</p>
                  <p className="text-2xl font-semibold text-gray-900">{todayLogs.length}</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center text-sm">
                  <span className="text-accent font-medium">Bình thường</span>
                  <span className="text-gray-600 ml-1">mức độ hoạt động</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-accent bg-opacity-10 rounded-md flex items-center justify-center">
                    <Users className="h-4 w-4 text-accent" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Lượt Đăng nhập</p>
                  <p className="text-2xl font-semibold text-gray-900">{loginActions.length}</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center text-sm">
                  <span className="text-accent font-medium">+2</span>
                  <span className="text-gray-600 ml-1">hôm nay</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-warning bg-opacity-10 rounded-md flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Hành động Quan trọng</p>
                  <p className="text-2xl font-semibold text-gray-900">{criticalActions.length}</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center text-sm">
                  <span className="text-warning font-medium">Cần chú ý</span>
                  <span className="text-gray-600 ml-1">theo dõi đặc biệt</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-primary bg-opacity-10 rounded-md flex items-center justify-center">
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Mức Bảo mật</p>
                  <p className="text-2xl font-semibold text-gray-900">Cao</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center text-sm">
                  <span className="text-accent font-medium">100%</span>
                  <span className="text-gray-600 ml-1">được ghi lại</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Audit Actions Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Tóm tắt Hành động Gần đây</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Đăng nhập</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {auditLogs.filter(l => l.action === 'LOGIN').length}
                    </p>
                  </div>
                  <div className="w-8 h-8 bg-primary bg-opacity-10 rounded-md flex items-center justify-center">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Tạo/Cập nhật Dự án</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {auditLogs.filter(l => ['PROJECT_CREATE', 'PROJECT_UPDATE'].includes(l.action)).length}
                    </p>
                  </div>
                  <div className="w-8 h-8 bg-accent bg-opacity-10 rounded-md flex items-center justify-center">
                    <Activity className="h-4 w-4 text-accent" />
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Phê duyệt Ngân sách</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {auditLogs.filter(l => ['BUDGET_APPROVE', 'BUDGET_MODIFY'].includes(l.action)).length}
                    </p>
                  </div>
                  <div className="w-8 h-8 bg-warning bg-opacity-10 rounded-md flex items-center justify-center">
                    <Shield className="h-4 w-4 text-warning" />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audit Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>Chi tiết Nhật ký Kiểm toán</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Chưa có nhật ký kiểm toán nào</p>
              </div>
            ) : (
              <AuditTable logs={auditLogs} users={users} />
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
