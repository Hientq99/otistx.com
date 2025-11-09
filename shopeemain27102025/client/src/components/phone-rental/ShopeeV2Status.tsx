import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, CheckCircle, Clock, Phone } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ShopeeV2StatusData {
  userId: number;
  globalPending: number;
  maxPending: number;
  userPending: number;
  userPendingNumbers: string[];
  canRequestNow: boolean;
  nextAllowedTime: number | null;
  timeUntilNextRequest: number;
}

export function ShopeeV2Status() {
  const { data, isLoading, error } = useQuery<ShopeeV2StatusData>({
    queryKey: ['/api/phone-rental/shopee-v2-status'],
    // CONDITIONAL POLLING: Chỉ poll khi user có pending numbers hoặc không thể request ngay
    refetchInterval: (query) => {
      const data = query.state.data;
      const needsPolling = data && (data.userPending > 0 || !data.canRequestNow || data.timeUntilNextRequest > 0);
      return needsPolling ? 60000 : false; // 60s nếu cần theo dõi, tắt nếu không
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Trạng thái Shopee SIM v2
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Trạng thái Shopee SIM v2
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Không thể tải trạng thái rate limit
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const progressPercentage = (data.globalPending / data.maxPending) * 100;
  const remainingSlots = data.maxPending - data.globalPending;

  const formatTime = (ms: number) => {
    if (ms <= 0) return '0 giây';
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds} giây`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes} phút ${remainingSeconds} giây`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-4 w-4" />
          Trạng thái Global Queue SIM v2
        </CardTitle>
        <CardDescription>
          Hàng chờ toàn cầu cho tất cả người dùng
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Global Queue Progress */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Hàng chờ toàn cầu</span>
            <span className="text-sm text-muted-foreground">
              {data.globalPending}/{data.maxPending}
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Còn trống: {remainingSlots} slot</span>
            <span>{progressPercentage.toFixed(1)}% đã sử dụng</span>
          </div>
        </div>

        {/* User's Pending Numbers */}
        {data.userPending > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Số của bạn đang chờ</span>
              <span className="text-sm text-muted-foreground">
                {data.userPending} số
              </span>
            </div>
          </div>
        )}

        {/* Status Badges */}
        <div className="flex flex-wrap gap-2">
          <Badge 
            variant={data.canRequestNow ? "default" : "destructive"}
            className="flex items-center gap-1"
          >
            {data.canRequestNow ? (
              <CheckCircle className="h-3 w-3" />
            ) : (
              <AlertCircle className="h-3 w-3" />
            )}
            {data.canRequestNow ? "Có thể thuê SIM" : "Hàng chờ đầy"}
          </Badge>

          {data.globalPending >= data.maxPending && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Queue đầy ({data.maxPending})
            </Badge>
          )}

          {data.userPending > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {data.userPending} số của bạn
            </Badge>
          )}
        </div>

        {/* Time Until Next Request */}
        {data.timeUntilNextRequest > 0 && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              Có thể thuê SIM tiếp theo sau: <strong>{formatTime(data.timeUntilNextRequest)}</strong>
            </AlertDescription>
          </Alert>
        )}

        {/* Pending Numbers */}
        {data.userPendingNumbers.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Số điện thoại của bạn đang chờ:</h4>
            <div className="flex flex-wrap gap-1">
              {data.userPendingNumbers.map((number, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {number}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Global Queue Rules */}
        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <p>• Tối đa 30 số đang chờ trong toàn hệ thống</p>
          <p>• Chờ 3 giây giữa các lần thuê của cùng user</p>
          <p>• Số tự động hết hạn sau 6 phút</p>
          <p>• Nhận OTP thành công sẽ giải phóng slot ngay lập tức</p>
        </div>
      </CardContent>
    </Card>
  );
}