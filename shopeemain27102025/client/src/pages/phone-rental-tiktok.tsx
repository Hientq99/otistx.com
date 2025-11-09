import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { FixedHeader } from '@/components/fixed-header';
import { notifyOtpSuccess } from '@/lib/notifications';
import confetti from 'canvas-confetti';
import { 
  Phone, 
  Smartphone, 
  Clock, 
  Copy, 
  RefreshCw, 
  Loader2,
  CreditCard,
  BarChart3,
  History,
  Check,
  DollarSign,
  CheckCircle,
  XCircle,
  Search,
  Calendar
} from 'lucide-react';
import { Input } from '@/components/ui/input';

// TikTok Service Types
type ServiceType = 'tiktoksim_v1';
type CarrierType = 'main_3' | 'vnmb' | 'itel' | 'random';

const TIKTOK_CARRIERS = [
  { value: 'main_3' as CarrierType, label: '3 mạng chính (Viettel, Vina, Mobi)' },
  { value: 'vnmb' as CarrierType, label: 'VNMB' },
  { value: 'itel' as CarrierType, label: 'iTel' },
  { value: 'random' as CarrierType, label: 'Random' }
];

export default function PhoneRentalTikTokPage() {
  // Get current user info for cache isolation
  const { data: currentUser } = useQuery({ queryKey: ["/api/auth/me"] });
  const userId = currentUser?.id;

  const { data: balance = 0 } = useQuery<number>({
    queryKey: ['/api/user/balance']
  });

  // Get service pricing for TikTok rental
  const { data: servicePricing = [] } = useQuery({
    queryKey: ['/api/service-pricing']
  });

  const tiktokRentalPrice = servicePricing.find((s: any) => s.serviceType === 'tiktok_rental')?.price || '1200';

  const { data: activeSessions = [] } = useQuery({
    queryKey: ['/api/tiktok-rental/active-sessions', userId],
    // CONDITIONAL POLLING: Chỉ poll khi có sessions đang "waiting" (chờ OTP)
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasWaitingSessions = data?.some((s: any) => s.status === 'waiting');
      return hasWaitingSessions ? 1000 : false; // 1s live speed nếu có pending, tắt nếu không
    },
    enabled: !!userId
  });

  // TikTok OTP polling mutation
  const getOtpMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return apiRequest({
        url: `/api/tiktok-rental/get-otp`,
        method: 'POST',
        body: { sessionId }
      });
    },
    onSuccess: (data, sessionId) => {
      if (data.status === 'completed' && data.otpCode) {
        toast({
          title: "Nhận OTP thành công",
          description: `Mã OTP: ${data.otpCode}`,
        });
        
        // Sound + Browser notification
        const phoneNumber = activeSessions.find((s: any) => s.sessionId === sessionId)?.phoneNumber;
        notifyOtpSuccess(data.otpCode, phoneNumber);
        
        // Confetti celebration!
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
        
        // Refresh all TikTok queries after successful OTP
        queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tiktok-rental/active-sessions", userId] });
        queryClient.invalidateQueries({ queryKey: ["/api/tiktok-rental/history", userId] });
      } else if (data.status === 'expired') {
        // Handle expired session - automatic refund should happen on backend
        toast({
          title: "Session hết hạn",
          description: data.message || "Session đã hết thời gian chờ OTP. Tiền đã được hoàn lại.",
        });
        
        // Refresh all queries after timeout refund
        queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tiktok-rental/active-sessions", userId] });
        queryClient.invalidateQueries({ queryKey: ["/api/tiktok-rental/history", userId] });
      }
    },
    onError: (error: any) => {
      console.error('TikTok Get OTP error:', error);
    }
  });

  const { data: history = [] } = useQuery({
    queryKey: ['/api/tiktok-rental/history', userId],
    enabled: !!userId
  });

  // History filtering and pagination states
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [selectedService, setSelectedService] = useState<ServiceType>('tiktoksim_v1');
  const [selectedCarrier, setSelectedCarrier] = useState<CarrierType>('main_3');

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const startRentalMutation = useMutation({
    mutationFn: async () => {
      console.log('Starting TikTok rental with:', { selectedService, selectedCarrier });
      
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      try {
        const response = await fetch('/api/tiktok-rental/start', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            service: selectedService,
            carrier: selectedCarrier
          })
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        const contentType = response.headers.get('content-type');
        console.log('Content-Type:', contentType);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error response body:', errorText);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        if (!contentType?.includes('application/json')) {
          const htmlText = await response.text();
          console.error('Received HTML instead of JSON:', htmlText.substring(0, 500));
          throw new Error('Invalid JSON response: Expected JSON but received HTML');
        }

        const data = await response.json();
        console.log('TikTok rental response:', data);
        return data;
      } catch (error) {
        console.error('TikTok rental error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('TikTok rental success:', data);
      toast({
        title: "Thành công",
        description: `Đã thuê số ${data.phoneNumber}. Đang chờ OTP...`
      });
      queryClient.invalidateQueries({ queryKey: ['/api/tiktok-rental/active-sessions', userId] });
      queryClient.invalidateQueries({ queryKey: ['/api/tiktok-rental/history', userId] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/balance'] });
    },
    onError: (error: any) => {
      console.error('TikTok rental mutation error:', error);
      
      // Handle rate limiting error specifically
      if (error.status === 429 || error.message?.includes('quá nhiều lần')) {
        toast({
          title: "Đã vượt quá giới hạn",
          description: error.message || "Bạn đã thuê số quá nhiều lần. Vui lòng chờ một chút để tiếp tục.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Lỗi",
          description: error.message || "Không thể thuê số điện thoại",
          variant: "destructive"
        });
      }
    }
  });

  const handleStartRental = () => {
    console.log('handleStartRental called with:', { 
      selectedService, 
      selectedCarrier, 
      balance,
      isPending: startRentalMutation.isPending 
    });

    if (!selectedService || !selectedCarrier) {
      console.log('Missing service or carrier');
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn dịch vụ và nhà mạng",
        variant: "destructive"
      });
      return;
    }

    const requiredAmount = parseFloat(tiktokRentalPrice);
    if (balance < requiredAmount) {
      console.log('Insufficient balance:', balance);
      toast({
        title: "Lỗi",
        description: `Số dư không đủ. Cần ${requiredAmount.toLocaleString()} VND. Vui lòng nạp thêm tiền.`,
        variant: "destructive"
      });
      return;
    }

    console.log('Starting mutation...');
    startRentalMutation.mutate();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Đã sao chép",
        description: `Đã sao chép ${text} vào clipboard`
      });
    } catch (err) {
      toast({
        title: "Lỗi",
        description: "Không thể sao chép vào clipboard",
        variant: "destructive"
      });
    }
  };

  // Real-time countdown state
  const [currentTime, setCurrentTime] = useState(new Date().getTime());

  // Update current time every second for real-time countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().getTime());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // TikTok OTP polling effect for active sessions
  useEffect(() => {
    const waitingSessions = activeSessions.filter(session => session.status === 'waiting');
    
    if (waitingSessions.length === 0) return;

    const interval = setInterval(() => {
      waitingSessions.forEach(session => {
        getOtpMutation.mutate(session.sessionId);
      });
    }, 1000); // Poll every 1 second - Live speed

    return () => clearInterval(interval);
  }, [activeSessions, getOtpMutation]);

  const formatTimeLeft = (expiresAt: string) => {
    const expiry = new Date(expiresAt).getTime();
    const timeLeft = expiry - currentTime;

    if (timeLeft <= 0) return "Hết hạn";

    const minutes = Math.floor(timeLeft / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Calculate statistics
  const todaySuccess = history.filter((h: any) => {
    const today = new Date();
    const sessionDate = new Date(h.createdAt);
    return sessionDate.toDateString() === today.toDateString() && h.status === 'completed';
  });

  const allTimeSuccess = history.filter((h: any) => h.status === 'completed');

  // Filter history based on search and date
  const filteredHistory = history.filter((item: any) => {
    // Search filter
    const matchesSearch = item.phoneNumber?.includes(searchTerm) ||
                         item.sessionId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.status?.toLowerCase().includes(searchTerm.toLowerCase());

    // Date filter
    const itemDate = new Date(item.createdAt);
    const today = new Date();
    let matchesDate = true;

    switch (dateFilter) {
      case 'today':
        matchesDate = itemDate.toDateString() === today.toDateString();
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        matchesDate = itemDate.toDateString() === yesterday.toDateString();
        break;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        matchesDate = itemDate >= weekAgo;
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        matchesDate = itemDate >= monthAgo;
        break;
      case 'custom':
        if (customDateRange.start && customDateRange.end) {
          const startDate = new Date(customDateRange.start);
          const endDate = new Date(customDateRange.end);
          endDate.setHours(23, 59, 59, 999);
          matchesDate = itemDate >= startDate && itemDate <= endDate;
        }
        break;
      default:
        matchesDate = true;
    }

    return matchesSearch && matchesDate;
  });

  // Pagination
  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedHistory = filteredHistory.slice(startIndex, startIndex + itemsPerPage);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFilter, customDateRange, itemsPerPage]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <FixedHeader />
      
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Thuê số điện thoại TikTok</h1>
          <p className="text-gray-600">Thuê số tạm thời để nhận mã OTP đăng ký tài khoản TikTok</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Rental Form */}
          <div className="lg:col-span-2">
            <Card className="shadow-sm border-gray-200">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold">Tạo phiên thuê số mới</CardTitle>
                <CardDescription>Chọn dịch vụ và nhà mạng phù hợp</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Service Selection */}
                <div className="space-y-2">
                  <Label htmlFor="service" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Chọn dịch vụ
                  </Label>
                  <div className="grid grid-cols-1 gap-3">
                    <div 
                      className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md ${
                        selectedService === 'tiktoksim_v1' 
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' 
                          : 'border-gray-200 dark:border-gray-600 hover:border-orange-300'
                      }`}
                      onClick={() => setSelectedService('tiktoksim_v1')}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg">
                            <Smartphone className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">TikTok Sim v1</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">API thuê số TikTok - Tốc độ cao</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            {parseFloat(tiktokRentalPrice).toLocaleString()} VND
                          </Badge>
                          {selectedService === 'tiktoksim_v1' && (
                            <Check className="h-5 w-5 text-orange-500" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Carrier Selection */}
                <div className="space-y-2 mt-4">
                  <Label htmlFor="carrier" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Chọn nhà mạng
                  </Label>
                  <Select value={selectedCarrier} onValueChange={setSelectedCarrier}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Chọn nhà mạng" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIKTOK_CARRIERS.map((carrier) => (
                        <SelectItem key={carrier.value} value={carrier.value}>
                          <div className="flex items-center space-x-2">
                            <Phone className="h-4 w-4" />
                            <span>{carrier.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Start Rental Button */}
                <Button
                  onClick={handleStartRental}
                  disabled={startRentalMutation.isPending || !selectedService || !selectedCarrier || balance < parseFloat(tiktokRentalPrice)}
                  className="w-full mt-4 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-semibold py-3 shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  {startRentalMutation.isPending ? (
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Đang thuê số...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <Smartphone className="h-4 w-4" />
                      <span>Thuê số ngay - {parseFloat(tiktokRentalPrice).toLocaleString()} VND</span>
                    </div>
                  )}
                </Button>

                {balance < parseFloat(tiktokRentalPrice) && (
                  <p className="text-sm text-red-600 dark:text-red-400 text-center mt-2">
                    Số dư không đủ. Cần {parseFloat(tiktokRentalPrice).toLocaleString()} VND để thuê số.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div>
            {/* Pricing Table */}
            <Card className="shadow-sm border-gray-200 mb-6">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold flex items-center">
                  <CreditCard className="h-5 w-5 mr-2" />
                  Bảng Giá
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                    <span className="text-sm text-gray-600 dark:text-gray-400">TikTok Sim v1</span>
                    <span className="font-semibold text-green-600">{parseFloat(tiktokRentalPrice).toLocaleString()} VND</span>
                  </div>
                  <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <div className="flex items-center space-x-2 text-sm text-orange-700 dark:text-orange-300">
                      <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200">
                        Tức thì 5-10s
                      </Badge>
                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                        Hoàn tiền 100%
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Statistics */}
            <Card className="shadow-sm border-gray-200 mb-6">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2" />
                  Thống Kê
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Phiên đang hoạt động</span>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {activeSessions.length}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Tổng lịch sử</span>
                    <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                      {history.length}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Thành công hôm nay</span>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      {todaySuccess.length}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Tỷ lệ thành công</span>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                      {history.length > 0 ? Math.round((allTimeSuccess.length / history.length) * 100) : 0}%
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>


          </div>
        </div>

        {/* Active Sessions */}
        {activeSessions.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <RefreshCw className="h-5 w-5 mr-2" />
              Phiên đang hoạt động ({activeSessions.length})
            </h2>
            <div className="grid gap-4">
              {activeSessions.map((session: any) => (
                <Card key={session.sessionId} className="shadow-sm border-gray-200 border-l-4 border-l-blue-500">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                          <Smartphone className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {session.phoneNumber}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {session.service} - {session.carrier}
                          </p>
                          <div className="flex items-center space-x-2 mt-1">
                            <Badge variant="secondary">
                              Đang chờ OTP
                            </Badge>
                            <span className="text-xs text-gray-500">
                              Còn {Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 1000))}s
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {session.otpCode ? (
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                              {session.otpCode}
                            </div>
                            <Badge variant="default" className="bg-green-500">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Hoàn thành
                            </Badge>
                          </div>
                        ) : (
                          <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                            <Badge variant="secondary">
                              <Clock className="h-3 w-3 mr-1" />
                              Đang chờ
                            </Badge>
                          </div>
                        )}
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(session.phoneNumber)}
                          className="ml-2"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* History Section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <History className="w-5 h-5 mr-2" />
              Lịch sử thuê số ({history.length})
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['/api/tiktok-rental/history'] });
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Làm mới
            </Button>
          </div>
          
          <Card className="shadow-sm border-gray-200">
            <CardContent className="p-6">
              {history.length === 0 ? (
                <div className="text-center py-8">
                  <Smartphone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">Chưa có lịch sử thuê số</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((session: any) => (
                    <div key={session.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                          <Smartphone className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {session.phoneNumber}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {session.service} - {session.carrier}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(session.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        {session.otpCode && (
                          <div className="text-lg font-bold text-green-600 dark:text-green-400">
                            {session.otpCode}
                          </div>
                        )}
                        
                        <Badge 
                          variant={session.status === 'completed' ? 'default' : 
                                   session.status === 'waiting' ? 'secondary' : 'destructive'}
                        >
                          {session.status === 'completed' ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Hoàn thành
                            </>
                          ) : session.status === 'waiting' ? (
                            <>
                              <Clock className="h-3 w-3 mr-1" />
                              Đang chờ
                            </>
                          ) : session.status === 'expired' ? (
                            <>
                              <XCircle className="h-3 w-3 mr-1" />
                              Hết hạn
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3 mr-1" />
                              Thất bại
                            </>
                          )}
                        </Badge>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(session.phoneNumber)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
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
  );
}