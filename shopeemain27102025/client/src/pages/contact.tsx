import { useState } from "react";
import { FixedHeader } from "@/components/fixed-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  Mail, 
  Phone, 
  MapPin, 
  Clock, 
  MessageSquare, 
  Send,
  Facebook,
  MessageCircle,
  Globe
} from "lucide-react";

export default function Contact() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate form submission
    setTimeout(() => {
      toast({
        title: "Đã gửi thành công!",
        description: "Chúng tôi sẽ phản hồi trong vòng 24 giờ.",
      });
      setFormData({ name: "", email: "", phone: "", subject: "", message: "" });
      setIsSubmitting(false);
    }, 1000);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const contactInfo = [
    {
      icon: Mail,
      title: "Email",
      content: "Otistxphone@gmail.com",
      description: "Gửi email cho chúng tôi"
    },
    {
      icon: Phone,
      title: "Hotline",
      content: "1900 XXX XXX",
      description: "Hỗ trợ 24/7"
    },
    {
      icon: MapPin,
      title: "Địa chỉ",
      content: "TP. Hồ Chí Minh, Việt Nam",
      description: "Văn phòng chính"
    },
    {
      icon: Clock,
      title: "Giờ làm việc",
      content: "24/7",
      description: "Hỗ trợ trực tuyến"
    }
  ];

  const socialLinks = [
    {
      icon: Facebook,
      name: "Facebook",
      url: "#",
      color: "bg-blue-600"
    },
    {
      icon: MessageCircle,
      name: "Telegram",
      url: "https://t.me/+GTv2l-RcQjFhNDg1",
      color: "bg-blue-500"
    },
    {
      icon: Globe,
      name: "Website",
      url: "#",
      color: "bg-gray-600"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <FixedHeader />
      
      <div className="pt-20 pb-16">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Mail className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Liên Hệ Với Chúng Tôi</h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Có câu hỏi về dịch vụ? Cần hỗ trợ kỹ thuật? Chúng tôi luôn sẵn sàng giúp đỡ bạn
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {/* Contact Form */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Gửi Tin Nhắn
                  </CardTitle>
                  <CardDescription>
                    Điền thông tin bên dưới và chúng tôi sẽ phản hồi sớm nhất
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="name">Họ và tên *</Label>
                        <Input
                          id="name"
                          name="name"
                          placeholder="Nhập họ và tên"
                          value={formData.name}
                          onChange={handleInputChange}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email *</Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          placeholder="Nhập email"
                          value={formData.email}
                          onChange={handleInputChange}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="phone">Số điện thoại</Label>
                        <Input
                          id="phone"
                          name="phone"
                          placeholder="Nhập số điện thoại"
                          value={formData.phone}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div>
                        <Label htmlFor="subject">Chủ đề *</Label>
                        <Input
                          id="subject"
                          name="subject"
                          placeholder="Chủ đề liên hệ"
                          value={formData.subject}
                          onChange={handleInputChange}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="message">Nội dung *</Label>
                      <Textarea
                        id="message"
                        name="message"
                        placeholder="Mô tả chi tiết vấn đề hoặc câu hỏi của bạn..."
                        value={formData.message}
                        onChange={handleInputChange}
                        rows={6}
                        required
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                    >
                      {isSubmitting ? (
                        "Đang gửi..."
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Gửi Tin Nhắn
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Contact Info */}
            <div className="space-y-6">
              {/* Contact Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Thông Tin Liên Hệ</CardTitle>
                  <CardDescription>
                    Các cách để liên hệ trực tiếp với chúng tôi
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {contactInfo.map((info, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
                        <info.icon className="h-5 w-5 text-orange-600" />
                      </div>
                      <div>
                        <h4 className="font-medium">{info.title}</h4>
                        <p className="text-sm text-gray-900 dark:text-white font-medium">{info.content}</p>
                        <p className="text-xs text-gray-500">{info.description}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Social Links */}
              <Card>
                <CardHeader>
                  <CardTitle>Kết Nối Với Chúng Tôi</CardTitle>
                  <CardDescription>
                    Theo dõi chúng tôi trên các mạng xã hội
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {socialLinks.map((social, index) => (
                      <a
                        key={index}
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <div className={`w-8 h-8 ${social.color} rounded-lg flex items-center justify-center`}>
                          <social.icon className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">{social.name}</span>
                          {social.name === 'Telegram' && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 break-all">
                              {social.url}
                            </span>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* FAQ */}
              <Card>
                <CardHeader>
                  <CardTitle>Câu Hỏi Thường Gặp</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 text-sm">
                    <div>
                      <h4 className="font-medium mb-1">Thời gian phản hồi?</h4>
                      <p className="text-gray-600 dark:text-gray-400">
                        Chúng tôi phản hồi trong vòng 24 giờ làm việc
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-1">Hỗ trợ kỹ thuật?</h4>
                      <p className="text-gray-600 dark:text-gray-400">
                        Có hỗ trợ 24/7 qua hotline và email
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-1">Báo giá dự án?</h4>
                      <p className="text-gray-600 dark:text-gray-400">
                        Liên hệ trực tiếp để được tư vấn chi tiết
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}