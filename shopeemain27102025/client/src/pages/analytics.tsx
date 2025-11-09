import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { FixedHeader } from '@/components/fixed-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  BarChart3, 
  Download, 
  Activity, 
  DollarSign, 
  Users, 
  Calendar,
  Clock,
  Shield,
  Eye,
  TrendingUp,
  Target,
  FileText
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';

// Interface definitions for analytics data
interface OverviewData {
  totalUsage: number;
  totalRevenue: number;
  totalLogins: number;
  serviceUsage: Array<{ service: string; count: number; revenue: number }>;
  dailyUsageTrend: Array<{ date: string; count: number }>;
  period: string;
}

interface UserBehaviorData {
  topUsersByRevenue: Array<{
    userId: number;
    username: string;
    fullName: string;
    revenue: number;
    transactionCount: number;
  }>;
  mostActiveUsers: Array<{
    userId: number;
    username: string;
    transactionCount: number;
    loginCount: number;
  }>;
  suspiciousIPs: Array<{
    ip: string;
    requestCount: number;
    userCount: number;
    avgRequestsPerUser: number;
    usernames: string;
  }>;
  totalActiveUsers: number;
  newUsers: number;
  returningUsers: number;
}



interface PerformanceData {
  servicePerformance: Array<{
    service: string;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    successRate: number;
    avgProcessingTime: number;
  }>;
  errorAnalysis: {
    phoneRentalErrors: number;
    tiktokRentalErrors: number;
    accountCheckErrors: number;
    trackingCheckErrors: number;
  };
  period: string;
}

interface VoucherFreeshipData {
  summary: {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    pendingOperations: number;
    successRate: number;
    totalVouchersFound: number;
    totalVouchersSaved: number;
    totalVouchersFailed: number;
    saveSuccessRate: number;
    averageVouchersPerOperation: number;
    totalRevenue: number;
  };
  dailyBreakdown: Array<{
    date: string;
    operations: number;
    successful: number;
    failed: number;
    vouchersFound: number;
    vouchersSaved: number;
    revenue: number;
  }>;
  topUsers: Array<{
    userId: number;
    operations: number;
    vouchersSaved: number;
    totalSpent: number;
  }>;
  period: {
    startDate: string;
    endDate: string;
    periodType: string;
  };
}



