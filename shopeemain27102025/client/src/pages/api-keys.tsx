import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FixedHeader } from "@/components/fixed-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Key, Copy, Plus, Trash2, Eye, EyeOff, Activity, Shield, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";

interface ApiKey {
  id: number;
  keyName: string;
  keyValue: string;
  isActive: boolean;
  lastUsedAt?: string;
  requestCount: number;
  monthlyRequestLimit: number;
  dailyRequestCount: number;
  lastResetDate?: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
  userId: number;
}

const AVAILABLE_SERVICES = [
  { id: 'phone_check', name: 'Shopee Phone Check', description: 'Kiểm tra số điện thoại đã đăng ký Shopee', category: 'phone' },
  { id: 'username_check', name: 'Shopee Username Check', description: 'Kiểm tra trạng thái username Shopee (active/banned)', category: 'account' },
  { id: 'phone_live_check', name: 'Phone Live Check', description: 'Kiểm tra số điện thoại live qua API check_unbind_phone', category: 'phone' },
  { id: 'account_check', name: 'Shopee Account Check', description: 'Kiểm tra thông tin tài khoản Shopee', category: 'account' },
  { id: 'tracking_check', name: 'Shopee Order Tracking', description: 'Theo dõi đơn hàng Shopee', category: 'order' },
  { id: 'email_addition', name: 'Shopee Email Addition', description: 'Thêm email vào tài khoản Shopee', category: 'account' },
  { id: 'cookie_extraction', name: 'Shopee Cookie Extraction', description: 'Trích xuất cookie Shopee', category: 'cookie' },
  { id: 'express_tracking_check', name: 'Express Tracking Check', description: 'Kiểm tra số điện thoại shipper/driver - CHỈ check, không lưu voucher', category: 'order' },
  { id: 'voucher_saving', name: 'Voucher Saving', description: 'Lưu mã freeship hỏa tốc - CHỈ lưu voucher, không check shipper', category: 'order' },
  { id: 'cookie_rapid_check', name: 'Cookie Rapid Check', description: 'Kiểm tra cookie hỏa tốc - tìm số shipper và đơn hàng', category: 'cookie' },
  { id: 'phone_rental', name: 'Shopee Phone Rental', description: 'Thuê số điện thoại cho Shopee', category: 'rental' },
  { id: 'tiktok_rental', name: 'TikTok Phone Rental', description: 'Thuê số điện thoại cho TikTok', category: 'rental' },
  { id: 'topup', name: 'Top-up Service', description: 'Nạp tiền QR code', category: 'payment' },
  { id: 'external_api_integration', name: 'External API Integration', description: 'Thuê số và lấy OTP từ các provider bên ngoài (VIOTP, Chaycodes3, 365OTP, FunOTP, IronSim, BossOTP)', category: 'rental' }
];

