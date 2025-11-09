import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FixedHeader } from "@/components/fixed-header";
import { Shield, Key, Eye, EyeOff, Copy, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface WebhookTokenData {
  token: string;
  lastUpdated: string;
}

export default function WebhookSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newToken, setNewToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Only allow admin/superadmin access
  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <FixedHeader />
        <div className="container mx-auto px-4 pt-24 pb-8">
          <div className="text-center py-12">
            <Shield className="w-16 h-16 mx-auto text-red-500 mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Không có quyền truy cập
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Chỉ admin có thể truy cập trang này
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Fetch current webhook token
  const { data: tokenData, isLoading } = useQuery<WebhookTokenData>({
    queryKey: ["/api/admin/webhook-token"],
  });

  // Update webhook token mutation
  const updateTokenMutation = useMutation({
    mutationFn: (token: string) => apiRequest({
      url: "/api/admin/webhook-token",
      method: "POST",
      body: { token }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/webhook-token"] });
      setIsEditing(false);
      setNewToken("");
      toast({
        title: "Thành công",
        description: "Webhook token đã được cập nhật"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể cập nhật webhook token",
        variant: "destructive"
      });
    }
  });

  const handleUpdateToken = () => {
    if (!newToken.trim()) {
      toast({
        title: "Lỗi",
        description: "Token không được để trống",
        variant: "destructive"
      });
      return;
    }
    updateTokenMutation.mutate(newToken.trim());
  };

  const generateRandomToken = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const token = `webhook_${timestamp}_${random}`;
    setNewToken(token);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Đã sao chép",
      description: "Token đã được sao chép vào clipboard"
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <FixedHeader />
      
      <div className="container mx-auto px-4 pt-24 pb-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
              <Shield className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Cài đặt Webhook
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Quản lý token xác thực cho webhook nạp tiền
              </p>
            </div>
          </div>
        </div>

        {/* Current Token Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                Token hiện tại
              </div>
              <Badge variant="outline">
                {tokenData?.lastUpdated ? 
                  `Cập nhật: ${new Date(tokenData.lastUpdated).toLocaleDateString('vi-VN')}` : 
                  'Chưa cập nhật'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-4">
                <p className="text-gray-500">Đang tải token...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Webhook Token</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type={showToken ? "text" : "password"}
                      value={tokenData?.token || ''}
                      readOnly
                      className="font-mono"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(tokenData?.token || '')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                    Hướng dẫn sử dụng
                  </h4>
                  <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                    <li>• Token này dùng để xác thực webhook từ ngân hàng</li>
                    <li>• Webhook endpoint: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">/api/webhook/topup</code></li>
                    <li>• Header: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">Authorization: Bearer {tokenData?.token?.substring(0, 10)}...</code></li>
                    <li>• Thay đổi token sẽ cần cập nhật cấu hình webhook ngân hàng</li>
                  </ul>
                </div>

                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                  <h4 className="font-medium text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    URL Webhook Có Sẵn
                  </h4>
                  <div className="text-sm text-green-800 dark:text-green-200 space-y-3">
                    <p>Hệ thống hỗ trợ cả hai URL webhook cho tính linh hoạt:</p>
                    <div className="space-y-3">
                      <div className="bg-white dark:bg-gray-800 p-3 rounded border">
                        <div className="flex items-center justify-between mb-2">
                          <strong className="text-green-700 dark:text-green-300">🌐 Production URL (Khuyên dùng):</strong>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard('https://otistx.com/api/webhook/topup')}
                            className="h-6 px-2 text-xs"
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy
                          </Button>
                        </div>
                        <code className="bg-green-100 dark:bg-green-800 px-2 py-1 rounded text-xs break-all block">
                          https://otistx.com/api/webhook/topup
                        </code>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          ✅ HTTPS với SSL certificate • Nginx reverse proxy • Rate limiting
                        </p>
                      </div>
                      
                      <div className="bg-white dark:bg-gray-800 p-3 rounded border">
                        <div className="flex items-center justify-between mb-2">
                          <strong className="text-blue-700 dark:text-blue-300">⚙️ Development URL (Backup):</strong>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard('http://localhost:5000/api/webhook/topup')}
                            className="h-6 px-2 text-xs"
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy
                          </Button>
                        </div>
                        <code className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded text-xs break-all block">
                          http://localhost:5000/api/webhook/topup
                        </code>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          🔧 Direct server access • Local testing • Development environment
                        </p>
                      </div>
                      
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded border border-yellow-200 dark:border-yellow-800">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <strong className="text-yellow-800 dark:text-yellow-200">⚠️ Lưu ý về IP Direct Access</strong>
                        </div>
                        <div className="text-xs text-yellow-800 dark:text-yellow-200 space-y-1">
                          <p>URL với IP trực tiếp hiện bị firewall chặn:</p>
                          <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">http://157.66.24.150:5000/api/webhook/topup</code>
                          <p className="mt-2">
                            <strong>Giải pháp:</strong> Sử dụng domain URL <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">https://otistx.com/api/webhook/topup</code> 
                            để truy cập qua nginx reverse proxy
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-blue-50 dark:bg-blue-900/30 p-2 rounded">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        <strong>Lưu ý:</strong> Cả hai URL đều sử dụng cùng authentication token và format dữ liệu
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Update Token Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                Cập nhật Token
              </div>
              <Button
                variant="outline"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? 'Hủy' : 'Chỉnh sửa'}
              </Button>
            </CardTitle>
          </CardHeader>
          {isEditing && (
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="newToken">Token mới</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      id="newToken"
                      type="text"
                      value={newToken}
                      onChange={(e) => setNewToken(e.target.value)}
                      placeholder="Nhập token mới hoặc tạo tự động"
                      className="font-mono"
                    />
                    <Button
                      variant="outline"
                      onClick={generateRandomToken}
                      className="whitespace-nowrap"
                    >
                      Tạo tự động
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    * Thay đổi token sẽ ảnh hưởng đến tất cả webhook hiện tại
                  </div>
                  <Button
                    onClick={handleUpdateToken}
                    disabled={updateTokenMutation.isPending || !newToken.trim()}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    {updateTokenMutation.isPending ? 'Đang cập nhật...' : 'Cập nhật Token'}
                  </Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}