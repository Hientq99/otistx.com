import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FixedHeader } from "@/components/fixed-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Package, 
  Play, 
  Gift, 
  CheckCircle, 
  User, 
  History,
  Search,
  Filter,
  Calendar,
  Copy,
  Download,
  ShoppingBag,
  Eye,
  X,
  Star,
  CreditCard,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

interface ShopeeCookie {
  id: string;
  cookieType: string;
  cookiePreview: string;
  shopeeRegion: string;
  createdAt: string;
}

interface VoucherSavingResult {
  cookieId: string;
  cookiePreview: string;
  operationId?: number;
  status: 'success' | 'failed';
  message: string;
  totalVouchersFound: number;
  successfulSaves: number;
  failedSaves: number;
  targetVouchersSaved?: number;
  charged: boolean;
  amountCharged: number;
}

interface VoucherSavingOperation {
  id: number;
  sessionId: string;
  cookieId: string;
  cookiePreview: string;
  fullCookieValue?: string; // Full cookie value from joined table
  status: string;
  totalVouchersFound: number;
  successfulSaves: number;
  failedSaves: number;
  cost: number;
  message: string;
  createdAt: string;
  completedAt: string;
}

function VoucherSaving() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [bulkCookies, setBulkCookies] = useState("");
  const [selectedCookieIds, setSelectedCookieIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentResults, setCurrentResults] = useState<VoucherSavingResult[]>([]);
  
  // localStorage key for persisting current results
  const CURRENT_RESULTS_KEY = 'voucher-saving-current-results';
  
  // Load current results from localStorage on component mount
  useEffect(() => {
    try {
      const savedResults = localStorage.getItem(CURRENT_RESULTS_KEY);
      if (savedResults) {
        const parsedResults = JSON.parse(savedResults);
        // Only restore if saved within last 24 hours
        const savedTimestamp = parsedResults.timestamp || 0;
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        if (now - savedTimestamp < maxAge && Array.isArray(parsedResults.results)) {
          setCurrentResults(parsedResults.results);
        } else {
          // Remove expired data
          localStorage.removeItem(CURRENT_RESULTS_KEY);
        }
      }
    } catch (error) {
      console.warn('Failed to load saved voucher results:', error);
      localStorage.removeItem(CURRENT_RESULTS_KEY);
    }
  }, [CURRENT_RESULTS_KEY]);
  
  // Save current results to localStorage whenever they change
  useEffect(() => {
    if (currentResults.length > 0) {
      try {
        const dataToSave = {
          results: currentResults,
          timestamp: Date.now()
        };
        localStorage.setItem(CURRENT_RESULTS_KEY, JSON.stringify(dataToSave));
      } catch (error) {
        console.warn('Failed to save voucher results:', error);
      }
    }
  }, [currentResults, CURRENT_RESULTS_KEY]);
  
  // Function to clear current results
  const clearCurrentResults = () => {
    setCurrentResults([]);
    localStorage.removeItem(CURRENT_RESULTS_KEY);
  };
  
  // Filters for history
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all", "success", "failed"
  const [searchText, setSearchText] = useState(""); // Search text for filtering
  
  // Full cookie dialog state
  const [selectedCookie, setSelectedCookie] = useState<string | null>(null);
  const [showMasked, setShowMasked] = useState(true);

  // Get service pricing for voucher saving
  const { data: pricingData } = useQuery<{ price: number }>({
    queryKey: ['/api/voucher-saving-price'],
  });
  
  const voucherSavingPrice = pricingData?.price || 3000;

  // Get user's cookies
  const { data: userCookies = [], isLoading: loadingCookies } = useQuery<ShopeeCookie[]>({
    queryKey: ['/api/shopee-cookies'],
  });

  // Get voucher saving history
  const { data: voucherHistory = [], isLoading: loadingHistory } = useQuery<VoucherSavingOperation[]>({
    queryKey: ['/api/voucher-saving'],
  });

  // Voucher saving mutation
  const voucherSavingMutation = useMutation({
    mutationFn: async (cookies: any[]) => {
      const response = await apiRequest({
        url: '/api/voucher-saving',
        method: 'POST',
        body: { cookies },
      });
      
      return response;
    },
    onSuccess: (data) => {
      const results = data.results || [];
      setCurrentResults(results); // This will auto-save to localStorage via useEffect
      queryClient.invalidateQueries({ queryKey: ['/api/voucher-saving'] });
      
      const successCount = data.successfulOperations || 0;
      const totalCharged = data.totalAmountCharged || 0;
      
      toast({
        title: "Hoàn thành lưu voucher",
        description: `${successCount} cookie thành công${totalCharged > 0 ? ` - Tổng trừ: ${totalCharged.toLocaleString()}₫` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể thực hiện lưu voucher",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsProcessing(false);
    }
  });

  const handleVoucherSaving = async () => {
    if (isProcessing) return;

    let cookiesToProcess: any[] = [];

    // Get cookies from bulk input
    if (bulkCookies.trim()) {
      const bulkLines = bulkCookies.trim().split('\n').filter(line => line.trim());
      cookiesToProcess = bulkLines.map(line => ({ cookie: line.trim() }));
    }

    // Add selected cookies from user's saved cookies
    if (selectedCookieIds.length > 0) {
      const selectedCookies = selectedCookieIds.map(id => ({ id }));
      cookiesToProcess = [...cookiesToProcess, ...selectedCookies];
    }

    if (cookiesToProcess.length === 0) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập ít nhất một cookie hoặc chọn từ danh sách",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    clearCurrentResults(); // Clear both state and localStorage
    
    toast({
      title: "Bắt đầu lưu voucher",
      description: `Đang xử lý ${cookiesToProcess.length} cookie...`,
    });

    voucherSavingMutation.mutate(cookiesToProcess);
  };

  // Filter history by date, status and search text
  const filteredHistory = useMemo(() => {
    return voucherHistory.filter(operation => {
      // Date filter
      if (startDate) {
        const operationDate = new Date(operation.createdAt).toISOString().split('T')[0];
        if (operationDate < startDate) return false;
      }
      if (endDate) {
        const operationDate = new Date(operation.createdAt).toISOString().split('T')[0];
        if (operationDate > endDate) return false;
      }
      
      // Status filter
      if (statusFilter !== "all") {
        if (statusFilter === "success" && operation.status !== "success") return false;
        if (statusFilter === "failed" && operation.status === "success") return false;
      }
      
      // Search filter - search in cookie (preview and full), message, and session ID
      if (searchText.trim()) {
        const searchLower = searchText.toLowerCase();
        const matchesCookiePreview = operation.cookiePreview?.toLowerCase().includes(searchLower);
        const matchesFullCookie = operation.fullCookieValue?.toLowerCase().includes(searchLower);
        const matchesMessage = operation.message?.toLowerCase().includes(searchLower);
        const matchesSessionId = operation.sessionId?.toLowerCase().includes(searchLower);
        
        if (!matchesCookiePreview && !matchesFullCookie && !matchesMessage && !matchesSessionId) {
          return false;
        }
      }
      
      return true;
    });
  }, [voucherHistory, startDate, endDate, statusFilter, searchText]);

  // Format time to Vietnamese time
  const formatVietnameseTime = (dateString: string) => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      return date.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      return dateString;
    }
  };

  // Dialog component for full cookie display
  const FullCookieDialog = ({ cookieValue, isOpen, onClose }: {
    cookieValue: string;
    isOpen: boolean;
    onClose: () => void;
  }) => {
    const [copied, setCopied] = useState(false);
    
    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(cookieValue);
        setCopied(true);
        toast({ title: "Đã sao chép cookie!", duration: 2000 });
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        toast({ 
          title: "Lỗi sao chép", 
          description: "Không thể sao chép cookie",
          variant: "destructive"
        });
      }
    };
    
    const maskCookie = (value: string) => {
      if (value.length <= 20) return value;
      return value.substring(0, 10) + '●'.repeat(Math.min(value.length - 20, 30)) + value.substring(value.length - 10);
    };
    
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh]" data-testid="dialog-full-cookie">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Xem cookie đầy đủ
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMasked(!showMasked)}
                data-testid="button-toggle-mask"
              >
                {showMasked ? "Hiện cookie" : "Ẩn cookie"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={copied}
                data-testid="button-copy-cookie"
              >
                <Copy className="h-4 w-4 mr-2" />
                {copied ? "Đã sao chép!" : "Sao chép"}
              </Button>
            </div>
            <ScrollArea className="h-[400px] w-full border rounded-md p-4">
              <pre className="font-mono text-xs break-all whitespace-pre-wrap" data-testid="text-cookie-value">
                {showMasked ? maskCookie(cookieValue) : cookieValue}
              </pre>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <FullCookieDialog 
        cookieValue={selectedCookie || ""} 
        isOpen={!!selectedCookie} 
        onClose={() => setSelectedCookie(null)} 
      />
      <FixedHeader />
      
      <div className="pt-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Enhanced Page Header */}
        <div className="mb-8">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3">
              <div className="p-3 bg-gradient-to-br from-orange-100 to-red-100 dark:from-orange-900/20 dark:to-red-900/20 rounded-full shadow-md">
                <Gift className="h-8 w-8 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                  Shopee Voucher Saving
                </h1>
                <p className="text-gray-600 dark:text-gray-300 mt-1">
                  Lưu voucher miễn phí vận chuyển với 10 luồng xử lý song song
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-4">
              <Badge variant="secondary" className="bg-gradient-to-r from-orange-100 to-red-100 text-orange-800 dark:from-orange-900/20 dark:to-red-900/20 dark:text-orange-200 border-0">
                <CreditCard className="h-4 w-4 mr-1" />
                {voucherSavingPrice.toLocaleString()}₫ / lần lưu
              </Badge>
              <Badge variant="outline" className="border-green-200 text-green-700 dark:border-green-800 dark:text-green-300">
                <RefreshCw className="h-4 w-4 mr-1" />
                10 luồng song song
              </Badge>
            </div>
          </div>
        </div>
        <Tabs defaultValue="voucher-saving" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="voucher-saving" data-testid="tab-voucher-saving">
              <Gift className="h-4 w-4 mr-2" />
              Lưu Voucher
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              <History className="h-4 w-4 mr-2" />
              Lịch Sử
            </TabsTrigger>
          </TabsList>

          <TabsContent value="voucher-saving" className="space-y-6">
            {/* Pricing Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Thông tin dịch vụ
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{voucherSavingPrice.toLocaleString()}₫</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Giá mỗi lần thành công</div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">Free Ship</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Voucher miễn phí vận chuyển</div>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">Tự động</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Lưu hàng loạt nhiều cookie</div>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-800 dark:text-yellow-200">
                      <strong>Điều kiện thành công:</strong> Phải lưu được ít nhất 1 voucher có mô tả "giảm tối đa 300k từ 0k" mới tính thành công và bị trừ tiền.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Voucher Saving Form */}
            <Card>
              <CardHeader>
                <CardTitle>Nhập Cookies để lưu voucher</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Bulk cookies input */}
                <div className="space-y-2">
                  <Label htmlFor="bulk-cookies">Nhập cookies (mỗi cookie một dòng)</Label>
                  <Textarea
                    id="bulk-cookies"
                    placeholder="Nhập cookies, mỗi cookie một dòng..."
                    value={bulkCookies}
                    onChange={(e) => setBulkCookies(e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                    data-testid="input-bulk-cookies"
                  />
                  <div className="text-sm text-gray-500">
                    {bulkCookies.trim().split('\n').filter(line => line.trim()).length} cookies được nhập
                  </div>
                </div>

                {/* Saved cookies selection */}
                {userCookies.length > 0 && (
                  <div className="space-y-2">
                    <Label>Hoặc chọn từ cookies đã lưu</Label>
                    <ScrollArea className="h-40 w-full border rounded-md p-3">
                      <div className="space-y-2">
                        {userCookies.map((cookie) => (
                          <div key={cookie.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`cookie-${cookie.id}`}
                              checked={selectedCookieIds.includes(cookie.id)}
                              onCheckedChange={(checked: boolean) => {
                                if (checked) {
                                  setSelectedCookieIds([...selectedCookieIds, cookie.id]);
                                } else {
                                  setSelectedCookieIds(selectedCookieIds.filter(id => id !== cookie.id));
                                }
                              }}
                              data-testid={`checkbox-cookie-${cookie.id}`}
                            />
                            <label htmlFor={`cookie-${cookie.id}`} className="text-sm font-mono">
                              {cookie.cookiePreview.substring(0, 30)}...
                              <Badge variant="outline" className="ml-2">{cookie.cookieType}</Badge>
                            </label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <div className="text-sm text-gray-500">
                      {selectedCookieIds.length} cookies được chọn
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3">
                  <Button 
                    onClick={handleVoucherSaving}
                    disabled={isProcessing}
                    className="flex-1"
                    data-testid="button-start-voucher-saving"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Bắt đầu lưu voucher
                      </>
                    )}
                  </Button>
                  
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setBulkCookies("");
                      setSelectedCookieIds([]);
                      clearCurrentResults();
                    }}
                    disabled={isProcessing}
                    data-testid="button-clear-form"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Xóa
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Current Results */}
            {currentResults.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Kết quả xử lý</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearCurrentResults}
                      data-testid="button-clear-current-results"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Xóa kết quả
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {currentResults.map((result, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="font-mono text-xs text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                              Cookie: {result.cookiePreview?.substring(0, 20)}...
                            </div>
                            {result.cookiePreview && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    const fullCookie = await apiRequest({
                                      url: `/api/shopee-cookies/${result.cookieId}`,
                                      method: "GET"
                                    });
                                    setSelectedCookie(fullCookie.cookieValue);
                                  } catch (error) {
                                    setSelectedCookie(result.cookiePreview);
                                  }
                                  setShowMasked(true);
                                }}
                                className="h-6 w-6 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/20"
                                data-testid={`button-view-result-cookie-${index}`}
                                title="Xem cookie đầy đủ"
                              >
                                <Eye className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                              </Button>
                            )}
                          </div>
                          <Badge variant={result.status === 'success' ? 'default' : 'destructive'}>
                            {result.status === 'success' ? 'Thành công' : 'Thất bại'}
                          </Badge>
                        </div>
                        
                        <div className="text-sm space-y-1">
                          <p><strong>Thông báo:</strong> {result.message}</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                            <div>Tìm thấy: {result.totalVouchersFound} voucher</div>
                            <div className="text-green-600">Lưu thành công: {result.successfulSaves}</div>
                            <div className="text-red-600">Thất bại: {result.failedSaves}</div>
                            {result.charged && (
                              <div className="text-blue-600 font-semibold">
                                Đã trừ: {result.amountCharged.toLocaleString()}₫
                              </div>
                            )}
                          </div>
                          {result.targetVouchersSaved !== undefined && (
                            <p className="text-sm text-green-600">
                              <strong>Voucher "300k từ 0k" đã lưu:</strong> {result.targetVouchersSaved}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            {/* History Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Bộ lọc
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Search Input */}
                  <div className="space-y-2">
                    <Label htmlFor="search-text">Tìm kiếm</Label>
                    <Input
                      id="search-text"
                      type="text"
                      placeholder="Tìm kiếm cookie, thông báo, hoặc session ID..."
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      data-testid="input-search-text"
                      className="w-full"
                    />
                  </div>
                  
                  {/* Date and Status Filters */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="start-date">Từ ngày</Label>
                      <Input
                        id="start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        data-testid="input-start-date"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="end-date">Đến ngày</Label>
                      <Input
                        id="end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        data-testid="input-end-date"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="status-filter">Trạng thái</Label>
                      <select
                        id="status-filter"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full p-2 border rounded-md bg-background"
                        data-testid="select-status-filter"
                      >
                        <option value="all">Tất cả</option>
                        <option value="success">Thành công</option>
                        <option value="failed">Thất bại</option>
                      </select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>&nbsp;</Label>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setStartDate("");
                          setEndDate("");
                          setStatusFilter("all");
                          setSearchText("");
                        }}
                        className="w-full"
                        data-testid="button-clear-filters"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Xóa bộ lọc
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* History Table */}
            <Card>
              <CardHeader>
                <CardTitle>Lịch sử lưu voucher ({filteredHistory.length} kết quả)</CardTitle>
              </CardHeader>
              <CardContent>
                {filteredHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Không có lịch sử lưu voucher nào</p>
                  </div>
                ) : (
                  <TooltipProvider>
                    <ScrollArea className="h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Thời gian</TableHead>
                            <TableHead>Cookie (Full)</TableHead>
                            <TableHead>Trạng thái</TableHead>
                            <TableHead>Voucher</TableHead>
                            <TableHead>Chi phí</TableHead>
                            <TableHead>Thông báo (Full)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredHistory.map((operation) => (
                            <TableRow key={operation.id} data-testid={`row-operation-${operation.id}`}>
                              <TableCell className="text-sm">
                                {formatVietnameseTime(operation.createdAt)}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                <div className="flex items-center gap-2">
                                  <div className="max-w-[200px] truncate text-gray-600 dark:text-gray-300">
                                    {operation.cookiePreview || operation.cookieId || 'Cookie không có'}
                                  </div>
                                  {(operation.fullCookieValue || operation.cookiePreview) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedCookie(operation.fullCookieValue || operation.cookiePreview);
                                        setShowMasked(true); // Reset to masked when opening new cookie
                                      }}
                                      className="h-6 w-6 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/20"
                                      data-testid={`button-view-cookie-${operation.id}`}
                                      title="Xem cookie đầy đủ"
                                    >
                                      <Eye className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={operation.status === 'success' ? 'default' : 'destructive'}>
                                  {operation.status === 'success' ? 'Thành công' : 'Thất bại'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                <div>Tìm thấy: {operation.totalVouchersFound}</div>
                                <div className="text-green-600">Lưu thành công: {operation.successfulSaves}</div>
                                {operation.failedSaves > 0 && (
                                  <div className="text-red-600">Thất bại: {operation.failedSaves}</div>
                                )}
                              </TableCell>
                              <TableCell>
                                {operation.status === 'success' ? (
                                  <span className="text-red-600 font-semibold">
                                    -{operation.cost.toLocaleString()}₫
                                  </span>
                                ) : (
                                  <span className="text-gray-400">Không trừ tiền</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="max-w-[250px] truncate cursor-help">
                                      {operation.message}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[400px] break-words">
                                    <p className="text-sm">{operation.message}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TooltipProvider>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default VoucherSaving;