// Voucher Freeship Analytics Component
function VoucherFreeshipAnalytics({ selectedPeriod }: { selectedPeriod: string }) {
  const { data: voucherData, isLoading } = useQuery<VoucherFreeshipData>({
    queryKey: [`/api/analytics/voucher-freeship?period=${selectedPeriod}`],
    enabled: true,
    staleTime: 10 * 60 * 1000, // 10 minutes cache - EXTREME EGRESS REDUCTION
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchInterval: false,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
        <span className="ml-2">Đang tải thống kê voucher freeship...</span>
      </div>
    );
  }

  if (!voucherData) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-gray-500">Không có dữ liệu voucher freeship cho khoảng thời gian này</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Tổng thao tác</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{voucherData.summary.totalOperations}</div>
            <p className="text-xs text-gray-500 mt-1">
              {voucherData.summary.successfulOperations} thành công, {voucherData.summary.failedOperations} thất bại
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Tỷ lệ thành công</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{voucherData.summary.successRate}%</div>
            <p className="text-xs text-gray-500 mt-1">
              Hiệu suất thao tác
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Voucher đã lưu</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{voucherData.summary.totalVouchersSaved}</div>
            <p className="text-xs text-gray-500 mt-1">
              Trên {voucherData.summary.totalVouchersFound} voucher tìm thấy
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Doanh thu</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(voucherData.summary.totalRevenue)}</div>
            <p className="text-xs text-gray-500 mt-1">
              Tổng thu từ voucher freeship
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Thống kê chi tiết</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <span>Tỷ lệ lưu voucher thành công</span>
                <span className="font-bold text-green-600">{voucherData.summary.saveSuccessRate}%</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <span>Trung bình voucher/thao tác</span>
                <span className="font-bold">{voucherData.summary.averageVouchersPerOperation}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <span>Thao tác đang chờ</span>
                <span className="font-bold text-yellow-600">{voucherData.summary.pendingOperations}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <span>Voucher thất bại</span>
                <span className="font-bold text-red-600">{voucherData.summary.totalVouchersFailed}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top người dùng</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {voucherData.topUsers.slice(0, 5).map((user, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div>
                    <p className="font-medium">User ID: {user.userId}</p>
                    <p className="text-sm text-gray-600">{user.operations} thao tác</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-blue-600">{user.vouchersSaved} voucher</p>
                    <p className="text-sm text-gray-600">{formatCurrency(user.totalSpent)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Breakdown Chart */}
      {voucherData.dailyBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Biểu đồ theo ngày</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={voucherData.dailyBreakdown}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="operations" fill="#f97316" name="Thao tác" />
                <Bar dataKey="vouchersSaved" fill="#10b981" name="Voucher đã lưu" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Analytics() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [selectedService, setSelectedService] = useState('all');
  const [exportDateRange, setExportDateRange] = useState({
    startDate: '',
    endDate: ''
  });

  // Fetch analytics data - BALANCED EGRESS REDUCTION - FIXED: Pass period as query param
  const { data: overviewData, isLoading: overviewLoading } = useQuery<OverviewData>({
    queryKey: [`/api/analytics/overview?period=${selectedPeriod}`],
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes cache - Cho phép admin refresh data
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Allow refresh on page load
  });

  const { data: userBehaviorData = {} as UserBehaviorData } = useQuery<UserBehaviorData>({
    queryKey: [`/api/analytics/user-behavior?period=${selectedPeriod}`],
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes cache - Cho phép admin refresh data
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Allow refresh on page load
  });



  const { data: performanceData = {} as PerformanceData } = useQuery<PerformanceData>({
    queryKey: [`/api/analytics/performance?period=${selectedPeriod}`],
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes cache - Cho phép admin refresh data
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Allow refresh on page load
  });

  // Export analytics to CSV
  const handleExportCSV = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      
      if (exportDateRange.startDate) {
        params.append('startDate', exportDateRange.startDate);
      }
      if (exportDateRange.endDate) {
        params.append('endDate', exportDateRange.endDate);
      }
      
      const response = await fetch(`/api/analytics/export?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const dateLabel = exportDateRange.startDate && exportDateRange.endDate 
          ? `${exportDateRange.startDate}_to_${exportDateRange.endDate}`
          : new Date().toISOString().split('T')[0];
        
        a.download = `analytics_report_${dateLabel}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Lỗi khi xuất báo cáo Excel');
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Lỗi khi xuất báo cáo Excel');
    }
  };

  // Format currency for Vietnamese VND
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Colors for charts
  const COLORS = ['#f97316', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#84cc16'];

  if (isLoading || overviewLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Đang tải dữ liệu phân tích...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <FixedHeader />
      <div className="pt-16 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header with Period Filter - Responsive */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-orange-500" />
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Comprehensive system analytics and reporting</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Chọn thời gian" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Hôm nay</SelectItem>
                  <SelectItem value="week">7 ngày qua</SelectItem>
                  <SelectItem value="month">30 ngày qua</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleExportCSV} className="bg-orange-500 hover:bg-orange-600 w-full sm:w-auto">
                <Download className="h-4 w-4 mr-2" />
                <span className="sm:hidden">Xuất</span>
                <span className="hidden sm:inline">Xuất Excel</span>
              </Button>
            </div>
          </div>

          {/* Analytics Dashboard - Responsive Design */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1">
              <TabsTrigger value="overview" className="text-xs sm:text-sm">Tổng quan</TabsTrigger>
              <TabsTrigger value="services" className="text-xs sm:text-sm">Dịch vụ</TabsTrigger>
              <TabsTrigger value="users" className="text-xs sm:text-sm">Người dùng</TabsTrigger>
              <TabsTrigger value="voucher-freeship" className="text-xs sm:text-sm">Voucher</TabsTrigger>
              <TabsTrigger value="performance" className="text-xs sm:text-sm">Hiệu suất</TabsTrigger>
              <TabsTrigger value="filters" className="text-xs sm:text-sm">Lọc & Xuất</TabsTrigger>
              <TabsTrigger value="security" className="text-xs sm:text-sm">Bảo mật</TabsTrigger>
              <TabsTrigger value="growth" className="text-xs sm:text-sm">Tăng trưởng</TabsTrigger>
            </TabsList>

            {/* 1. Dashboard Overview - Tổng quan hiển thị */}
            <TabsContent value="overview" className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Tổng sử dụng</CardTitle>
                    <Activity className="h-4 w-4 text-orange-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overviewData?.totalUsage || 0}</div>
                    <p className="text-xs text-muted-foreground">Lượt sử dụng dịch vụ</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Tổng doanh thu</CardTitle>
                    <DollarSign className="h-4 w-4 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(overviewData?.totalRevenue || 0)}</div>
                    <p className="text-xs text-muted-foreground">Doanh thu từ dịch vụ</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Đăng nhập</CardTitle>
                    <Users className="h-4 w-4 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overviewData?.totalLogins || 0}</div>
                    <p className="text-xs text-muted-foreground">Lượt đăng nhập</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Thời gian</CardTitle>
                    <Calendar className="h-4 w-4 text-purple-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overviewData?.period || 'week'}</div>
                    <p className="text-xs text-muted-foreground">Chu kỳ báo cáo</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6">
                {/* Service Usage Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle>Phân bố sử dụng dịch vụ</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={overviewData?.serviceUsage || []}
                          dataKey="count"
                          nameKey="service"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          fill="#8884d8"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {(overviewData?.serviceUsage || []).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Daily Usage Trend */}
                <Card>
                  <CardHeader>
                    <CardTitle>Xu hướng sử dụng hàng ngày</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={overviewData?.dailyUsageTrend || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="count" stroke="#f97316" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>


            {/* 2. Service Analysis - Phân tích theo dịch vụ */}
            <TabsContent value="services" className="space-y-4 sm:space-y-6">
              <div className="flex items-center gap-2 sm:gap-4 mb-4 sm:mb-6 flex-wrap">
                <Select value={selectedService} onValueChange={setSelectedService}>
                  <SelectTrigger className="w-full sm:w-60">
                    <SelectValue placeholder="Chọn dịch vụ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone-rental">Thuê số điện thoại</SelectItem>
                    <SelectItem value="tracking-check">Theo dõi đơn hàng</SelectItem>
                    <SelectItem value="account-check">Kiểm tra tài khoản</SelectItem>
                    <SelectItem value="phone-check">Kiểm tra số điện thoại</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
                {(overviewData?.serviceUsage || []).map((service, index) => (
                  <Card key={index}>
                    <CardHeader>
                      <CardTitle className="text-lg">{service.service}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Lượt sử dụng:</span>
                          <span className="font-bold">{service.count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Doanh thu:</span>
                          <span className="font-bold text-green-600">{formatCurrency(service.revenue)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* 3. User Behavior Analysis - Phân tích người dùng */}
            <TabsContent value="users" className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Người dùng hoạt động</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userBehaviorData?.totalActiveUsers || 0}</div>
                    <p className="text-xs text-muted-foreground">Có giao dịch trong kỳ</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Người dùng mới</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userBehaviorData?.newUsers || 0}</div>
                    <p className="text-xs text-muted-foreground">Đăng ký trong kỳ</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Người dùng quay lại</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userBehaviorData?.returningUsers || 0}</div>
                    <p className="text-xs text-muted-foreground">Đã từng sử dụng</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                {/* Top Users by Revenue */}
                <Card>
                  <CardHeader>
                    <CardTitle>Top người dùng theo doanh thu</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 sm:space-y-3">
                      {(userBehaviorData?.topUsersByRevenue || []).slice(0, 5).map((user, index) => (
                        <div key={index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg gap-2 sm:gap-0">
                          <div>
                            <p className="font-medium">{user.username}</p>
                            <p className="text-sm text-gray-600">{user.fullName}</p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="font-bold text-green-600">{formatCurrency(user.revenue)}</p>
                            <p className="text-sm text-gray-600">{user.transactionCount} giao dịch</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Most Active Users */}
                <Card>
                  <CardHeader>
                    <CardTitle>Người dùng hoạt động nhất</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {(userBehaviorData?.mostActiveUsers || []).slice(0, 5).map((user, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div>
                            <p className="font-medium">{user.username}</p>
                            <p className="text-sm text-gray-600">{user.transactionCount} giao dịch</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{user.loginCount} lần đăng nhập</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* 4. Voucher Freeship Analytics - Thống kê voucher freeship */}
            <TabsContent value="voucher-freeship" className="space-y-4 sm:space-y-6">
              <VoucherFreeshipAnalytics selectedPeriod={selectedPeriod} />
            </TabsContent>

            {/* 5. Performance Analytics - Hành vi và hiệu suất dịch vụ */}
            <TabsContent value="performance" className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                {/* Service Performance */}
                <Card>
                  <CardHeader>
                    <CardTitle>Hiệu suất dịch vụ</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {(performanceData?.servicePerformance || []).map((service, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="font-medium">{service.service}</h4>
                            <span className="text-sm font-bold text-green-600">
                              {service.successRate.toFixed(1)}% thành công
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 grid grid-cols-2 gap-2">
                            <span>Tổng yêu cầu: {service.totalRequests}</span>
                            <span>Thành công: {service.successfulRequests}</span>
                            <span>Thất bại: {service.failedRequests}</span>
                            <span>Thời gian xử lý: {service.avgProcessingTime}s</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Error Analysis */}
                <Card>
                  <CardHeader>
                    <CardTitle>Phân tích lỗi</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <span>Lỗi thuê số Shopee:</span>
                        <span className="font-bold text-red-600">{performanceData?.errorAnalysis?.phoneRentalErrors || 0}</span>
                      </div>
                      <div className="flex justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <span>Lỗi thuê số TikTok:</span>
                        <span className="font-bold text-red-600">{performanceData?.errorAnalysis?.tiktokRentalErrors || 0}</span>
                      </div>
                      <div className="flex justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <span>Lỗi kiểm tra TK:</span>
                        <span className="font-bold text-red-600">{performanceData?.errorAnalysis?.accountCheckErrors || 0}</span>
                      </div>
                      <div className="flex justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <span>Lỗi theo dõi đơn hàng:</span>
                        <span className="font-bold text-red-600">{performanceData?.errorAnalysis?.trackingCheckErrors || 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* 6. Filtering and Export - Lọc và xuất dữ liệu */}
            <TabsContent value="filters" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="h-5 w-5 text-orange-500" />
                    Xuất báo cáo Excel
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label htmlFor="export-start-date" className="text-sm">Từ ngày</Label>
                      <Input
                        id="export-start-date"
                        type="date"
                        value={exportDateRange.startDate}
                        onChange={(e) => setExportDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                        className="mt-1"
                        data-testid="input-export-start-date"
                      />
                    </div>
                    <div>
                      <Label htmlFor="export-end-date" className="text-sm">Đến ngày</Label>
                      <Input
                        id="export-end-date"
                        type="date"
                        value={exportDateRange.endDate}
                        onChange={(e) => setExportDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                        className="mt-1"
                        data-testid="input-export-end-date"
                      />
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">Dữ liệu bao gồm trong Excel (5 sheets):</h4>
                    <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                      <li>• <span className="font-medium">Sheet 1 - Nạp tiền:</span> Lịch sử nạp tiền QR Code với mã giao dịch</li>
                      <li>• <span className="font-medium">Sheet 2 - Dịch vụ:</span> Tổng hợp sử dụng dịch vụ theo người dùng</li>
                      <li>• <span className="font-medium">Sheet 3 - Tổng hợp:</span> Thống kê tổng quan doanh thu và hiệu suất</li>
                      <li>• <span className="font-medium">Sheet 4 - Chi tiết khách hàng:</span> Phân tích chi tiết từng người dùng</li>
                      <li>• <span className="font-medium">Sheet 5 - Lịch sử sử dụng:</span> Chi tiết từng lần sử dụng dịch vụ với input/output</li>
                    </ul>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <Button 
                      onClick={handleExportCSV} 
                      className="flex-1 bg-orange-500 hover:bg-orange-600"
                      disabled={!exportDateRange.startDate || !exportDateRange.endDate}
                      data-testid="button-export-excel"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      <span className="sm:hidden">Xuất Excel</span>
                      <span className="hidden sm:inline">Xuất báo cáo Excel</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setExportDateRange({ startDate: '', endDate: '' })}
                      className="flex-1 sm:flex-none"
                    >
                      Xóa khoảng ngày
                    </Button>
                  </div>
                  
                  {exportDateRange.startDate && exportDateRange.endDate && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Báo cáo sẽ bao gồm dữ liệu từ {new Date(exportDateRange.startDate).toLocaleDateString('vi-VN')} 
                      đến {new Date(exportDateRange.endDate).toLocaleDateString('vi-VN')}
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Bộ lọc hiển thị</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium">Thời gian hiển thị</Label>
                      <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="day">Hôm nay</SelectItem>
                          <SelectItem value="week">7 ngày qua</SelectItem>
                          <SelectItem value="month">30 ngày qua</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium">Dịch vụ</Label>
                      <Select value={selectedService} onValueChange={setSelectedService}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả dịch vụ</SelectItem>
                          <SelectItem value="phone-rental">Thuê số điện thoại</SelectItem>
                          <SelectItem value="tracking-check">Theo dõi đơn hàng</SelectItem>
                          <SelectItem value="account-check">Kiểm tra tài khoản</SelectItem>
                          <SelectItem value="phone-check">Kiểm tra số điện thoại</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 7. Security Monitoring - Giám sát bảo mật */}
            <TabsContent value="security" className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-red-500" />
                      IP đáng ngờ
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {(userBehaviorData?.suspiciousIPs || []).slice(0, 5).map((ip, index) => (
                        <div key={index} className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-medium">{ip.ip}</p>
                              <p className="text-sm text-gray-600">{ip.userCount} người dùng</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-red-600">{ip.requestCount} yêu cầu</p>
                              <p className="text-sm text-gray-600">{ip.avgRequestsPerUser} TB/người</p>
                            </div>
                          </div>
                          <div className="border-t border-red-200 dark:border-red-700 pt-2">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              <span className="font-medium">Người dùng: </span>
                              {ip.usernames || 'Không xác định'}
                            </p>
                          </div>
                        </div>
                      ))}
                      {(!userBehaviorData?.suspiciousIPs || userBehaviorData.suspiciousIPs.length === 0) && (
                        <div className="text-center text-gray-500 py-8">
                          <Shield className="h-12 w-12 mx-auto mb-2 text-green-500" />
                          <p>Không phát hiện hoạt động đáng ngờ</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5 text-blue-500" />
                      Giám sát hệ thống
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <span>Trạng thái hệ thống:</span>
                        <span className="font-bold text-green-600">Hoạt động bình thường</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <span>Phiên đang hoạt động:</span>
                        <span className="font-bold text-blue-600">{userBehaviorData?.totalActiveUsers || 0}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                        <span>Hoạt động 15 phút qua:</span>
                        <span className="font-bold text-orange-600">{overviewData?.totalUsage || 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* 8. Growth Metrics - Thống kê tăng trưởng */}
            <TabsContent value="growth" className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-green-500" />
                      Tăng trưởng doanh thu
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-green-600">
                          {formatCurrency(overviewData?.totalRevenue || 0)}
                        </div>
                        <p className="text-sm text-gray-600">Doanh thu {overviewData?.period || 'tuần'} này</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                          <div className="font-bold">{overviewData?.totalUsage || 0}</div>
                          <div className="text-sm text-gray-600">Lượt sử dụng</div>
                        </div>
                        <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <div className="font-bold">{userBehaviorData?.totalActiveUsers || 0}</div>
                          <div className="text-sm text-gray-600">Người dùng hoạt động</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-purple-500" />
                      Chỉ số hiệu suất
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {(performanceData?.servicePerformance || []).map((service, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <span className="text-sm">{service.service}:</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-green-500 h-2 rounded-full" 
                                style={{ width: `${service.successRate}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-medium">{service.successRate.toFixed(1)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}