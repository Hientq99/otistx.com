import { useQuery } from "@tanstack/react-query";
import { FixedHeader } from "@/components/fixed-header";
import { StatsCard } from "@/components/stats-card";
import { ActivityFeed } from "@/components/activity-feed";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { 
  DollarSign, 
  Users, 
  ShoppingCart, 
  BarChart3,
  Smartphone,
  Cookie,
  Package,
  Mail,
  Plus,
  Eye,
  CheckCircle,
  Clock,
  AlertCircle,
  Shield,
  Activity,
  FileText
} from "lucide-react";
import { format } from "date-fns";

interface DashboardStats {
  totalBalance: string;
  activeRentals: number;
  pendingOrders: number;
  successRate: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["/api/activities"],
  });

  const { data: phoneRentals = [] } = useQuery({
    queryKey: ["/api/phone-rentals"],
  });

  const { data: shopeeCookies = [] } = useQuery({
    queryKey: ["/api/shopee-cookies"],
  });

  const { data: trackingChecks = [] } = useQuery({
    queryKey: ["/api/tracking-checks"],
  });

  const { data: emailAdditions = [] } = useQuery({
    queryKey: ["/api/email-additions"],
  });

  const recentPhoneRentals = (phoneRentals as any[]).slice(0, 5);
  const recentCookies = (shopeeCookies as any[]).slice(0, 5);
  const recentTracking = (trackingChecks as any[]).slice(0, 5);

  if (isAdmin) {
    return (
      <>
        <FixedHeader />
        <main className="pt-16">
          <div className="container mx-auto px-4 py-8">
            <div className="max-w-6xl mx-auto">
              {/* Header */}
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center justify-center gap-3">
                  <BarChart3 className="h-8 w-8 text-orange-600" />
                  Dashboard
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                  Quản lý tài khoản và dịch vụ
                </p>
                {(user?.role === 'admin' || user?.role === 'superadmin') && (
                  <Badge variant="secondary" className="bg-orange-100 text-orange-800 mt-2">
                    {user?.role === 'superadmin' ? 'Super Admin' : 'Quản trị viên'}
                  </Badge>
                )}
              </div>
              
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
                <StatsCard
                  title="Tổng người dùng"
                  value="156"
                  icon={Users}
                  change="+12"
                  changeLabel="người dùng mới tháng này"
                  changeType="positive"
                  iconColor="text-blue-600"
                />
                <StatsCard
                  title="Tổng số thuê"
                  value={(phoneRentals as any[]).length.toString()}
                  icon={Smartphone}
                  change="+23"
                  changeLabel="số thuê mới tuần này"
                  changeType="positive"
                  iconColor="text-green-600"
                />
                <StatsCard
                  title="Cookie được quản lý"
                  value={(shopeeCookies as any[]).length.toString()}
                  icon={Cookie}
                  change="+8"
                  changeLabel="cookie mới tuần này"
                  changeType="positive"
                  iconColor="text-purple-600"
                />
                <StatsCard
                  title="Doanh thu tháng"
                  value="48.2M VNĐ"
                  icon={DollarSign}
                  change="+15.2%"
                  changeLabel="so với tháng trước"
                  changeType="positive"
                  iconColor="text-orange-600"
                />
              </div>

              <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="overview">Tổng quan</TabsTrigger>
                  <TabsTrigger value="users">Người dùng</TabsTrigger>
                  <TabsTrigger value="services">Dịch vụ</TabsTrigger>
                  <TabsTrigger value="analytics">Phân tích</TabsTrigger>
                </TabsList>
                
                <TabsContent value="overview" className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-1">
                    <Card>
                      <CardHeader>
                        <CardTitle>Thống kê dịch vụ</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Thuê số điện thoại</span>
                          <span className="font-medium">{(phoneRentals as any[]).length} số</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Cookie Shopee</span>
                          <span className="font-medium">{(shopeeCookies as any[]).length} tài khoản</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Tracking đơn hàng</span>
                          <span className="font-medium">{(trackingChecks as any[]).length} đơn</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Email additions</span>
                          <span className="font-medium">{(emailAdditions as any[]).length} email</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
                
                <TabsContent value="users" className="space-y-4">
                  {isAdmin ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Quản lý người dùng
                          </CardTitle>
                          <CardDescription>
                            Thêm, sửa, xóa người dùng hệ thống
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Link href="/user-management">
                            <Button className="w-full">
                              Quản lý người dùng
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            Phân tích & Báo cáo
                          </CardTitle>
                          <CardDescription>
                            Báo cáo doanh thu và lịch sử nạp tiền
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Link href="/analytics">
                            <Button className="w-full">
                              Xem báo cáo
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                      
                      {user?.role === 'superadmin' && (
                        <>
                          <Card>
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <DollarSign className="h-5 w-5" />
                                Cấu hình giá
                              </CardTitle>
                              <CardDescription>
                                Quản lý giá các dịch vụ
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              <Link href="/service-pricing">
                                <Button className="w-full">
                                  Cấu hình giá
                                </Button>
                              </Link>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5" />
                                Cấu hình hệ thống
                              </CardTitle>
                              <CardDescription>
                                Key proxy, sim service và API keys
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              <Link href="/system-config">
                                <Button className="w-full">
                                  Cấu hình hệ thống
                                </Button>
                              </Link>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5" />
                                Audit Logs
                              </CardTitle>
                              <CardDescription>
                                Chi tiết hoạt động admin trong hệ thống
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              <Link href="/audit-logs">
                                <Button className="w-full">
                                  Xem Audit Logs
                                </Button>
                              </Link>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <Activity className="h-5 w-5" />
                                Audit Logs
                              </CardTitle>
                              <CardDescription>
                                Theo dõi tất cả hoạt động admin
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              <Link href="/audit-logs">
                                <Button className="w-full">
                                  Xem audit logs
                                </Button>
                              </Link>
                            </CardContent>
                          </Card>
                        </>
                      )}
                    </div>
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle>Quản lý người dùng</CardTitle>
                        <CardDescription>
                          Chức năng dành cho quản trị viên
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Bạn cần quyền quản trị viên để truy cập tính năng này.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
                
                <TabsContent value="services" className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>Dịch vụ phổ biến</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Thuê số điện thoại</span>
                            <Badge>Phổ biến nhất</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Quản lý Cookie</span>
                            <Badge variant="secondary">Đang tăng</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Tracking đơn hàng</span>
                            <Badge variant="outline">Ổn định</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle>Trạng thái hệ thống</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="text-sm">API Shopee</span>
                            <Badge variant="outline" className="text-green-600">Hoạt động</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="text-sm">Database</span>
                            <Badge variant="outline" className="text-green-600">Hoạt động</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="text-sm">SMS Gateway</span>
                            <Badge variant="outline" className="text-green-600">Hoạt động</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
                
                <TabsContent value="analytics" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Phân tích chi tiết</CardTitle>
                      <CardDescription>
                        Báo cáo và thống kê sử dụng dịch vụ
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Tính năng phân tích đang được phát triển...
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </main>
      </>
    );
  }

  // Regular user dashboard
  return (
    <>
      <FixedHeader />
      <main className="pt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center justify-center gap-3">
                <BarChart3 className="h-8 w-8 text-orange-600" />
                Dashboard - {user?.fullName}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Quản lý dịch vụ Shopee của bạn
              </p>
              <Badge variant="outline" className="mt-2">Người dùng</Badge>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              <StatsCard
                title="Số điện thoại đang thuê"
                value={(phoneRentals as any[])?.length?.toString() || "0"}
                icon={Smartphone}
                iconColor="text-blue-600"
              />
              <StatsCard
                title="Cookie được quản lý"
                value={(shopeeCookies as any[])?.length?.toString() || "0"}
                icon={Cookie}
                iconColor="text-purple-600"
              />
              <StatsCard
                title="Đơn hàng theo dõi"
                value={(trackingChecks as any[])?.length?.toString() || "0"}
                icon={Package}
                iconColor="text-green-600"
              />
              <StatsCard
                title="Email đã thêm"
                value={(emailAdditions as any[])?.length?.toString() || "0"}
                icon={Mail}
                iconColor="text-orange-600"
              />
            </div>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Hành động nhanh</CardTitle>
                <CardDescription>
                  Truy cập nhanh các dịch vụ phổ biến
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Link href="/phone-rental">
                    <Button className="w-full justify-start" variant="outline">
                      <Smartphone className="h-4 w-4 mr-2" />
                      Thuê số điện thoại mới
                    </Button>
                  </Link>
                  <Link href="/cookie-manager">
                    <Button className="w-full justify-start" variant="outline">
                      <Cookie className="h-4 w-4 mr-2" />
                      Quản lý Cookie
                    </Button>
                  </Link>
                  <Link href="/tracking">
                    <Button className="w-full justify-start" variant="outline">
                      <Package className="h-4 w-4 mr-2" />
                      Theo dõi đơn hàng
                    </Button>
                  </Link>
                  <Link href="/top-up">
                    <Button className="w-full justify-start" variant="outline">
                      <DollarSign className="h-4 w-4 mr-2" />
                      Nạp tiền
                    </Button>
                  </Link>
                  <Link href="/history">
                    <Button className="w-full justify-start" variant="outline">
                      <Clock className="h-4 w-4 mr-2" />
                      Lịch sử sử dụng
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}