import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FixedHeader } from "@/components/fixed-header";
import { useToast } from "@/hooks/use-toast";
import { registerSchema, type RegisterData } from "@shared/schema";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      fullName: "",
      phone: "",
      agreeToTerms: false,
    },
  });

  const onSubmit = async (data: RegisterData) => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message);
      }

      // Store token
      localStorage.setItem("token", result.token);
      
      toast({
        title: "Đăng ký thành công",
        description: "Chào mừng bạn đến với OtisShopee!",
      });
      // Force page reload to properly refresh authentication state
      window.location.href = "/";
    } catch (error: any) {
      toast({
        title: "Đăng ký thất bại",
        description: error.message || "Có lỗi xảy ra khi đăng ký",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <FixedHeader />
      <div className="min-h-screen bg-background flex items-center justify-center px-4 pt-16">
        <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-gradient-shopee rounded-2xl flex items-center justify-center">
              <span className="text-white font-bold text-2xl">OS</span>
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-center text-shopee-orange">
            Đăng ký OtisShopee
          </CardTitle>
          <p className="text-center text-gray-600">
            Tạo tài khoản để sử dụng dịch vụ Shopee
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">
                Họ và tên <span className="text-red-500">*</span>
              </Label>
              <Input
                id="fullName"
                {...form.register("fullName")}
                placeholder="Từ 5-50 ký tự, không chứa số hoặc ký tự đặc biệt"
                className={form.formState.errors.fullName ? "border-red-500" : ""}
              />
              {form.formState.errors.fullName && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.fullName.message}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="username">
                Tên đăng nhập <span className="text-red-500">*</span>
              </Label>
              <Input
                id="username"
                {...form.register("username")}
                placeholder="4-20 ký tự, chỉ chữ thường, số và dấu gạch dưới (_)"
                className={form.formState.errors.username ? "border-red-500" : ""}
              />
              {form.formState.errors.username && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.username.message}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                {...form.register("email")}
                placeholder="Địa chỉ email hợp lệ và chưa được sử dụng"
                className={form.formState.errors.email ? "border-red-500" : ""}
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone">Số điện thoại</Label>
              <Input
                id="phone"
                {...form.register("phone")}
                placeholder="10 chữ số, bắt đầu bằng 03, 05, 07, 08 hoặc 09 (tùy chọn)"
                className={form.formState.errors.phone ? "border-red-500" : ""}
              />
              {form.formState.errors.phone && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.phone.message}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">
                Mật khẩu <span className="text-red-500">*</span>
              </Label>
              <Input
                id="password"
                type="password"
                {...form.register("password")}
                placeholder="Ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt"
                className={form.formState.errors.password ? "border-red-500" : ""}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                Xác nhận mật khẩu <span className="text-red-500">*</span>
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                {...form.register("confirmPassword")}
                placeholder="Phải trùng khớp với mật khẩu đã nhập"
                className={form.formState.errors.confirmPassword ? "border-red-500" : ""}
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>
            
            {/* Terms of Service Checkbox */}
            <div className="space-y-2">
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="agreeToTerms"
                  checked={form.watch("agreeToTerms")}
                  onCheckedChange={(checked) => {
                    form.setValue("agreeToTerms", checked as boolean);
                  }}
                  className={form.formState.errors.agreeToTerms ? "border-red-500" : ""}
                />
                <div className="space-y-1 leading-none">
                  <Label
                    htmlFor="agreeToTerms"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Tôi đồng ý với{" "}
                    <Dialog>
                      <DialogTrigger asChild>
                        <button
                          type="button"
                          className="text-shopee-orange underline hover:no-underline"
                        >
                          Điều khoản sử dụng dịch vụ
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh]">
                        <DialogHeader>
                          <DialogTitle>📜 ĐIỀU KHOẢN SỬ DỤNG DỊCH VỤ</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="h-[60vh] pr-4">
                          <div className="space-y-4 text-sm">
                            <div>
                              <p><strong>Website:</strong> https://otistx.com</p>
                              <p><strong>Cập nhật lần cuối:</strong> 25/06/2025</p>
                            </div>
                            
                            <div>
                              <h3 className="font-semibold text-base mb-2">I. GIỚI THIỆU</h3>
                              <p>Chào mừng bạn đến với otistx.com – nền tảng cung cấp dịch vụ thuê số điện thoại OTP (One-Time Password) tạm thời. Việc truy cập và/hoặc sử dụng bất kỳ dịch vụ nào trên otistx.com đồng nghĩa với việc bạn đồng ý hoàn toàn và vô điều kiện với các điều khoản dưới đây.</p>
                            </div>
                            
                            <div>
                              <h3 className="font-semibold text-base mb-2">II. ĐỐI TƯỢNG ÁP DỤNG</h3>
                              <p>Các điều khoản này áp dụng cho:</p>
                              <ul className="list-disc list-inside ml-4 space-y-1">
                                <li>Mọi cá nhân, tổ chức sử dụng dịch vụ của otistx.com;</li>
                                <li>Cả khách hàng sử dụng qua giao diện web, API hoặc nền tảng bên thứ ba.</li>
                              </ul>
                            </div>
                            
                            <div>
                              <h3 className="font-semibold text-base mb-2">III. MỤC ĐÍCH SỬ DỤNG HỢP PHÁP</h3>
                              <p>Người dùng cam kết chỉ sử dụng dịch vụ OTP thuê tại otistx.com với các mục đích hợp pháp, bao gồm nhưng không giới hạn:</p>
                              <ul className="list-disc list-inside ml-4 space-y-1">
                                <li>Đăng ký tài khoản cho bản thân nhằm mục đích cá nhân, học tập, nghiên cứu hoặc làm việc;</li>
                                <li>Kiểm thử ứng dụng, hệ thống hoặc trải nghiệm chức năng xác thực SMS;</li>
                                <li>Hỗ trợ người dùng không có số điện thoại chính chủ;</li>
                                <li>Các hoạt động hợp pháp khác không vi phạm điều khoản dịch vụ của nền tảng bên thứ ba và không trái pháp luật Việt Nam.</li>
                              </ul>
                            </div>
                            
                            <div>
                              <h3 className="font-semibold text-base mb-2">IV. HÀNH VI BỊ NGHIÊM CẤM</h3>
                              <p>Người dùng TUYỆT ĐỐI KHÔNG được sử dụng dịch vụ của otistx.com vào bất kỳ mục đích nào sau đây:</p>
                              <ul className="list-disc list-inside ml-4 space-y-1">
                                <li>Tạo tài khoản giả hàng loạt nhằm trục lợi khuyến mãi, referral, coupon, tích điểm…;</li>
                                <li>Spam, gửi tin rác, seeding, gian lận lượt đánh giá, bình chọn trên các nền tảng mạng xã hội/thương mại điện tử;</li>
                                <li>Mạo danh tổ chức, cá nhân khác để lừa đảo, giả mạo tài khoản ngân hàng, ví điện tử…;</li>
                                <li>Vi phạm điều khoản dịch vụ của bên thứ ba như: Shopee, TikTok, Facebook, Zalo, v.v.;</li>
                                <li>Sử dụng dịch vụ để thực hiện hành vi lừa đảo, lôi kéo người khác vào hoạt động bất hợp pháp hoặc xâm phạm an ninh mạng, phá hoại hệ thống;</li>
                                <li>Chia sẻ OTP với bên thứ ba mà không có thỏa thuận hợp pháp rõ ràng.</li>
                              </ul>
                              <p className="mt-2 font-medium">Nếu phát hiện hành vi vi phạm, chúng tôi có quyền ngừng cung cấp dịch vụ, khóa tài khoản và báo cáo cơ quan chức năng mà không cần thông báo trước.</p>
                            </div>
                            
                            <div>
                              <h3 className="font-semibold text-base mb-2">V. TRÁCH NHIỆM VÀ CAM KẾT CỦA NGƯỜI DÙNG</h3>
                              <p>Khi sử dụng dịch vụ tại otistx.com, bạn cam kết:</p>
                              <ul className="list-disc list-inside ml-4 space-y-1">
                                <li>Tự chịu trách nhiệm pháp lý về tất cả hành vi phát sinh từ việc sử dụng mã OTP thuê;</li>
                                <li>Không truy cập trái phép, phá hoại hoặc khai thác lỗ hổng dịch vụ;</li>
                                <li>Không yêu cầu hoàn tiền hoặc bồi thường trong trường hợp sử dụng sai mục đích hoặc vi phạm quy định;</li>
                                <li>Chấp nhận để otistx.com ghi log IP, thời gian truy cập, lịch sử API để phục vụ kiểm tra, điều tra nếu cần.</li>
                              </ul>
                            </div>
                            
                            <div>
                              <h3 className="font-semibold text-base mb-2">VI. QUYỀN HẠN CỦA OTISTX.COM</h3>
                              <p>Chúng tôi có quyền:</p>
                              <ul className="list-disc list-inside ml-4 space-y-1">
                                <li>Từ chối phục vụ hoặc khóa tài khoản của người dùng có hành vi vi phạm;</li>
                                <li>Cung cấp thông tin người dùng cho cơ quan chức năng khi có yêu cầu hợp pháp;</li>
                                <li>Tạm dừng dịch vụ để bảo trì hoặc xử lý tình huống khẩn cấp mà không cần báo trước;</li>
                                <li>Lưu trữ thông tin OTP, thời điểm sử dụng, địa chỉ IP để đảm bảo truy xuất minh bạch.</li>
                              </ul>
                            </div>
                            
                            <div>
                              <h3 className="font-semibold text-base mb-2">VII. MIỄN TRỪ TRÁCH NHIỆM</h3>
                              <p>otistx.com chỉ là đơn vị trung gian cung cấp số điện thoại tạm thời để người dùng nhận mã OTP. Chúng tôi:</p>
                              <ul className="list-disc list-inside ml-4 space-y-1">
                                <li>Không chịu trách nhiệm đối với bất kỳ nội dung, tài khoản, hành vi hoặc hệ quả nào phát sinh từ việc sử dụng mã OTP thuê;</li>
                                <li>Không bảo đảm bất kỳ lợi ích thương mại nào phát sinh từ việc sử dụng dịch vụ;</li>
                                <li>Không chịu trách nhiệm nếu người dùng sử dụng sai mục đích, gian lận hoặc vi phạm pháp luật.</li>
                              </ul>
                            </div>
                            
                            <div>
                              <h3 className="font-semibold text-base mb-2">VIII. CHẤP THUẬN VÀ CẬP NHẬT</h3>
                              <p>Việc sử dụng dịch vụ đồng nghĩa với việc bạn:</p>
                              <ul className="list-disc list-inside ml-4 space-y-1">
                                <li>Đã đọc, hiểu rõ và đồng ý với toàn bộ Điều khoản sử dụng;</li>
                                <li>Đồng ý rằng chúng tôi có thể cập nhật nội dung này bất kỳ lúc nào để phù hợp với thay đổi pháp lý hoặc tình hình vận hành;</li>
                                <li>Có trách nhiệm tự theo dõi và cập nhật điều khoản mới nhất được công bố công khai trên otistx.com.</li>
                              </ul>
                            </div>
                            
                            <div>
                              <h3 className="font-semibold text-base mb-2">IX. LIÊN HỆ HỖ TRỢ</h3>
                              <p>Mọi vấn đề pháp lý, phản ánh hoặc hỗ trợ kỹ thuật vui lòng liên hệ:</p>
                              <ul className="list-disc list-inside ml-4 space-y-1">
                                <li><strong>Website:</strong> https://otistx.com</li>
                                <li><strong>Email:</strong> otistxphone@gmail.com</li>
                                <li><strong>Thời gian hỗ trợ:</strong> 8h00 – 21h00 (T2 – CN)</li>
                              </ul>
                            </div>
                          </div>
                        </ScrollArea>
                      </DialogContent>
                    </Dialog>
                    {" "}<span className="text-red-500">*</span>
                  </Label>
                </div>
              </div>
              {form.formState.errors.agreeToTerms && (
                <p className="text-sm text-destructive ml-6">
                  {form.formState.errors.agreeToTerms.message}
                </p>
              )}
            </div>
            
            <Button
              type="submit"
              className="w-full bg-gradient-shopee hover:bg-shopee-dark"
              disabled={isLoading || !form.watch("agreeToTerms")}
            >
              {isLoading ? "Đang đăng ký..." : "Đăng ký"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-600">
              Đã có tài khoản? 
              <button 
                onClick={() => setLocation("/login")}
                className="text-shopee-orange hover:underline ml-1"
              >
                Đăng nhập ngay
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}