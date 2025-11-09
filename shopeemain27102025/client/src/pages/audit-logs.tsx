import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FixedHeader } from "@/components/fixed-header";
import { Shield, Search, FileText, Filter, Calendar, User, Activity, Eye, ChevronLeft, ChevronRight, Database } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface AuditLog {
  id: number;
  userId: number;
  targetUserId?: number;
  action: string;
  description: string;
  beforeData?: any;
  afterData?: any;
  ipAddress: string;
  timestamp: string;
  user?: {
    username: string;
    fullName: string;
  };
  targetUser?: {
    username: string;
    fullName: string;
  };
}

export default function AuditLogsPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  // Check if user has permission to access this page
  if (!user || user.role !== 'superadmin') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <FixedHeader />
        <main className="pt-16">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <Card>
              <CardContent className="p-8 text-center">
                <Shield className="h-16 w-16 mx-auto text-red-500 mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Không có quyền truy cập
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Chỉ Super Admin mới có thể truy cập trang Audit Logs.
                </p>
                <Button onClick={() => window.history.back()}>
                  Quay lại
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  // Fetch audit logs with pagination and filtering
  const { data: auditLogs = [], isLoading } = useQuery({
    queryKey: ["/api/audit-logs", page, limit, searchTerm, actionFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(searchTerm && { search: searchTerm }),
        ...(actionFilter !== 'all' && { action: actionFilter })
      });
      
      return fetch(`/api/audit-logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      }).then(res => res.json());
    }
  });

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'login':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'logout':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      case 'user_create':
      case 'user_update':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'user_delete':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'update_balance':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'CONFIG_CREATE':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'PRICING_INITIALIZE':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd/MM/yyyy HH:mm:ss', { locale: vi });
  };

  const formatJsonData = (data: any) => {
    if (!data) return null;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <FixedHeader />
      <div className="pt-16">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-7xl mx-auto">
            {/* Enhanced Header Section */}
            <div className="mb-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl shadow-lg">
                  <Database className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    Nhật ký Kiểm toán
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    Theo dõi và giám sát tất cả hoạt động của quản trị viên trong hệ thống
                  </p>
                </div>
              </div>
              
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card className="border-0 shadow-md bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Tổng hoạt động</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{auditLogs.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-0 shadow-md bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                        <User className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Đăng nhập</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {auditLogs.filter((log: AuditLog) => log.action === 'login').length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-0 shadow-md bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                        <Shield className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Thay đổi user</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {auditLogs.filter((log: AuditLog) => ['user_create', 'user_update', 'user_delete'].includes(log.action)).length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-0 shadow-md bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                        <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Hôm nay</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {auditLogs.filter((log: AuditLog) => {
                            const today = new Date().toDateString();
                            const logDate = new Date(log.timestamp).toDateString();
                            return logDate === today;
                          }).length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Enhanced Filters Section */}
            <Card className="border-0 shadow-lg bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm mb-6">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Filter className="h-5 w-5 text-orange-600" />
                  Bộ lọc và Tìm kiếm
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Tìm kiếm
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="Tìm kiếm theo mô tả, username, IP..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 border-gray-200 dark:border-gray-700 focus:ring-orange-500 focus:border-orange-500"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Loại hành động
                    </label>
                    <Select value={actionFilter} onValueChange={setActionFilter}>
                      <SelectTrigger className="border-gray-200 dark:border-gray-700 focus:ring-orange-500 focus:border-orange-500">
                        <SelectValue placeholder="Chọn loại hành động" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả hành động</SelectItem>
                        <SelectItem value="login">🔐 Đăng nhập</SelectItem>
                        <SelectItem value="logout">🚪 Đăng xuất</SelectItem>
                        <SelectItem value="user_create">👤 Tạo user</SelectItem>
                        <SelectItem value="user_update">✏️ Cập nhật user</SelectItem>
                        <SelectItem value="user_delete">🗑️ Xóa user</SelectItem>
                        <SelectItem value="update_balance">💰 Cập nhật số dư</SelectItem>
                        <SelectItem value="CONFIG_CREATE">➕ Tạo cấu hình</SelectItem>
                        <SelectItem value="PRICING_INITIALIZE">💲 Khởi tạo giá</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Số bản ghi
                    </label>
                    <Select value={limit.toString()} onValueChange={(value) => setLimit(parseInt(value))}>
                      <SelectTrigger className="border-gray-200 dark:border-gray-700 focus:ring-orange-500 focus:border-orange-500">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 bản ghi</SelectItem>
                        <SelectItem value="20">20 bản ghi</SelectItem>
                        <SelectItem value="50">50 bản ghi</SelectItem>
                        <SelectItem value="100">100 bản ghi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Enhanced Audit Logs Table */}
            <Card className="border-0 shadow-lg bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
              <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <FileText className="h-6 w-6 text-orange-600" />
                  Chi tiết Nhật ký Kiểm toán
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center p-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Đang tải dữ liệu...</p>
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-center p-12">
                    <Database className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Không có dữ liệu
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      Chưa có nhật ký kiểm toán nào phù hợp với bộ lọc đã chọn
                    </p>
                  </div>
                ) : (
                  <div className="relative overflow-hidden">
                    <div className="max-h-[600px] overflow-y-auto">
                      <Table>
                        <TableHeader className="bg-gray-50 dark:bg-slate-900/50 sticky top-0 z-10">
                          <TableRow>
                            <TableHead className="font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-slate-900/50">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                Thời gian
                              </div>
                            </TableHead>
                            <TableHead className="font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-slate-900/50">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                Người thực hiện
                              </div>
                            </TableHead>
                            <TableHead className="font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-slate-900/50">
                              <div className="flex items-center gap-2">
                                <Activity className="h-4 w-4" />
                                Hành động
                              </div>
                            </TableHead>
                            <TableHead className="font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-slate-900/50">
                              Mô tả
                            </TableHead>
                            <TableHead className="font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-slate-900/50">
                              Đối tượng
                            </TableHead>
                            <TableHead className="font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-slate-900/50">
                              IP Address
                            </TableHead>
                            <TableHead className="font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-slate-900/50">
                              <div className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                Dữ liệu
                              </div>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {auditLogs.map((log: AuditLog, index: number) => (
                            <TableRow 
                              key={log.id} 
                              className={`hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors ${
                                index % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50/50 dark:bg-slate-800/30'
                              }`}
                            >
                              <TableCell className="font-mono text-sm py-4">
                                <div className="flex flex-col">
                                  <span className="font-semibold text-gray-900 dark:text-white">
                                    {format(new Date(log.timestamp), 'dd/MM/yyyy', { locale: vi })}
                                  </span>
                                  <span className="text-gray-600 dark:text-gray-400">
                                    {format(new Date(log.timestamp), 'HH:mm:ss', { locale: vi })}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                                    {(log.user?.username || 'N')[0].toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-gray-900 dark:text-white">
                                      {log.user?.username || 'N/A'}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">
                                      {log.user?.fullName || 'N/A'}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                <Badge 
                                  variant="secondary"
                                  className={`${getActionBadgeColor(log.action)} font-semibold px-3 py-1 rounded-full`}
                                >
                                  {log.action}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-4 max-w-xs">
                                <div className="truncate font-medium text-gray-900 dark:text-white" title={log.description}>
                                  {log.description}
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                {log.targetUser ? (
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                                      {log.targetUser.username[0].toUpperCase()}
                                    </div>
                                    <div>
                                      <div className="font-semibold text-gray-900 dark:text-white text-sm">
                                        {log.targetUser.username}
                                      </div>
                                      <div className="text-xs text-gray-600 dark:text-gray-400">
                                        {log.targetUser.fullName}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 dark:text-gray-500 font-medium">-</span>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-sm py-4 text-gray-700 dark:text-gray-300">
                                <div className="bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded text-xs">
                                  {log.ipAddress}
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                {log.beforeData || log.afterData ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedLog(log);
                                      setIsDetailDialogOpen(true);
                                    }}
                                    className="text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    Xem chi tiết
                                  </Button>
                                ) : (
                                  <span className="text-gray-400 dark:text-gray-500 font-medium">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Enhanced Pagination */}
            <div className="flex items-center justify-between mt-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-lg p-4 shadow-md">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Hiển thị <span className="font-semibold text-gray-900 dark:text-white">{auditLogs.length}</span> bản ghi 
                trên trang <span className="font-semibold text-gray-900 dark:text-white">{page}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-slate-700"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Trước
                </Button>
                <div className="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 rounded-md text-sm font-semibold">
                  {page}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={auditLogs.length < limit}
                  className="border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-slate-700"
                >
                  Sau
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>

            {/* Detail Dialog */}
            <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-orange-600" />
                    Chi tiết Nhật ký Kiểm toán
                  </DialogTitle>
                </DialogHeader>
                {selectedLog && (
                  <div className="space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg">Thông tin cơ bản</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">ID:</span>
                            <span className="font-mono">{selectedLog.id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Thời gian:</span>
                            <span className="font-mono">{formatDate(selectedLog.timestamp)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">IP Address:</span>
                            <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                              {selectedLog.ipAddress}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Hành động:</span>
                            <Badge className={getActionBadgeColor(selectedLog.action)}>
                              {selectedLog.action}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg">Người thực hiện</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                              {(selectedLog.user?.username || 'N')[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold">{selectedLog.user?.username || 'N/A'}</div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                {selectedLog.user?.fullName || 'N/A'}
                              </div>
                            </div>
                          </div>
                          {selectedLog.targetUser && (
                            <div>
                              <Separator className="my-3" />
                              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Đối tượng:</div>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                                  {selectedLog.targetUser.username[0].toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-semibold">{selectedLog.targetUser.username}</div>
                                  <div className="text-sm text-gray-600 dark:text-gray-400">
                                    {selectedLog.targetUser.fullName}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* Description */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Mô tả chi tiết</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-900 dark:text-white">{selectedLog.description}</p>
                      </CardContent>
                    </Card>

                    {/* Data Changes */}
                    {(selectedLog.beforeData || selectedLog.afterData) && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg">Thay đổi dữ liệu</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {selectedLog.beforeData && (
                              <div>
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                  <h4 className="font-semibold text-red-600 dark:text-red-400">Dữ liệu trước</h4>
                                </div>
                                <ScrollArea className="h-64 w-full">
                                  <pre className="text-xs font-mono bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800 overflow-auto">
                                    {formatJsonData(selectedLog.beforeData)}
                                  </pre>
                                </ScrollArea>
                              </div>
                            )}
                            {selectedLog.afterData && (
                              <div>
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                  <h4 className="font-semibold text-green-600 dark:text-green-400">Dữ liệu sau</h4>
                                </div>
                                <ScrollArea className="h-64 w-full">
                                  <pre className="text-xs font-mono bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800 overflow-auto">
                                    {formatJsonData(selectedLog.afterData)}
                                  </pre>
                                </ScrollArea>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}