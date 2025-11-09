import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FixedHeader } from "@/components/fixed-header";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { loginSchema, type LoginData } from "@shared/schema";
import { useLocation } from "wouter";
import { MessageCircle } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginData) => {
    try {
      setIsLoading(true);
      console.log("Mobile login attempt:", { 
        username: data.username, 
        isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        userAgent: navigator.userAgent 
      });
      
      const response = await login(data.username, data.password);
      console.log("Login successful:", response);
      
      // Show success message
      toast({
        title: "Đăng nhập thành công",
        description: "Chào mừng bạn quay trở lại!",
      });
      
      // Wait for toast to show, then redirect
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Use location.href for better mobile compatibility
      window.location.href = "/";
      
    } catch (error: any) {
      console.error("Login error:", error);
      toast({
        title: "Đăng nhập thất bại",
        description: error.message || "Vui lòng kiểm tra lại thông tin đăng nhập",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <FixedHeader />
      <div className="min-h-screen bg-background flex items-center justify-center px-4 pt-16 pb-8">
        <Card className="w-full max-w-md mx-auto">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-gradient-shopee rounded-2xl flex items-center justify-center">
              <span className="text-white font-bold text-2xl">OS</span>
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-center text-shopee-orange">
            OtisShopee
          </CardTitle>
          <p className="text-center text-gray-600">
            Đăng nhập để truy cập dịch vụ Shopee
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Tên đăng nhập</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                {...form.register("username")}
                placeholder="Nhập tên đăng nhập"
                className="text-base" // Prevent zoom on mobile iOS
              />
              {form.formState.errors.username && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.username.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...form.register("password")}
                placeholder="Nhập mật khẩu"
                className="text-base" // Prevent zoom on mobile iOS
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full min-h-[48px] text-base font-medium"
              disabled={isLoading}
            >
              {isLoading ? "Đang đăng nhập..." : "Đăng nhập"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-600 mb-3">
              Chưa có tài khoản? 
              <button 
                onClick={() => setLocation("/register")}
                className="text-shopee-orange hover:underline ml-1"
              >
                Đăng ký ngay
              </button>
            </p>
            
            {/* Telegram Support Group */}
            <div className="border-t pt-3 mt-3">
              <p className="text-xs text-gray-500 mb-2">Cần hỗ trợ?</p>
              <a
                href="https://t.me/+GTv2l-RcQjFhNDg1"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors mb-2"
              >
                <MessageCircle className="h-4 w-4" />
                Tham gia nhóm Telegram
              </a>
              <p className="text-xs text-gray-400 break-all">
                https://t.me/+GTv2l-RcQjFhNDg1
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
