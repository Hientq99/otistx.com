import { useState, useEffect } from "react";
import { FixedHeader } from "@/components/fixed-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  QrCode, 
  Clock,
  CheckCircle,
  AlertCircle,
  Copy,
  RefreshCw,
  Banknote,
  History,
  ExternalLink,
  Search,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TopUpRequest {
  id: string;
  userId: number;
  amount: number;
  status: 'pending' | 'completed' | 'cancelled' | 'expired';
  qrUrl: string;
  createdAt: string;
  expiresAt: string;
  description?: string;
  balanceBefore?: string;
  balanceAfter?: string;
  adminNote?: string;
}

export default function TopUpPage() {
  const [amount, setAmount] = useState<string>("");
  const [currentRequest, setCurrentRequest] = useState<TopUpRequest | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const { toast } = useToast();

  // Auto-refresh pending requests every 5 seconds
  const { data: pendingRequests = [], isLoading: isLoadingRequests } = useQuery<TopUpRequest[]>({
    queryKey: ['/api/topup/pending'],
    refetchInterval: 30000, // Reduced from 5s to 30s for EXTREME EGRESS REDUCTION
    enabled: !!currentRequest
  });

  // Fetch top-up history
  const { data: topupHistory = [], isLoading: isLoadingHistory } = useQuery<TopUpRequest[]>({
    queryKey: ['/api/topup/history'],
  });

  // Create QR code mutation
  const generateQRMutation = useMutation({
    mutationFn: async (data: { amount: number }) => {
      return await apiRequest({
        url: "/api/topup/generate-qr",
        method: "POST",
        body: data
      });
    },
    onSuccess: (data) => {
      setCurrentRequest(data);
      setAmount("");
      queryClient.invalidateQueries({ queryKey: ['/api/topup/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/topup/history'] });
      toast({
        title: "QR Code đã được tạo",
        description: "Vui lòng quét mã QR để thực hiện chuyển khoản",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi tạo QR Code",
        description: error.message || "Không thể tạo mã QR. Vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  // Check for completed requests and update state
  useEffect(() => {
    if (pendingRequests && pendingRequests.length > 0) {
      const completedRequest = pendingRequests.find((req: TopUpRequest) => req.status === 'completed');
      if (completedRequest && currentRequest) {
        setCurrentRequest(null);
        setTimeLeft(0);
        queryClient.invalidateQueries({ queryKey: ['/api/user/balance'] });
        queryClient.invalidateQueries({ queryKey: ['/api/topup/history'] });
        toast({
          title: "Nạp tiền thành công!",
          description: `Đã nạp thành công ${completedRequest.amount.toLocaleString('vi-VN')} VND`,
        });
        
        // Auto-reload page after 2 seconds
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    }
  }, [pendingRequests, currentRequest, toast]);

  // Countdown timer for current request
  useEffect(() => {
    if (currentRequest) {
      const expiresAt = new Date(currentRequest.expiresAt).getTime();
      
      const timer = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
        setTimeLeft(remaining);
        
        if (remaining === 0) {
          setCurrentRequest(null);
          clearInterval(timer);
          toast({
            title: "QR Code đã hết hạn",
            description: "Vui lòng tạo mã QR mới để tiếp tục",
            variant: "destructive",
          });
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [currentRequest, toast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseInt(amount);
    
    if (!numAmount || numAmount < 20000) {
      toast({
        title: "Số tiền không hợp lệ",
        description: "Số tiền nạp tối thiểu là 20,000 VND",
        variant: "destructive",
      });
      return;
    }

    generateQRMutation.mutate({ amount: numAmount });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Đã sao chép",
      description: `${label} đã sao chép vào clipboard`,
    });
  };

  // Filter and paginate history
  const filteredHistory = topupHistory.filter(item => 
    item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.amount.toString().includes(searchTerm) ||
    (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.adminNote && item.adminNote.toLowerCase().includes(searchTerm.toLowerCase()))
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedHistory = filteredHistory.slice(startIndex, startIndex + itemsPerPage);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <FixedHeader />
      
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Nạp Tiền Vào Tài Khoản
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Nạp tiền qua chuyển khoản ngân hàng - Tự động xác nhận qua QR Code
          </p>
        </div>

        <Tabs defaultValue="generate" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generate" className="flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              Tạo QR Code
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Lịch sử nạp tiền
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-8">
              {/* QR Generation Form */}
              <Card className="backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 border-gray-200/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-blue-600" />
                    Tạo Mã QR Chuyển Khoản
                  </CardTitle>
                  <CardDescription>
                    Nhập số tiền muốn nạp và tạo mã QR để chuyển khoản
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="amount">Số tiền (VND)</Label>
                      <Input
                        id="amount"
                        type="number"
                        placeholder="Nhập số tiền (tối thiểu 20,000)"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        min="20000"
                        step="1000"
                        disabled={!!currentRequest || generateQRMutation.isPending}
                      />
                    </div>
                    
                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={!!currentRequest || generateQRMutation.isPending}
                    >
                      {generateQRMutation.isPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Đang tạo...
                        </>
                      ) : (
                        <>
                          <QrCode className="h-4 w-4 mr-2" />
                          Tạo Mã QR
                        </>
                      )}
                    </Button>
                  </form>

                  {/* Quick amount buttons */}
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[50000, 100000, 200000].map((quickAmount) => (
                      <Button
                        key={quickAmount}
                        variant="outline"
                        size="sm"
                        onClick={() => setAmount(quickAmount.toString())}
                        disabled={!!currentRequest || generateQRMutation.isPending}
                      >
                        {quickAmount.toLocaleString('vi-VN')}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* QR Code Display */}
              {currentRequest && (
                <Card className="backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 border-gray-200/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <QrCode className="h-5 w-5 text-green-600" />
                      Mã QR Chuyển Khoản
                    </CardTitle>
                    <CardDescription>
                      Quét mã QR bằng app ngân hàng để chuyển khoản
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* QR Code Image */}
                    <div className="flex justify-center">
                      <div className="p-4 bg-white rounded-lg shadow-sm">
                        <img 
                          src={currentRequest.qrUrl} 
                          alt="QR Code" 
                          className="w-72 h-72"
                        />
                      </div>
                    </div>

                    {/* Transaction Info */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-2">
                      <div className="flex justify-between">
                        <span>Số tiền:</span>
                        <span className="font-bold text-green-600">
                          {currentRequest.amount.toLocaleString('vi-VN')} VND
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Ngân hàng:</span>
                        <span className="font-medium">MB Bank</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Số tài khoản:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">6662691999</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard("6662691999", "Số tài khoản")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span>Chủ tài khoản:</span>
                        <span className="font-medium">CU DUC HIEN</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Nội dung CK:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{currentRequest.description}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(currentRequest.description || currentRequest.id, "Nội dung chuyển khoản")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Thời gian còn lại:</span>
                        <div className="flex items-center gap-1 text-orange-600">
                          <Clock className="h-4 w-4" />
                          <span className="font-mono">{formatTime(timeLeft)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Instructions */}
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                        Hướng dẫn chuyển khoản:
                      </h4>
                      <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
                        <li>Mở app ngân hàng và chọn chức năng quét QR</li>
                        <li>Quét mã QR trên màn hình này</li>
                        <li>Kiểm tra thông tin và xác nhận chuyển khoản</li>
                        <li>Số dư sẽ được cập nhật tự động sau 1-2 phút</li>
                      </ol>
                    </div>

                    <Button
                      variant="outline"
                      onClick={() => setCurrentRequest(null)}
                      className="w-full"
                    >
                      Tạo Mã QR Mới
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Bank Transfer Instructions */}
            <Card className="backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 border-gray-200/50">
              <CardHeader>
                <CardTitle>Hướng Dẫn Nạp Tiền</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-3">Thông tin chuyển khoản:</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Ngân hàng:</span>
                        <span className="font-medium">MB Bank</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Số tài khoản:</span>
                        <span className="font-mono">6662691999</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Chủ tài khoản:</span>
                        <span className="font-medium">CU DUC HIEN</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Lưu ý quan trọng:</h4>
                    <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
                      <li>• Số tiền nạp tối thiểu: 20,000 VND</li>
                      <li>• QR Code có hiệu lực trong 30 phút</li>
                      <li>• Sử dụng đúng nội dung chuyển khoản</li>
                      <li>• Số dư cập nhật tự động qua webhook</li>
                      <li>• Liên hệ support nếu có vấn đề</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card className="backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 border-gray-200/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-green-600" />
                  Lịch Sử Nạp Tiền
                </CardTitle>
                <CardDescription>
                  Theo dõi tất cả các giao dịch nạp tiền của bạn
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Search and Filter Controls */}
                <div className="flex gap-4 mb-6">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Tìm kiếm theo ID, trạng thái, số tiền, mô tả..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(parseInt(value))}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10/trang</SelectItem>
                      <SelectItem value="20">20/trang</SelectItem>
                      <SelectItem value="50">50/trang</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {isLoadingHistory ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin" />
                    <span className="ml-2">Đang tải lịch sử...</span>
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <QrCode className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{searchTerm ? "Không tìm thấy kết quả phù hợp" : "Chưa có giao dịch nạp tiền nào"}</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nội dung chuyển khoản</TableHead>
                            <TableHead>Số Tiền</TableHead>
                            <TableHead>Số dư trước</TableHead>
                            <TableHead>Số dư sau</TableHead>
                            <TableHead>Trạng Thái</TableHead>
                            <TableHead>Ghi chú</TableHead>
                            <TableHead>Thời Gian</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedHistory.map((request) => (
                            <TableRow key={request.id}>
                              <TableCell className="font-mono text-sm">
                                {request.adminNote ? request.adminNote : 
                                 request.id.startsWith('ADM') ? request.description : 
                                 `Nạp tiền QR Code - Mã: ${request.description}`}
                              </TableCell>
                              <TableCell className="font-medium">
                                {request.amount.toLocaleString('vi-VN')} VND
                              </TableCell>
                              <TableCell className="text-sm text-gray-600">
                                {request.balanceBefore ? `${parseInt(request.balanceBefore).toLocaleString('vi-VN')} VND` : '-'}
                              </TableCell>
                              <TableCell className="text-sm text-gray-600">
                                {request.balanceAfter ? `${parseInt(request.balanceAfter).toLocaleString('vi-VN')} VND` : '-'}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    request.status === 'completed'
                                      ? 'default'
                                      : request.status === 'pending'
                                      ? 'secondary'
                                      : 'destructive'
                                  }
                                  className={
                                    request.status === 'completed'
                                      ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                      : request.status === 'pending'
                                      ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                                      : 'bg-red-100 text-red-800 hover:bg-red-200'
                                  }
                                >
                                  {request.status === 'completed' && <CheckCircle className="h-3 w-3 mr-1" />}
                                  {request.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                                  {(request.status === 'cancelled' || request.status === 'expired') && (
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                  )}
                                  {request.status === 'completed' && 'Thành công'}
                                  {request.status === 'pending' && 'Chờ thanh toán'}
                                  {request.status === 'cancelled' && 'Đã hủy'}
                                  {request.status === 'expired' && 'Hết hạn'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-gray-600">
                                {request.adminNote || '-'}
                              </TableCell>
                              <TableCell className="text-sm text-gray-600">
                                {new Date(request.createdAt).toLocaleString('vi-VN')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-6">
                        <div className="text-sm text-gray-500">
                          Hiển thị {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredHistory.length)} của {filteredHistory.length} kết quả
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Trước
                          </Button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                              .filter(page => 
                                page === 1 || 
                                page === totalPages || 
                                Math.abs(page - currentPage) <= 1
                              )
                              .map((page, index, arr) => (
                                <div key={page} className="flex items-center">
                                  {index > 0 && arr[index - 1] !== page - 1 && (
                                    <span className="px-2 text-gray-400">...</span>
                                  )}
                                  <Button
                                    variant={currentPage === page ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setCurrentPage(page)}
                                    className="w-8 h-8 p-0"
                                  >
                                    {page}
                                  </Button>
                                </div>
                              ))}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                          >
                            Tiếp
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}