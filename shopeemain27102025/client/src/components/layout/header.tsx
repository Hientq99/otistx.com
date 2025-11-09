import { Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";

interface HeaderProps {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth();

  return (
    <header className="bg-surface shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden mr-2"
              onClick={onMenuToggle}
            >
              <Menu className="h-6 w-6" />
            </Button>
            <div className="flex-shrink-0 flex items-center">
              <div className="w-8 h-8 bg-gradient-shopee rounded-lg flex items-center justify-center mr-3">
                <span className="text-white font-bold text-sm">OS</span>
              </div>
              <h1 className="text-xl font-bold text-shopee-orange">OtisShopee</h1>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon">
              <Bell className="h-5 w-5 text-gray-600" />
            </Button>
            <div className="flex items-center space-x-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary text-white text-sm font-medium">
                  {user?.fullName?.split(' ').map(n => n[0]).join('') || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-gray-700 hidden sm:block">
                {user?.fullName}
              </span>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={logout}
                className="text-gray-600 hover:text-gray-900"
              >
                Đăng xuất
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
