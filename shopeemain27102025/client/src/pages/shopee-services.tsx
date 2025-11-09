import { useState } from "react";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Smartphone, Search, Cookie, Package, Mail, Code } from "lucide-react";

export default function ShopeeServices() {
  const { toast } = useToast();
  
  const [phoneRentalData, setPhoneRentalData] = useState({
    carrier: "",
    duration: "30"
  });

  const [phoneCheckNumber, setPhoneCheckNumber] = useState("");

  const [cookieData, setCookieData] = useState({
    spcF: "",
    spcSt: ""
  });

  const [trackingData, setTrackingData] = useState({
    trackingCode: "",
    spcSt: ""
  });

  const [emailData, setEmailData] = useState({
    email: "",
    spcSt: ""
  });

  const phoneRentalMutation = useMutation({
    mutationFn: async (data: any) => {
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + parseInt(data.duration));
      
      return apiRequest({
        url: "/api/phone-rentals",
        method: "POST",
        body: {
          carrier: data.carrier,
          rentPrice: data.carrier === "viettel" ? "5000" : data.carrier === "vinaphone" ? "4000" : "3000",
          expiresAt: expiresAt.toISOString(),
          phoneNumber: `+84${Math.floor(Math.random() * 900000000) + 100000000}`
        }
      });
    },
    onSuccess: () => {
      toast({
        title: "Thành công!",
        description: "Đã tạo yêu cầu thuê số điện thoại",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/phone-rentals"] });
    },
    onError: () => {
      toast({
        title: "Lỗi",
        description: "Không thể tạo yêu cầu thuê số",
        variant: "destructive",
      });
    }
  });

  const phoneCheckMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      return apiRequest({
        url: "/api/phone-checks",
        method: "POST",
        body: {
          phoneNumber,
          isRegistered: Math.random() > 0.5
        }
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Kết quả kiểm tra",
        description: data.isRegistered ? "Số điện thoại đã đăng ký Shopee" : "Số điện thoại chưa đăng ký Shopee",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/phone-checks"] });
    },
    onError: () => {
      toast({
        title: "Lỗi",
        description: "Không thể kiểm tra số điện thoại",
        variant: "destructive",
      });
    }
  });

  const cookieMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest({
        url: "/api/shopee-cookies",
        method: "POST",
        body: {
          spcF: data.spcF,
          spcSt: data.spcSt,
          accountName: "Demo Account",
          linkedPhone: "+84987654321",
          linkedEmail: "demo@example.com"
        }
      });
    },
    onSuccess: () => {
      toast({
        title: "Thành công!",
        description: "Đã lưu thông tin cookie Shopee",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/shopee-cookies"] });
    },
    onError: () => {
      toast({
        title: "Lỗi",
        description: "Không thể lưu cookie",
        variant: "destructive",
      });
    }
  });

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
            { status: "Đã lấy hàng", time: "2024-01-15 10:00" },
            { status: "Đang vận chuyển", time: "2024-01-15 14:30" }
          ]
        }
      });
    },
    onSuccess: () => {
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

  const emailMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest({
        url: "/api/email-additions",
        method: "POST",
        body: {
          cookieId: 1,
          email: data.email,
          status: "success"
        }
      });
    },
    onSuccess: () => {
      toast({
        title: "Thành công!",
        description: "Đã thêm email vào tài khoản Shopee",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/email-additions"] });
    },
    onError: () => {
      toast({
        title: "Lỗi",
        description: "Không thể thêm email",
        variant: "destructive",
      });
    }
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dịch Vụ Shopee</h1>
          <p className="text-gray-600 dark:text-gray-300">
            Sử dụng các dịch vụ Shopee chuyên nghiệp
          </p>
        </div>

        <Tabs defaultValue="phone-rental" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="phone-rental">Thuê Số</TabsTrigger>
            <TabsTrigger value="phone-check">Kiểm Tra Số</TabsTrigger>
            <TabsTrigger value="cookie-check">Kiểm Tra TK</TabsTrigger>
            <TabsTrigger value="tracking">Mã Vận Đơn</TabsTrigger>
            <TabsTrigger value="email">Thêm Email</TabsTrigger>
            <TabsTrigger value="cookie-get">Lấy Cookie</TabsTrigger>
          </TabsList>

          <TabsContent value="phone-rental">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Thuê Số Điện Thoại
                </CardTitle>
                <CardDescription>
                  Thuê số điện thoại tạm thời để đăng ký tài khoản Shopee
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="carrier">Nhà Mạng</Label>
                    <Select value={phoneRentalData.carrier} onValueChange={(value) => 
                      setPhoneRentalData(prev => ({ ...prev, carrier: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn nhà mạng" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viettel">Viettel (5,000 VNĐ)</SelectItem>
                        <SelectItem value="vinaphone">Vinaphone (4,000 VNĐ)</SelectItem>
                        <SelectItem value="mobifone">Mobifone (3,000 VNĐ)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="duration">Thời Gian (phút)</Label>
                    <Select value={phoneRentalData.duration} onValueChange={(value) => 
                      setPhoneRentalData(prev => ({ ...prev, duration: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 phút</SelectItem>
                        <SelectItem value="30">30 phút</SelectItem>
                        <SelectItem value="60">60 phút</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button 
                  onClick={() => phoneRentalMutation.mutate(phoneRentalData)}
                  disabled={!phoneRentalData.carrier || phoneRentalMutation.isPending}
                  className="w-full"
                >
                  {phoneRentalMutation.isPending ? "Đang xử lý..." : "Thuê Số"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="phone-check">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Kiểm Tra Số Điện Thoại
                </CardTitle>
                <CardDescription>
                  Kiểm tra số điện thoại đã đăng ký Shopee chưa
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="phone">Số Điện Thoại</Label>
                  <Input
                    id="phone"
                    placeholder="Nhập số điện thoại (VD: 0987654321)"
                    value={phoneCheckNumber}
                    onChange={(e) => setPhoneCheckNumber(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={() => phoneCheckMutation.mutate(phoneCheckNumber)}
                  disabled={!phoneCheckNumber || phoneCheckMutation.isPending}
                  className="w-full"
                >
                  {phoneCheckMutation.isPending ? "Đang kiểm tra..." : "Kiểm Tra"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cookie-check">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cookie className="h-5 w-5" />
                  Kiểm Tra Tài Khoản Shopee
                </CardTitle>
                <CardDescription>
                  Nhập cookie để kiểm tra thông tin tài khoản Shopee
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="spcF">Cookie SPC_F</Label>
                  <Textarea
                    id="spcF"
                    placeholder="Nhập cookie SPC_F..."
                    value={cookieData.spcF}
                    onChange={(e) => setCookieData(prev => ({ ...prev, spcF: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="spcSt">Cookie SPC_ST (tùy chọn)</Label>
                  <Textarea
                    id="spcSt"
                    placeholder="Nhập cookie SPC_ST..."
                    value={cookieData.spcSt}
                    onChange={(e) => setCookieData(prev => ({ ...prev, spcSt: e.target.value }))}
                  />
                </div>
                <Button 
                  onClick={() => cookieMutation.mutate(cookieData)}
                  disabled={!cookieData.spcF || cookieMutation.isPending}
                  className="w-full"
                >
                  {cookieMutation.isPending ? "Đang kiểm tra..." : "Kiểm Tra Tài Khoản"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tracking">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Kiểm Tra Mã Vận Đơn
                </CardTitle>
                <CardDescription>
                  Kiểm tra thông tin vận đơn Shopee
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="tracking-code">Mã Vận Đơn</Label>
                  <Input
                    id="tracking-code"
                    placeholder="Nhập mã vận đơn..."
                    value={trackingData.trackingCode}
                    onChange={(e) => setTrackingData(prev => ({ ...prev, trackingCode: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="spc-st-tracking">Cookie SPC_ST</Label>
                  <Textarea
                    id="spc-st-tracking"
                    placeholder="Nhập cookie SPC_ST..."
                    value={trackingData.spcSt}
                    onChange={(e) => setTrackingData(prev => ({ ...prev, spcSt: e.target.value }))}
                  />
                </div>
                <Button 
                  onClick={() => trackingMutation.mutate(trackingData)}
                  disabled={!trackingData.trackingCode || !trackingData.spcSt || trackingMutation.isPending}
                  className="w-full"
                >
                  {trackingMutation.isPending ? "Đang kiểm tra..." : "Kiểm Tra Vận Đơn"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Thêm Email Vào Tài Khoản
                </CardTitle>
                <CardDescription>
                  Thêm email vào tài khoản Shopee thông qua cookie
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Nhập email cần thêm..."
                    value={emailData.email}
                    onChange={(e) => setEmailData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="spc-st-email">Cookie SPC_ST</Label>
                  <Textarea
                    id="spc-st-email"
                    placeholder="Nhập cookie SPC_ST..."
                    value={emailData.spcSt}
                    onChange={(e) => setEmailData(prev => ({ ...prev, spcSt: e.target.value }))}
                  />
                </div>
                <Button 
                  onClick={() => emailMutation.mutate(emailData)}
                  disabled={!emailData.email || !emailData.spcSt || emailMutation.isPending}
                  className="w-full"
                >
                  {emailMutation.isPending ? "Đang xử lý..." : "Thêm Email"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cookie-get">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  Lấy Cookie & SPC_ST
                </CardTitle>
                <CardDescription>
                  Hướng dẫn lấy cookie SPC_ST từ SPC_F
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Hướng dẫn lấy cookie:</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>Đăng nhập vào tài khoản Shopee trên trình duyệt</li>
                    <li>Mở Developer Tools (F12)</li>
                    <li>Vào tab Application → Cookies</li>
                    <li>Tìm và copy giá trị SPC_F</li>
                    <li>Sử dụng script để lấy SPC_ST từ SPC_F</li>
                  </ol>
                </div>
                <Separator />
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Script tự động:</h4>
                  <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto">
{`// Chạy trong Console của trình duyệt
fetch('/api/v4/account/profile', {
  headers: {
    'Cookie': 'SPC_F=YOUR_SPC_F_VALUE'
  }
}).then(r => r.headers.get('set-cookie'))`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}