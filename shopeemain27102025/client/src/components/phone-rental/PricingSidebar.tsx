import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

interface PricingSidebarProps {
  activeSessions: number;
  totalHistory: number;
  successToday: number;
}

export const PricingSidebar = ({ activeSessions, totalHistory, successToday }: PricingSidebarProps) => {
  const { user } = useAuth();
  
  // Fetch dynamic pricing for phone rental services
  const { data: servicePricing = [] } = useQuery({
    queryKey: ['/api/service-pricing'],
    enabled: !!user,
  });

  // Extract prices for each service
  const otissimV1Price = servicePricing.find((s: any) => s.serviceType === 'otissim_v1' && s.serviceName === 'Otissim_v1')?.price || '1900';
  const otissimV2Price = servicePricing.find((s: any) => s.serviceType === 'otissim_v2' && s.serviceName === 'Otissim_v2')?.price || '2700';
  const otissimV3Price = servicePricing.find((s: any) => s.serviceType === 'otissim_v3' && s.serviceName === 'Otissim_v3')?.price || '2000';
  return (
    <div className="space-y-6">
      {/* Price Info */}
      <Card className="shadow-sm border-gray-200">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center">
            <CreditCard className="w-5 h-5 mr-2 text-green-600" />
            Bảng giá
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">OtisSim v1</span>
              <span className="font-semibold text-gray-900">{parseFloat(otissimV1Price).toLocaleString()} VND</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">OtisSim v2</span>
              <span className="font-semibold text-gray-900">{parseFloat(otissimV2Price).toLocaleString()} VND</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">OtisSim v3</span>
              <span className="font-semibold text-gray-900">{parseFloat(otissimV3Price).toLocaleString()} VND</span>
            </div>
            <div className="text-xs text-gray-500 mt-3">
              • Thời gian thuê: 6 phút
              <br />
              • Tỷ lệ thành công: 95%+
              <br />
              • Hỗ trợ tất cả dịch vụ
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      <Card className="shadow-sm border-gray-200">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold">Thống kê</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Sessions đang hoạt động</span>
              <span className="font-semibold">{activeSessions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Tổng lịch sử</span>
              <span className="font-semibold">{totalHistory}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Thành công hôm nay</span>
              <span className="font-semibold text-green-600">{successToday}</span>
            </div>
          </div>
        </CardContent>
      </Card>


    </div>
  );
};