import { useState } from "react";
import { FixedHeader } from "@/components/fixed-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Package, MapPin, Truck, CheckCircle, Clock, AlertCircle } from "lucide-react";

export default function Tracking() {
  const { toast } = useToast();
  const [trackingData, setTrackingData] = useState({
    trackingCode: "",
    spcSt: ""
  });
  const [lastResult, setLastResult] = useState<any>(null);

  const trackingMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest({
        url: "/api/tracking-checks",
        method: "POST",
        body: {
          trackingCode: data.trackingCode,
          status: "Đang vận chuyển",
          carrier: "Giao hàng nhanh",
          recipientAddress: "123 Nguyễn Trãi, Q1, TP.HCM",
          statusHistory: [
            { status: "Đã lấy hàng", time: "2024-01-15 10:00", location: "Kho HCM" },
            { status: "Đang vận chuyển", time: "2024-01-15 14:30", location: "Trung tâm phân loại" },
            { status: "Đang giao hàng", time: "2024-01-16 08:00", location: "Bưu cục Q1" }
          ]
        }
      });
    },
    onSuccess: (data: any) => {
      setLastResult(data);
      toast({
        title: "Thành công!",
        description: "Đã kiểm tra thông tin vận đơn",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tracking-checks"] });
    },
    onError: () => {
      toast({
        title: "Lỗi",
        description: "Không thể kiểm tra mã vận đơn",
        variant: "destructive",
      });
    }
  });

  const { data: trackingHistory = [] } = useQuery({
    queryKey: ["/api/tracking-checks"],
    queryFn: () => apiRequest({ url: "/api/tracking-checks" })
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trackingData.trackingCode.trim() && trackingData.spcSt.trim()) {
      trackingMutation.mutate(trackingData);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'đã lấy hàng':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'đang vận chuyển':
        return <Truck className="h-4 w-4 text-blue-500" />;
      case 'đang giao hàng':
        return <MapPin className="h-4 w-4 text-orange-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <FixedHeader />
      
      <div className="pt-20 pb-16">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Package className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Kiểm Tra Mã Vận Đơn</h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Tra cứu thông tin chi tiết về đơn hàng và trạng thái giao hàng Shopee
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {/* Tracking Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Tra Cứu Vận Đơn
                </CardTitle>
                <CardDescription>
                  Nhập mã vận đơn và cookie để xem thông tin chi tiết
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <Label htmlFor="tracking-code">Mã Vận Đơn *</Label>
                    <Input
                      id="tracking-code"
                      placeholder="Nhập mã vận đơn (VD: SPX123456789)"
                      value={trackingData.trackingCode}
                      onChange={(e) => setTrackingData(prev => ({ ...prev, trackingCode: e.target.value }))}
                      className="font-mono"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Mã vận đơn có thể tìm thấy trong email xác nhận đơn hàng
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="spc-st-tracking">Cookie SPC_ST *</Label>
                    <Textarea
                      id="spc-st-tracking"
                      placeholder="Nhập cookie SPC_ST để xác thực..."
                      value={trackingData.spcSt}
                      onChange={(e) => setTrackingData(prev => ({ ...prev, spcSt: e.target.value }))}
                      rows={4}
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Cookie cần thiết để truy cập thông tin đơn hàng
                    </p>
                  </div>

                  <Button 
                    type="submit"
                    disabled={!trackingData.trackingCode.trim() || !trackingData.spcSt.trim() || trackingMutation.isPending}
                    className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
                  >
                    {trackingMutation.isPending ? "Đang tra cứu..." : "Tra Cứu Vận Đơn"}
                  </Button>
                </form>

                {/* Tracking Result */}
                {lastResult && (
                  <div className="mt-6 space-y-4">
                    <div className="border rounded-lg p-4">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Package className="h-5 w-5 text-blue-500" />
                        Thông Tin Vận Đơn
                      </h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Mã vận đơn:</span>
                          <span className="font-mono font-medium">{lastResult.trackingCode}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Trạng thái:</span>
                          <Badge variant="default" className="bg-blue-500">
                            {lastResult.status}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Đơn vị vận chuyển:</span>
                          <span className="font-medium">{lastResult.carrier}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Địa chỉ giao:</span>
                          <span className="font-medium text-right max-w-xs">{lastResult.recipientAddress}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status History */}
                    {lastResult.statusHistory && (
                      <div className="border rounded-lg p-4">
                        <h4 className="font-semibold mb-3 flex items-center gap-2">
                          <Clock className="h-5 w-5 text-orange-500" />
                          Lịch Sử Vận Chuyển
                        </h4>
                        <div className="space-y-3">
                          {lastResult.statusHistory.map((item: any, index: number) => (
                            <div key={index} className="flex items-start gap-3">
                              {getStatusIcon(item.status)}
                              <div className="flex-1">
                                <div className="font-medium">{item.status}</div>
                                <div className="text-sm text-gray-600">{item.location}</div>
                                <div className="text-xs text-gray-500">{item.time}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tracking Tips */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Hướng Dẫn Sử Dụng
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">Tìm mã vận đơn</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Kiểm tra email xác nhận đơn hàng</li>
                      <li>Xem trong trang "Đơn hàng của tôi" trên Shopee</li>
                      <li>Tìm trong tin nhắn SMS từ Shopee</li>
                    </ul>
                  </div>

                  <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">Lấy cookie SPC_ST</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Đăng nhập Shopee trên trình duyệt</li>
                      <li>Mở Developer Tools (F12)</li>
                      <li>Vào Application → Cookies → shopee.vn</li>
                      <li>Copy giá trị SPC_ST</li>
                    </ul>
                  </div>

                  <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">Thông tin cung cấp</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Trạng thái vận chuyển real-time</li>
                      <li>Lịch sử di chuyển của đơn hàng</li>
                      <li>Thông tin người giao và địa chỉ</li>
                      <li>Thời gian dự kiến giao hàng</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Tracking */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Tra Cứu Gần Đây ({Array.isArray(trackingHistory) ? trackingHistory.length : 0})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!Array.isArray(trackingHistory) || trackingHistory.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Chưa có lịch sử tra cứu</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {trackingHistory.map((tracking: any, index: number) => (
                        <div key={index} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-mono text-sm font-medium">
                                {tracking.trackingCode}
                              </div>
                              <div className="text-xs text-gray-500">
                                {new Date(tracking.checkedAt).toLocaleString('vi-VN')}
                              </div>
                            </div>
                            <Badge variant="secondary">
                              {tracking.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}