export default function ApiKeys() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [monthlyLimit, setMonthlyLimit] = useState("1000");
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());

  // Fetch API keys
  const { data: apiKeys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/api-keys"],
  });

  // Generate API key
  const generateApiKey = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'otis_';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Create API key mutation
  const createApiKeyMutation = useMutation({
    mutationFn: async (data: {
      keyName: string;
      keyValue: string;
      permissions: string[];
      monthlyRequestLimit: number;
    }) => {
      return apiRequest({
        url: "/api/api-keys",
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      setIsCreateDialogOpen(false);
      setNewKeyName("");
      setSelectedPermissions([]);
      setMonthlyLimit("1000");
      toast({
        title: "Thành công",
        description: "API key đã được tạo thành công",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete API key mutation
  const deleteApiKeyMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest({
        url: `/api/api-keys/${id}`,
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      toast({
        title: "Thành công",
        description: "API key đã được xóa",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle API key status mutation
  const toggleApiKeyMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return apiRequest({
        url: `/api/api-keys/${id}`,
        method: "PATCH",
        body: { isActive },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      toast({
        title: "Thành công",
        description: "Trạng thái API key đã được cập nhật",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Đã sao chép",
      description: "API key đã được sao chép vào clipboard",
    });
  };

  const toggleKeyVisibility = (keyId: number) => {
    const newVisible = new Set(visibleKeys);
    if (newVisible.has(keyId)) {
      newVisible.delete(keyId);
    } else {
      newVisible.add(keyId);
    }
    setVisibleKeys(newVisible);
  };

  const handleCreateApiKey = () => {
    if (!newKeyName.trim()) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập tên API key",
        variant: "destructive",
      });
      return;
    }

    if (selectedPermissions.length === 0) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn ít nhất một dịch vụ",
        variant: "destructive",
      });
      return;
    }

    const keyValue = generateApiKey();
    createApiKeyMutation.mutate({
      keyName: newKeyName.trim(),
      keyValue,
      permissions: selectedPermissions,
      monthlyRequestLimit: parseInt(monthlyLimit) || 1000,
    });
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd/MM/yyyy HH:mm");
  };

  const getPermissionNames = (permissions: string[]) => {
    if (!permissions || !Array.isArray(permissions)) return "Không có quyền";
    return permissions.map(perm => {
      const service = AVAILABLE_SERVICES.find(s => s.id === perm);
      return service ? service.name : perm;
    }).join(", ");
  };

  if (isLoading) {
    return (
      <>
        <FixedHeader />
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500"></div>
        </div>
      </>
    );
  }

  return (
    <>
      <FixedHeader />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4 py-6 pt-20 md:pt-24 max-w-7xl">
          {/* Header Section - Responsive */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 md:p-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl">
                <Key className="h-6 w-6 md:h-8 md:w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                  API Keys
                </h1>
                <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
                  Quản lý API keys cho tích hợp bên ngoài
                </p>
              </div>
            </div>
            
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 w-full sm:w-auto" data-testid="button-create-api-key">
                  <Plus className="h-4 w-4 mr-2" />
                  Tạo API Key
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-xl md:text-2xl">Tạo API Key mới</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                  <div>
                    <Label htmlFor="keyName">Tên API Key</Label>
                    <Input
                      id="keyName"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="Ví dụ: Mobile App, Website Integration..."
                      data-testid="input-key-name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="monthlyLimit">Giới hạn request/tháng</Label>
                    <Input
                      id="monthlyLimit"
                      type="number"
                      value={monthlyLimit}
                      onChange={(e) => setMonthlyLimit(e.target.value)}
                      placeholder="1000"
                      data-testid="input-monthly-limit"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-base font-semibold">Quyền truy cập dịch vụ</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (selectedPermissions.length === AVAILABLE_SERVICES.length) {
                            setSelectedPermissions([]);
                          } else {
                            setSelectedPermissions(AVAILABLE_SERVICES.map(s => s.id));
                          }
                        }}
                        className="h-8 text-xs"
                        data-testid="button-toggle-all"
                      >
                        {selectedPermissions.length === AVAILABLE_SERVICES.length ? (
                          <>
                            <XCircle className="h-3 w-3 mr-1.5" />
                            Bỏ chọn tất cả
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3 w-3 mr-1.5" />
                            Chọn tất cả
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {AVAILABLE_SERVICES.map((service) => (
                        <div 
                          key={service.id} 
                          className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          data-testid={`service-${service.id}`}
                        >
                          <Checkbox
                            id={service.id}
                            checked={selectedPermissions.includes(service.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedPermissions([...selectedPermissions, service.id]);
                              } else {
                                setSelectedPermissions(selectedPermissions.filter(p => p !== service.id));
                              }
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1 grid gap-1.5 leading-none">
                            <label
                              htmlFor={service.id}
                              className="text-sm font-medium leading-snug cursor-pointer"
                            >
                              {service.name}
                            </label>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {service.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="w-full sm:w-auto">
                      Hủy
                    </Button>
                    <Button 
                      onClick={handleCreateApiKey}
                      disabled={createApiKeyMutation.isPending}
                      className="w-full sm:w-auto"
                      data-testid="button-confirm-create"
                    >
                      {createApiKeyMutation.isPending ? "Đang tạo..." : "Tạo API Key"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* API Keys List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                <Shield className="h-5 w-5" />
                Danh sách API Keys
              </CardTitle>
              <CardDescription>
                Quản lý các API keys để truy cập dịch vụ từ ứng dụng bên ngoài
              </CardDescription>
            </CardHeader>
            <CardContent>
              {apiKeys.length === 0 ? (
                <div className="text-center py-12">
                  <Key className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Chưa có API key nào
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Tạo API key đầu tiên để bắt đầu sử dụng dịch vụ từ bên ngoài
                  </p>
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Tạo API Key
                  </Button>
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden lg:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tên</TableHead>
                          <TableHead>API Key</TableHead>
                          <TableHead>Trạng thái</TableHead>
                          <TableHead>Quyền</TableHead>
                          <TableHead>Sử dụng</TableHead>
                          <TableHead>Lần cuối</TableHead>
                          <TableHead>Thao tác</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {apiKeys.map((apiKey: ApiKey) => (
                          <TableRow key={apiKey.id} data-testid={`api-key-${apiKey.id}`}>
                            <TableCell className="font-medium">{apiKey.keyName}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                  {visibleKeys.has(apiKey.id) 
                                    ? apiKey.keyValue 
                                    : `${apiKey.keyValue.substring(0, 12)}...${apiKey.keyValue.substring(apiKey.keyValue.length - 4)}`
                                  }
                                </code>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => toggleKeyVisibility(apiKey.id)}
                                  className="h-6 px-1"
                                  data-testid={`button-toggle-visibility-${apiKey.id}`}
                                >
                                  {visibleKeys.has(apiKey.id) ? (
                                    <EyeOff className="h-3 w-3" />
                                  ) : (
                                    <Eye className="h-3 w-3" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyToClipboard(apiKey.keyValue)}
                                  className="h-6 px-1"
                                  data-testid={`button-copy-${apiKey.id}`}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={apiKey.isActive ? "default" : "secondary"}>
                                {apiKey.isActive ? "Hoạt động" : "Tạm dừng"}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                {apiKey.permissions ? getPermissionNames(apiKey.permissions) : "Tất cả"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div>Tổng: {apiKey.requestCount.toLocaleString()}</div>
                                <div className="text-xs text-gray-500">
                                  Hôm nay: {apiKey.dailyRequestCount}
                                  {apiKey.monthlyRequestLimit && ` / ${apiKey.monthlyRequestLimit.toLocaleString()}`}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {apiKey.lastUsedAt ? (
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  {formatDate(apiKey.lastUsedAt)}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">Chưa sử dụng</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => toggleApiKeyMutation.mutate({ 
                                    id: apiKey.id, 
                                    isActive: !apiKey.isActive 
                                  })}
                                  disabled={toggleApiKeyMutation.isPending}
                                  data-testid={`button-toggle-${apiKey.id}`}
                                >
                                  {apiKey.isActive ? "Tạm dừng" : "Kích hoạt"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => deleteApiKeyMutation.mutate(apiKey.id)}
                                  disabled={deleteApiKeyMutation.isPending}
                                  data-testid={`button-delete-${apiKey.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="lg:hidden space-y-4">
                    {apiKeys.map((apiKey: ApiKey) => (
                      <Card key={apiKey.id} className="border-2" data-testid={`api-key-card-${apiKey.id}`}>
                        <CardContent className="p-4 space-y-4">
                          {/* Header: Name and Status */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-base truncate" data-testid={`text-name-${apiKey.id}`}>
                                {apiKey.keyName}
                              </h3>
                              <p className="text-xs text-gray-500 mt-0.5">
                                Tạo: {formatDate(apiKey.createdAt)}
                              </p>
                            </div>
                            <Badge variant={apiKey.isActive ? "default" : "secondary"} className="shrink-0">
                              {apiKey.isActive ? (
                                <><CheckCircle2 className="h-3 w-3 mr-1" /> Hoạt động</>
                              ) : (
                                <><XCircle className="h-3 w-3 mr-1" /> Tạm dừng</>
                              )}
                            </Badge>
                          </div>

                          {/* API Key */}
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">API Key</Label>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 font-mono text-xs bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded break-all">
                                {visibleKeys.has(apiKey.id) 
                                  ? apiKey.keyValue 
                                  : `${apiKey.keyValue.substring(0, 12)}...${apiKey.keyValue.substring(apiKey.keyValue.length - 4)}`
                                }
                              </code>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toggleKeyVisibility(apiKey.id)}
                                className="shrink-0"
                              >
                                {visibleKeys.has(apiKey.id) ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyToClipboard(apiKey.keyValue)}
                                className="shrink-0"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Permissions */}
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">Quyền truy cập</Label>
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                              {apiKey.permissions ? getPermissionNames(apiKey.permissions) : "Tất cả"}
                            </p>
                          </div>

                          {/* Usage Stats */}
                          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                            <div>
                              <Label className="text-xs text-gray-500">Tổng requests</Label>
                              <p className="text-sm font-medium">{apiKey.requestCount.toLocaleString()}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Hôm nay</Label>
                              <p className="text-sm font-medium">
                                {apiKey.dailyRequestCount}
                                {apiKey.monthlyRequestLimit && (
                                  <span className="text-xs text-gray-500"> / {apiKey.monthlyRequestLimit.toLocaleString()}</span>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Last Used */}
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">Lần cuối sử dụng</Label>
                            <p className="text-sm">
                              {apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : "Chưa sử dụng"}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2 pt-2">
                            <Button
                              variant="outline"
                              onClick={() => toggleApiKeyMutation.mutate({ 
                                id: apiKey.id, 
                                isActive: !apiKey.isActive 
                              })}
                              disabled={toggleApiKeyMutation.isPending}
                              className="flex-1"
                            >
                              {apiKey.isActive ? "Tạm dừng" : "Kích hoạt"}
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => deleteApiKeyMutation.mutate(apiKey.id)}
                              disabled={deleteApiKeyMutation.isPending}
                              className="flex-1"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Xóa
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Usage Info */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                <Activity className="h-5 w-5" />
                Hướng dẫn sử dụng API
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Authentication</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Sử dụng API key trong header X-API-Key:
                </p>
                <code className="block bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs md:text-sm overflow-x-auto">
                  X-API-Key: YOUR_API_KEY
                </code>
              </div>
              
              <div>
                <h4 className="font-semibold mb-2">Ví dụ sử dụng</h4>
                <code className="block bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs md:text-sm whitespace-pre-wrap overflow-x-auto">
{`curl -X POST https://otistx.com/api/phone-checks/bulk \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"phoneNumbers": ["0123456789"]}'`}
                </code>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Rate Limits</h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• Giới hạn request dựa trên cài đặt của từng API key</li>
                  <li>• Mặc định: 1,000 requests/tháng</li>
                  <li>• Rate limit sẽ reset vào đầu mỗi tháng</li>
                  <li>• API sẽ trả về HTTP 429 khi vượt quá giới hạn</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
