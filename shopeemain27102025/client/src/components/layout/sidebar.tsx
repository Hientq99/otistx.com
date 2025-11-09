import { Link, useLocation } from "wouter";
import { 
  BarChart3, 
  Shield, 
  Settings,
  X,
  Home,
  Smartphone,
  Link as LinkIcon,
  RefreshCw,
  Database
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navigation = [
  { name: "Trang chủ", href: "/", icon: Home },
  { name: "Dịch vụ Shopee", href: "/shopee-services", icon: Smartphone },
  { name: "Thuê số TikTok", href: "/phone-rental-tiktok", icon: Smartphone },
  { name: "Tích hợp API", href: "/external-api-integration", icon: LinkIcon },
  { name: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { name: "Kiểm tra", href: "/audit", icon: Shield },
  { name: "Cài đặt", href: "/settings", icon: Settings },
];

const adminNavigation = [
  { name: "Auto Refund Scheduler", href: "/auto-refund-admin", icon: RefreshCw },
  { name: "Database Migration", href: "/database-migration", icon: Database },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [location] = useLocation();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-gray-600 bg-opacity-75"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-surface border-r border-gray-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Mobile header */}
          <div className="lg:hidden flex items-center justify-between h-16 px-4 border-b border-gray-200">
            <h1 className="text-xl font-bold text-primary">OtisShopee</h1>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-6 w-6" />
            </Button>
          </div>

          <div className="flex-1 flex flex-col min-h-0 pt-5 pb-4">
            <div className="flex-1 flex flex-col overflow-y-auto">
              <nav className="mt-5 px-3 space-y-1">
                {navigation.map((item) => {
                  const isActive = location === item.href;
                  return (
                    <Link key={item.name} href={item.href}>
                      <a
                        onClick={onClose}
                        className={cn(
                          "group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors",
                          isActive
                            ? "bg-primary text-white"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        )}
                      >
                        <item.icon className="mr-3 h-5 w-5" />
                        {item.name}
                      </a>
                    </Link>
                  );
                })}
                
                {/* Admin Section */}
                <div className="mt-8">
                  <div className="px-2 mb-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Admin</span>
                  </div>
                  {adminNavigation.map((item) => {
                    const isActive = location === item.href;
                    return (
                      <Link key={item.name} href={item.href}>
                        <a
                          onClick={onClose}
                          className={cn(
                            "group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors",
                            isActive
                              ? "bg-primary text-white"
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          )}
                        >
                          <item.icon className="mr-3 h-5 w-5" />
                          {item.name}
                        </a>
                      </Link>
                    );
                  })}
                </div>
              </nav>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
