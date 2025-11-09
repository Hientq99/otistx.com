import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { 
  Menu, 
  X, 
  Home, 
  Smartphone, 
  Search, 
  Cookie, 
  Package, 
  Mail,
  Code,
  Key,
  User,
  LogOut,
  Settings,
  BarChart3,
  History,
  DollarSign,
  Users,
  Shield,
  TrendingUp,
  FileText,
  Globe,
  ChevronDown,
  RefreshCw,
  Gift,
  Link as LinkIcon,
  Database
} from "lucide-react";

export function FixedHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [location] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  // Fetch user balance with real-time updates
  const { data: userBalance } = useQuery<number>({
    queryKey: ["/api/user/balance"],
    enabled: isAuthenticated,
    refetchInterval: 120000, // Refetch every 2 minutes (EXTREME EGRESS REDUCTION)
    refetchOnWindowFocus: true,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };



  const shopeeServices = [
    { href: "/phone-check", label: "Kiểm tra số", icon: Search },
    { href: "/account-check", label: "Kiểm tra TK", icon: Cookie },
    { href: "/spc-f-extract", label: "Trích xuất SPC_F", icon: Key },
    { href: "/cookie-manager", label: "Quản lý Cookie", icon: Settings },
    { href: "/tracking-check", label: "Kiểm tra đơn hàng", icon: Package },
    { href: "/add-email", label: "Thêm email", icon: Mail },
    { href: "/get-cookie", label: "Lấy cookie SPC_ST", icon: Shield },
    { href: "/username-check", label: "Check username|phone live", icon: User },
    { href: "/cookie-rapid-check", label: "Cookie_hỏa tốc", icon: RefreshCw },
    { href: "/voucher-saving", label: "Lưu mã free ship", icon: Gift },
  ];

  const handleLogout = () => {
    logout();
    setIsMenuOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
                <Smartphone className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                OtisShopee
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-8">
            {/* Main navigation items first */}
            <Link href="/">
              <button
                className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location === "/"
                    ? "text-orange-600 bg-orange-50 dark:bg-orange-900/20"
                    : "text-gray-700 dark:text-gray-300 hover:text-orange-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <Home className="h-4 w-4" />
                <span>Trang chủ</span>
              </button>
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location === "/phone-rental" || location === "/phone-rental-tiktok" || location === "/external-api-integration"
                      ? "text-orange-600 bg-orange-50 dark:bg-orange-900/20"
                      : "text-gray-700 dark:text-gray-300 hover:text-orange-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <Smartphone className="h-4 w-4" />
                  <span>Thuê số điện thoại</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <Link href="/phone-rental">
                  <DropdownMenuItem>
                    <Smartphone className="mr-2 h-4 w-4" />
                    Thuê số Shopee
                  </DropdownMenuItem>
                </Link>
                <Link href="/phone-rental-tiktok">
                  <DropdownMenuItem>
                    <Smartphone className="mr-2 h-4 w-4" />
                    Thuê số TikTok
                  </DropdownMenuItem>
                </Link>
                <Link href="/external-api-integration">
                  <DropdownMenuItem>
                    <LinkIcon className="mr-2 h-4 w-4" />
                    Tích hợp API
                  </DropdownMenuItem>
                </Link>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Shopee Services Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    shopeeServices.some(service => location === service.href)
                      ? "text-orange-600 bg-orange-50 dark:bg-orange-900/20"
                      : "text-gray-700 dark:text-gray-300 hover:text-orange-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <Package className="h-4 w-4" />
                  <span>Dịch vụ Shopee</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56">
                {shopeeServices.map((service) => (
                  <Link key={service.href} href={service.href}>
                    <DropdownMenuItem className="cursor-pointer">
                      <service.icon className="h-4 w-4 mr-2" />
                      {service.label}
                    </DropdownMenuItem>
                  </Link>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Link href="/api-docs">
              <button
                className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location === "/api-docs"
                    ? "text-orange-600 bg-orange-50 dark:bg-orange-900/20"
                    : "text-gray-700 dark:text-gray-300 hover:text-orange-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <Code className="h-4 w-4" />
                <span>Tài liệu API</span>
              </button>
            </Link>



            <Link href="/contact">
              <button
                className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location === "/contact"
                    ? "text-orange-600 bg-orange-50 dark:bg-orange-900/20"
                    : "text-gray-700 dark:text-gray-300 hover:text-orange-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <Mail className="h-4 w-4" />
                <span>Liên hệ</span>
              </button>
            </Link>
          </nav>

          {/* Right side actions */}
          <div className="flex items-center space-x-2 md:space-x-4">
            {/* User Balance - Mobile version */}
            {isAuthenticated && (
              <Link href="/top-up">
                {/* Mobile compact balance display */}
                <div className="md:hidden flex items-center bg-gradient-to-r from-emerald-500 to-green-600 text-white px-2 py-1 rounded-md shadow hover:shadow-lg transition-all cursor-pointer">
                  <DollarSign className="h-3 w-3 mr-1" />
                  <span className="text-xs font-bold">
                    {typeof userBalance === 'number' ? formatCurrency(userBalance) : "0 VNĐ"}
                  </span>
                </div>
                
                {/* Desktop full balance display */}
                <div className="hidden md:flex items-center space-x-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white px-4 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 cursor-pointer">
                  <div className="flex items-center space-x-2">
                    <div className="p-1 bg-white/20 rounded-full">
                      <DollarSign className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs opacity-80 font-medium">Số dư</span>
                      <span className="text-sm font-bold leading-none">
                        {typeof userBalance === 'number' ? formatCurrency(userBalance) : "0 VNĐ"}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {isAuthenticated ? (
              /* User menu */
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center">
                      <User className="h-4 w-4 text-white" />
                    </div>
                    <span className="hidden md:block font-medium">
                      {user?.fullName || user?.username}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-3 py-2 border-b">
                    <p className="text-sm font-medium">{user?.fullName}</p>
                    <p className="text-xs text-gray-500">{user?.username}</p>
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {user?.role === "superadmin" ? "Super Admin" : user?.role === "admin" ? "Quản trị viên" : "Người dùng"}
                    </Badge>
                  </div>
                  <Link href="/top-up">
                    <DropdownMenuItem>
                      <DollarSign className="h-4 w-4 mr-2" />
                      Nạp tiền
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/history">
                    <DropdownMenuItem>
                      <History className="h-4 w-4 mr-2" />
                      Lịch sử sử dụng
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/api-keys">
                    <DropdownMenuItem>
                      <Key className="h-4 w-4 mr-2" />
                      API Keys
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/settings">
                    <DropdownMenuItem>
                      <Settings className="h-4 w-4 mr-2" />
                      Cài đặt
                    </DropdownMenuItem>
                  </Link>
                  {(user?.role === 'admin' || user?.role === 'superadmin') && (
                    <>
                      <div className="border-t my-1"></div>
                      <div className="px-2 py-1">
                        <p className="text-xs text-gray-500 font-medium">QUẢN TRỊ</p>
                      </div>
                      <Link href="/user-management">
                        <DropdownMenuItem>
                          <Users className="h-4 w-4 mr-2" />
                          Quản lý người dùng
                        </DropdownMenuItem>
                      </Link>
                      <Link href="/analytics">
                        <DropdownMenuItem>
                          <TrendingUp className="h-4 w-4 mr-2" />
                          Phân tích & Báo cáo
                        </DropdownMenuItem>
                      </Link>
                      {user?.role === 'superadmin' && (
                        <>
                          <Link href="/service-pricing">
                            <DropdownMenuItem>
                              <DollarSign className="h-4 w-4 mr-2" />
                              Cấu hình giá dịch vụ
                            </DropdownMenuItem>
                          </Link>
                          <Link href="/system-config">
                            <DropdownMenuItem>
                              <Shield className="h-4 w-4 mr-2" />
                              Cấu hình hệ thống
                            </DropdownMenuItem>
                          </Link>
                          <Link href="/audit-logs">
                            <DropdownMenuItem>
                              <FileText className="h-4 w-4 mr-2" />
                              Audit Logs
                            </DropdownMenuItem>
                          </Link>
                          <Link href="/webhook-settings">
                            <DropdownMenuItem>
                              <Shield className="h-4 w-4 mr-2" />
                              Webhook Settings
                            </DropdownMenuItem>
                          </Link>
                          <Link href="/http-proxy-manager">
                            <DropdownMenuItem>
                              <Globe className="h-4 w-4 mr-2" />
                              HTTP Proxy Manager
                            </DropdownMenuItem>
                          </Link>
                          <Link href="/auto-refund-admin">
                            <DropdownMenuItem>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Auto-Refund Scheduler
                            </DropdownMenuItem>
                          </Link>
                          <Link href="/database-migration">
                            <DropdownMenuItem>
                              <Database className="h-4 w-4 mr-2" />
                              Database Migration
                            </DropdownMenuItem>
                          </Link>
                        </>
                      )}
                    </>
                  )}
                  <div className="border-t my-1"></div>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Đăng xuất
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              /* Auth buttons */
              <div className="flex items-center space-x-2">
                <Link href="/login">
                  <Button variant="ghost" size="sm">
                    Đăng nhập
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600">
                    Đăng ký
                  </Button>
                </Link>
              </div>
            )}

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="lg:hidden border-t border-gray-200 dark:border-gray-700 py-4">
            <nav className="space-y-2">
              {/* Trang chủ */}
              <Link href="/">
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex items-center space-x-3 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location === "/"
                      ? "text-orange-600 bg-orange-50 dark:bg-orange-900/20"
                      : "text-gray-700 dark:text-gray-300 hover:text-orange-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <Home className="h-4 w-4" />
                  <span>Trang chủ</span>
                </button>
              </Link>

              {/* Thuê số điện thoại */}
              <Link href="/phone-rental">
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex items-center space-x-3 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location === "/phone-rental"
                      ? "text-orange-600 bg-orange-50 dark:bg-orange-900/20"
                      : "text-gray-700 dark:text-gray-300 hover:text-orange-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <Smartphone className="h-4 w-4" />
                  <span>Thuê số Shopee</span>
                </button>
              </Link>

              {/* Thuê số TikTok */}
              <Link href="/phone-rental-tiktok">
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex items-center space-x-3 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location === "/phone-rental-tiktok"
                      ? "text-orange-600 bg-orange-50 dark:bg-orange-900/20"
                      : "text-gray-700 dark:text-gray-300 hover:text-orange-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <Smartphone className="h-4 w-4" />
                  <span>Thuê số TikTok</span>
                </button>
              </Link>

              {/* Tích hợp API */}
              <Link href="/external-api-integration">
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex items-center space-x-3 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location === "/external-api-integration"
                      ? "text-orange-600 bg-orange-50 dark:bg-orange-900/20"
                      : "text-gray-700 dark:text-gray-300 hover:text-orange-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <LinkIcon className="h-4 w-4" />
                  <span>Tích hợp API</span>
                </button>
              </Link>

              {/* Mobile Shopee Services */}
              <div className="px-3 py-2">
                <div className="flex items-center space-x-3 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Package className="h-4 w-4" />
                  <span>Dịch vụ Shopee</span>
                </div>
                <div className="ml-7 space-y-2">
                  {shopeeServices.map((service) => (
                    <Link key={service.href} href={service.href}>
                      <button
                        onClick={() => setIsMenuOpen(false)}
                        className={`flex items-center space-x-3 w-full px-3 py-2 rounded-md text-sm transition-colors ${
                          location === service.href
                            ? "text-orange-600 bg-orange-50 dark:bg-orange-900/20"
                            : "text-gray-600 dark:text-gray-400 hover:text-orange-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                      >
                        <service.icon className="h-4 w-4" />
                        <span>{service.label}</span>
                      </button>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Tài liệu API */}
              <Link href="/api-docs">
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex items-center space-x-3 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location === "/api-docs"
                      ? "text-orange-600 bg-orange-50 dark:bg-orange-900/20"
                      : "text-gray-700 dark:text-gray-300 hover:text-orange-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <Code className="h-4 w-4" />
                  <span>Tài liệu API</span>
                </button>
              </Link>

              {/* Liên hệ */}
              <Link href="/contact">
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex items-center space-x-3 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location === "/contact"
                      ? "text-orange-600 bg-orange-50 dark:bg-orange-900/20"
                      : "text-gray-700 dark:text-gray-300 hover:text-orange-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <Mail className="h-4 w-4" />
                  <span>Liên hệ</span>
                </button>
              </Link>
              
              {!isAuthenticated && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="space-y-2">
                    <Link href="/login">
                      <Button variant="ghost" className="w-full justify-start" onClick={() => setIsMenuOpen(false)}>
                        Đăng nhập
                      </Button>
                    </Link>
                    <Link href="/register">
                      <Button className="w-full bg-gradient-to-r from-orange-500 to-red-500" onClick={() => setIsMenuOpen(false)}>
                        Đăng ký
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}