import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FixedHeader } from "@/components/fixed-header";
import { DollarSign, Edit, Shield } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface ServicePricing {
  id: number;
  serviceType: string;
  serviceName: string;
  price: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PricingFormData {
  serviceName: string;
  price: string;
  description: string;
  isActive: boolean;
}

export default function ServicePricingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
                  Bạn không có quyền truy cập trang cấu hình giá dịch vụ. Chỉ Super Admin mới có thể truy cập trang này.
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

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPricing, setSelectedPricing] = useState<ServicePricing | null>(null);
  const [formData, setFormData] = useState<PricingFormData>({
    serviceName: "",
    price: "",
    description: "",
    isActive: true
  });

  // Fetch service pricing
  const { data: pricingList = [], isLoading } = useQuery({
    queryKey: ["/api/service-pricing"],
    enabled: user?.role === 'superadmin'
  });

  // Initialize default services
  const initializeDefaultServices = useMutation({
    mutationFn: () => apiRequest({
      url: "/api/service-pricing/initialize",
      method: "POST"
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-pricing"] });
      toast({
        title: "Thành công",
        description: "Khởi tạo dịch vụ mặc định thành công"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể khởi tạo dịch vụ mặc định",
        variant: "destructive"
      });
    }
  });

  // Update pricing mutation
  const updatePricingMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PricingFormData> }) => apiRequest({
      url: `/api/service-pricing/${id}`,
      method: "PUT",
      body: data
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-pricing"] });
      setIsEditDialogOpen(false);
      setSelectedPricing(null);
      toast({
        title: "Thành công",
        description: "Cập nhật giá dịch vụ thành công"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể cập nhật giá dịch vụ",
        variant: "destructive"
      });
    }
  });

  const handleEditPricing = (pricing: ServicePricing) => {
    setSelectedPricing(pricing);
    setFormData({
      serviceName: pricing.serviceName,
      price: pricing.price,
      description: pricing.description || "",
      isActive: pricing.isActive
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdatePricing = () => {
    if (!selectedPricing) return;
    updatePricingMutation.mutate({ id: selectedPricing.id, data: formData });
  };

  const formatPrice = (price: string) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(parseFloat(price));
  };

  return (
    <div className="min-h-screen bg-background">
      <FixedHeader />
      <div className="pt-16 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Cấu hình giá dịch vụ</h1>
                <p className="text-muted-foreground">Quản lý giá các dịch vụ cố định trong hệ thống</p>
              </div>
            </div>
            {(pricingList as ServicePricing[]).length === 0 && (
              <Button onClick={() => initializeDefaultServices.mutate()} disabled={initializeDefaultServices.isPending}>
                {initializeDefaultServices.isPending ? "Đang khởi tạo..." : "Khởi tạo dịch vụ mặc định"}
              </Button>
            )}
          </div>

          {/* Pricing Table */}
          <Card>
            <CardHeader>
              <CardTitle>Danh sách dịch vụ và giá</CardTitle>
              <CardDescription>
                Chỉnh sửa giá các dịch vụ có sẵn trong hệ thống
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <p>Đang tải cấu hình giá...</p>
                </div>
              ) : (pricingList as ServicePricing[]).length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Chưa có dịch vụ nào được cấu hình</p>
                  <Button onClick={() => initializeDefaultServices.mutate()} disabled={initializeDefaultServices.isPending}>
                    {initializeDefaultServices.isPending ? "Đang khởi tạo..." : "Khởi tạo dịch vụ mặc định"}
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên dịch vụ</TableHead>
                      <TableHead>Giá</TableHead>
                      <TableHead>Đơn vị</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Ngày cập nhật</TableHead>
                      <TableHead>Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(pricingList as ServicePricing[]).map((pricing: ServicePricing) => (
                      <TableRow key={pricing.id}>
                        <TableCell className="font-medium">{pricing.serviceName}</TableCell>
                        <TableCell className="font-semibold text-green-600">
                          {formatPrice(pricing.price)}
                        </TableCell>
                        <TableCell>{pricing.description || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={pricing.isActive ? 'default' : 'destructive'}>
                            {pricing.isActive ? 'Hoạt động' : 'Không hoạt động'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(pricing.updatedAt).toLocaleDateString('vi-VN')}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditPricing(pricing)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Edit Pricing Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Chỉnh sửa giá dịch vụ</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-serviceName">Tên dịch vụ</Label>
                  <Input
                    id="edit-serviceName"
                    value={formData.serviceName}
                    onChange={(e) => setFormData({...formData, serviceName: e.target.value})}
                    placeholder="Nhập tên dịch vụ"
                    disabled
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-price">Giá (VND)</Label>
                  <Input
                    id="edit-price"
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                    placeholder="Nhập giá dịch vụ"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Đơn vị</Label>
                  <Input
                    id="edit-description"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="Nhập đơn vị tính"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="edit-isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({...formData, isActive: checked})}
                  />
                  <Label htmlFor="edit-isActive">Kích hoạt</Label>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleUpdatePricing} disabled={updatePricingMutation.isPending} className="flex-1">
                    {updatePricingMutation.isPending ? "Đang cập nhật..." : "Cập nhật"}
                  </Button>
                  <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                    Hủy
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}