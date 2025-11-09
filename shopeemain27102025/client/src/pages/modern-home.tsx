import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FixedHeader } from "@/components/fixed-header";
import { Check, Smartphone, Shield, Clock, Zap, Star, Users, Globe, ArrowRight } from "lucide-react";

export default function ModernHome() {
  const stats = [
    { label: "Người dùng hoạt động", value: "10,000+", icon: Users },
    { label: "Giao dịch thành công", value: "99.9%", icon: Check },
    { label: "Phục vụ 24/7", value: "365 ngày", icon: Clock },
    { label: "Quốc gia", value: "5+", icon: Globe }
  ];

  const services = [
    {
      icon: <Smartphone className="h-8 w-8" />,
      title: "Thuê Số Điện Thoại",
      description: "Thuê số điện thoại Việt Nam để đăng ký tài khoản Shopee nhanh chóng và an toàn",
      features: ["Viettel, Vinaphone, Mobifone", "Nhận OTP tự động", "Giá từ 3,000 VNĐ"],
      color: "from-orange-500 to-red-500"
    },
    {
      icon: <Shield className="h-8 w-8" />,
      title: "Kiểm Tra Tài Khoản",
      description: "Kiểm tra thông tin tài khoản Shopee qua cookie, xác minh trạng thái và bảo mật",
      features: ["Kiểm tra cookie SPC_F/SPC_ST", "Thông tin chi tiết", "Bảo mật cao"],
      color: "from-blue-500 to-cyan-500"
    },
    {
      icon: <Zap className="h-8 w-8" />,
      title: "Quản Lý Đa Dịch Vụ",
      description: "Theo dõi đơn hàng, thêm email, quản lý cookie trong một nền tảng",
      features: ["Tracking đơn hàng", "Thêm email tự động", "Dashboard tổng quan"],
      color: "from-purple-500 to-pink-500"
    }
  ];



  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Fixed Header */}
      <FixedHeader />
      
      {/* Modern Header */}
      <header className="bg-gradient-to-r from-orange-600 via-red-600 to-pink-600 text-white pt-16">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center max-w-4xl mx-auto">
            <Badge className="mb-4 bg-white/20 text-white border-white/30">
              Nền tảng #1 cho dịch vụ Shopee Việt Nam
            </Badge>
            <h1 className="text-6xl font-bold mb-6 leading-tight">
              <span className="text-yellow-300">OtisShopee</span><br />
              Dịch Vụ Chuyên Nghiệp
            </h1>
            <p className="text-xl mb-8 opacity-90 leading-relaxed max-w-2xl mx-auto">
              Thuê số điện thoại, quản lý cookie, kiểm tra tài khoản và theo dõi đơn hàng Shopee 
              với độ tin cậy 99.9% và hỗ trợ 24/7
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <Button size="lg" className="bg-white text-orange-600 hover:bg-gray-100 font-semibold px-8">
                  Bắt Đầu Miễn Phí
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/shopee-services">
                <Button size="lg" className="bg-orange-500 text-white hover:bg-orange-600 font-semibold px-8">
                  Xem Demo
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Section */}
      <section className="py-16 bg-gray-50 dark:bg-gray-800">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <stat.icon className="h-8 w-8 text-white" />
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{stat.value}</div>
                <div className="text-gray-600 dark:text-gray-300">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Dịch Vụ Của Chúng Tôi</h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Bộ công cụ hoàn chỉnh để quản lý và phát triển business Shopee của bạn
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {services.map((service, index) => (
              <Card key={index} className="group hover:shadow-2xl transition-all duration-300 border-0 bg-white dark:bg-gray-800 overflow-hidden">
                <CardHeader className="pb-4">
                  <div className={`w-16 h-16 bg-gradient-to-r ${service.color} rounded-2xl flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform`}>
                    {service.icon}
                  </div>
                  <CardTitle className="text-2xl mb-2">{service.title}</CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    {service.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {service.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-3">
                        <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full mt-6 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600">
                    Tìm Hiểu Thêm
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>



      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-orange-600 to-red-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-4">Sẵn Sàng Bắt Đầu?</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            Tham gia cùng hàng nghìn người bán Shopee đang sử dụng nền tảng của chúng tôi
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="bg-white text-orange-600 hover:bg-gray-100 font-semibold px-8">
                Đăng Ký Miễn Phí
              </Button>
            </Link>
            <Link href="/shopee-services">
              <Button size="lg" className="bg-orange-500 text-white hover:bg-orange-600 font-semibold px-8">
                Xem Demo Ngay
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-xl font-bold mb-4">OtisShopee</h3>
              <p className="text-gray-400">
                Nền tảng dịch vụ Shopee hàng đầu Việt Nam với độ tin cậy cao.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Dịch Vụ</h4>
              <ul className="space-y-2 text-gray-400">
                <li>Thuê số điện thoại</li>
                <li>Kiểm tra tài khoản</li>
                <li>Quản lý cookie</li>
                <li>Tracking đơn hàng</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Hỗ Trợ</h4>
              <ul className="space-y-2 text-gray-400">
                <li>Tài liệu API</li>
                <li>Hướng dẫn sử dụng</li>
                <li>FAQ</li>
                <li>Liên hệ</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Liên Hệ</h4>
              <ul className="space-y-2 text-gray-400">
                <li>Email: support@shopeeservice.vn</li>
                <li>Hotline: 1900 XXX XXX</li>
                <li>Địa chỉ: TP.HCM, Việt Nam</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Shopee Services. Tất cả quyền được bảo lưu.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}