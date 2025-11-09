import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Check, 
  Shield, 
  Search, 
  Cookie,
  Package,
  Mail,
  Smartphone,
  Star,
  Users,
  TrendingUp,
  ArrowRight,
  CheckCircle,
  MessageCircle,
  ExternalLink
} from "lucide-react";

export default function Home() {
  const [showSupportPopup, setShowSupportPopup] = useState(false);

  useEffect(() => {
    console.log('Home component mounted - testing popup');
    
    // Test popup ngay lập tức để debug
    setTimeout(() => {
      console.log('Setting popup to true for testing');
      setShowSupportPopup(true);
    }, 2000);
  }, []);

  // Debug log khi state thay đổi
  useEffect(() => {
    console.log('showSupportPopup state changed to:', showSupportPopup);
  }, [showSupportPopup]);

  const handleClosePopup = () => {
    setShowSupportPopup(false);
  };

  const handleJoinTelegram = () => {
    window.open('https://t.me/+GTv2l-RcQjFhNDg1', '_blank');
    handleClosePopup();
  };
  const services = [
    {
      title: "Quản lý Cookie",
      description: "Quản lý và lưu trữ cookie Shopee một cách an toàn",
      icon: <Cookie className="h-8 w-8" />,
      color: "from-purple-400 to-pink-500",
      link: "/cookie-manager",
      features: ["Lưu trữ bảo mật", "Quản lý dễ dàng", "Tìm kiếm nhanh"]
    },
    {
      title: "Kiểm tra tài khoản Shopee",
      description: "Kiểm tra thông tin chi tiết tài khoản Shopee qua cookie",
      icon: <Shield className="h-8 w-8" />,
      color: "from-orange-400 to-red-500",
      link: "/account-check",
      features: ["Thông tin đầy đủ", "Kiểm tra nhanh chóng", "Bảo mật cao"]
    },
    {
      title: "Tra cứu đơn hàng",
      description: "Theo dõi và kiểm tra trạng thái đơn hàng Shopee",
      icon: <Package className="h-8 w-8" />,
      color: "from-blue-400 to-indigo-500",
      link: "/tracking-check",
      features: ["Cập nhật real-time", "Thông tin chi tiết", "Lịch sử đơn hàng"]
    },
    {
      title: "Kiểm tra số điện thoại",
      description: "Kiểm tra số điện thoại đã đăng ký Shopee chưa",
      icon: <Search className="h-8 w-8" />,
      color: "from-green-400 to-emerald-500",
      link: "/phone-check",
      features: ["Kiểm tra hàng loạt", "Kết quả chính xác", "Xuất file Excel"]
    },
    {
      title: "Thêm email vào tài khoản",
      description: "Tự động thêm email vào tài khoản Shopee",
      icon: <Mail className="h-8 w-8" />,
      color: "from-yellow-400 to-orange-500",
      link: "/add-email",
      features: ["Thêm tự động", "Hỗ trợ hàng loạt", "Tỷ lệ thành công cao"]
    },
    {
      title: "Thuê số điện thoại",
      description: "Thuê số điện thoại tạm thời cho đăng ký tài khoản",
      icon: <Smartphone className="h-8 w-8" />,
      color: "from-red-400 to-pink-500",
      link: "/phone-rental",
      features: ["Nhận OTP tự động", "Nhiều nhà mạng", "Thời gian linh hoạt"]
    }
  ];

  const features = [
    {
      title: "Bảo mật cao",
      description: "Dữ liệu được mã hóa và bảo vệ tối đa",
      icon: <Shield className="h-6 w-6 text-green-600" />
    },
    {
      title: "Tốc độ nhanh",
      description: "Xử lý yêu cầu trong vài giây",
      icon: <TrendingUp className="h-6 w-6 text-blue-600" />
    },
    {
      title: "Hỗ trợ 24/7",
      description: "Đội ngũ hỗ trợ luôn sẵn sàng",
      icon: <Users className="h-6 w-6 text-purple-600" />
    }
  ];



  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Hero Section */}
      <section className="relative py-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-600/10 to-red-600/10 dark:from-orange-900/20 dark:to-red-900/20"></div>
        <div className="container mx-auto text-center relative z-10">
          <div className="max-w-4xl mx-auto">
            <Badge className="mb-6 bg-gradient-to-r from-orange-500 to-red-500 text-white border-0 px-4 py-2">
              ⭐ Công cụ quản lý Shopee hàng đầu Việt Nam
            </Badge>
            <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
              Hỗ trợ quản lý tài khoản Shopee
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
              Quản lý cookie, kiểm tra tài khoản và theo dõi đơn hàng Shopee
              <br className="hidden md:block" />
              với độ tin cậy 99.9% và hỗ trợ 24/7
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/cookie-manager">
                <Button size="lg" className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white px-8 py-3 text-lg">
                  Bắt đầu ngay
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/api-docs">
                <Button variant="outline" size="lg" className="border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 px-8 py-3 text-lg">
                  Xem tài liệu API
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
              Tại sao chọn chúng tôi?
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Chúng tôi cung cấp các công cụ mạnh mẽ và đáng tin cậy để hỗ trợ hoạt động kinh doanh của bạn
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="text-center p-6 hover:shadow-lg transition-all duration-300 border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
                <div className="mb-4 flex justify-center">
                  <div className="p-3 rounded-full bg-gray-50 dark:bg-gray-700">
                    {feature.icon}
                  </div>
                </div>
                <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  {feature.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-16 px-4 bg-gradient-to-r from-gray-50 to-orange-50/30 dark:from-gray-800 dark:to-gray-900">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
              Dịch vụ của chúng tôi
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Bộ công cụ hoàn chỉnh để quản lý và phát triển hoạt động bán hàng Shopee của bạn
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service, index) => (
              <Link key={index} href={service.link}>
                <Card className="h-full hover:shadow-xl transition-all duration-300 cursor-pointer border-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm hover:scale-105 group">
                  <CardHeader className="pb-4">
                    <div className={`w-16 h-16 rounded-xl bg-gradient-to-r ${service.color} flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform duration-300`}>
                      {service.icon}
                    </div>
                    <CardTitle className="text-xl font-semibold text-gray-900 dark:text-white group-hover:text-orange-600 transition-colors">
                      {service.title}
                    </CardTitle>
                    <CardDescription className="text-gray-600 dark:text-gray-300">
                      {service.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {service.features.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                          <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>



      {/* CTA Section */}
      <section className="py-16 px-4 bg-gradient-to-r from-orange-500 to-red-500">
        <div className="container mx-auto text-center">
          <div className="max-w-3xl mx-auto text-white">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Sẵn sàng bắt đầu?
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Tham gia cùng hàng nghìn seller Shopee đang sử dụng công cụ của chúng tôi để phát triển kinh doanh
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <Button size="lg" variant="secondary" className="bg-white text-orange-600 hover:bg-gray-100 px-8 py-3 text-lg font-semibold">
                  Đăng ký miễn phí
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 px-8 py-3 text-lg">
                  Liên hệ tư vấn
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 px-4 bg-gray-50 dark:bg-gray-800">
        <div className="container mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <h3 className="text-3xl font-bold text-orange-600 mb-2">5,000+</h3>
              <p className="text-gray-600 dark:text-gray-300">Khách hàng tin tưởng</p>
            </div>
            <div>
              <h3 className="text-3xl font-bold text-orange-600 mb-2">99.9%</h3>
              <p className="text-gray-600 dark:text-gray-300">Thời gian hoạt động</p>
            </div>
            <div>
              <h3 className="text-3xl font-bold text-orange-600 mb-2">100K+</h3>
              <p className="text-gray-600 dark:text-gray-300">Tài khoản được quản lý</p>
            </div>
            <div>
              <h3 className="text-3xl font-bold text-orange-600 mb-2">24/7</h3>
              <p className="text-gray-600 dark:text-gray-300">Hỗ trợ khách hàng</p>
            </div>
          </div>
        </div>
      </section>

      {/* Support Group Popup */}
      <Dialog open={showSupportPopup} onOpenChange={setShowSupportPopup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full">
                <MessageCircle className="h-5 w-5 text-white" />
              </div>
              Hỗ trợ 24/7
            </DialogTitle>
            <DialogDescription className="text-base">
              Chào mừng bạn đến với OtisShopee! Tham gia group Telegram để nhận hỗ trợ nhanh chóng và cập nhật thông tin mới nhất.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-4 py-4">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-3 mb-2">
                <MessageCircle className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-blue-800 dark:text-blue-200">
                  Group hỗ trợ chính thức
                </span>
              </div>
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                • Hỗ trợ kỹ thuật 24/7<br/>
                • Hướng dẫn sử dụng chi tiết<br/>
                • Thông báo cập nhật tính năng mới<br/>
                • Cộng đồng người dùng thân thiện
              </p>
              <div className="bg-white dark:bg-gray-800 p-2 rounded border border-blue-200 dark:border-blue-700">
                <code className="text-xs text-gray-600 dark:text-gray-300 break-all">
                  https://t.me/+GTv2l-RcQjFhNDg1
                </code>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline" 
              onClick={handleClosePopup}
              className="w-full sm:w-auto"
            >
              Để sau
            </Button>
            <Button 
              onClick={handleJoinTelegram}
              className="w-full sm:w-auto bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Tham gia ngay
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}