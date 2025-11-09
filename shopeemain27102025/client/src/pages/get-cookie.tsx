import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, QrCode, Download, Search, ChevronLeft, ChevronRight, Eye, Copy, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FixedHeader } from "@/components/fixed-header";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface CookieExtractionResult {
  id: number;
  method: string;
  input: string;
  spcSt?: string;
  spcF?: string;
  status: 'success' | 'failed';
  message: string;
  cost: number;
  createdAt: string;
}

interface CookieExtractionResponse {
  success: boolean;
  results: Array<{
    input: string;
    spcSt?: string;
    spcF?: string;
    status: 'success' | 'failed';
    message: string;
    cost: number;
  }>;
  totalCost: number;
  successCount: number;
  failedCount: number;
}

export default function GetCookiePage() {
  const [activeTab, setActiveTab] = useState("spcf-method");
  const [spcfInput, setSpcfInput] = useState("");
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
  const [qrCodeStatus, setQrCodeStatus] = useState<'idle' | 'waiting' | 'success' | 'expired'>('idle');
  const [qrResults, setQrResults] = useState<{ spcSt?: string; spcF?: string } | null>(null);
  const [results, setResults] = useState<CookieExtractionResult[]>([]);
  const [selectedResults, setSelectedResults] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  const [dateFilter, setDateFilter] = useState('all');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });

  const { user } = useAuth();
  const { toast: showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: userBalance } = useQuery({
    queryKey: ["/api/user/balance"],
    enabled: !!user,
  });

  const { data: cookieHistory } = useQuery<CookieExtractionResult[]>({
    queryKey: ["/api/cookie-extractions"],
    enabled: !!user,
  });

  // SPC_F to SPC_ST extraction mutation
  const extractFromSpcfMutation = useMutation({
    mutationFn: async (data: { entries: string[] }) => {
      const token = localStorage.getItem("token");
      
      if (!token) {
        throw new Error("Vui lòng đăng nhập để sử dụng dịch vụ");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      try {
        const response = await fetch("/api/cookie-extractions/spcf", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(data),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          
          if (response.status === 401) {
            throw new Error("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại");
          } else if (response.status === 402) {
            throw new Error("Số dư không đủ để thực hiện thao tác này");
          } else if (response.status === 429) {
            throw new Error("Bạn đang thực hiện quá nhanh, vui lòng chờ một chút");
          } else if (errorData?.message) {
            throw new Error(errorData.message);
          } else {
            throw new Error(`Lỗi server (${response.status}): Không thể trích xuất cookie`);
          }
        }

        const result = await response.json();
        
        if (!result || typeof result !== 'object') {
          throw new Error("Dữ liệu trả về không hợp lệ");
        }

        return result as CookieExtractionResponse;
      } catch (error: any) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
          throw new Error("Quá thời gian chờ (60s), vui lòng thử lại với ít mục hơn");
        }
        
        throw error;
      }
    },
    onSuccess: (data) => {
      if (!data.results || !Array.isArray(data.results)) {
        showToast({
          title: "Cảnh báo",
          description: "Dữ liệu kết quả không hợp lệ",
          variant: "destructive",
        });
        return;
      }

      setResults(data.results.map((result, index) => ({
        id: Date.now() + index,
        method: 'SPC_F',
        input: result.input || 'N/A',
        spcSt: result.spcSt,
        spcF: result.spcF,
        status: result.status || 'failed',
        message: result.message || 'Không có thông tin',
        cost: result.cost || 0,
        createdAt: new Date().toISOString()
      })));
      
      const successRate = data.results.length > 0 
        ? Math.round((data.successCount / data.results.length) * 100) 
        : 0;
      
      showToast({
        title: "Hoàn thành",
        description: `Đã xử lý ${data.results.length} mục. Thành công: ${data.successCount} (${successRate}%), Thất bại: ${data.failedCount}. Chi phí: ${data.totalCost.toLocaleString('vi-VN')} ₫`,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cookie-extractions"] });
    },
    onError: (error: any) => {
      showToast({
        title: "Lỗi trích xuất cookie",
        description: error.message || "Đã xảy ra lỗi không xác định, vui lòng thử lại sau",
        variant: "destructive",
      });
    },
  });

  // QR Code generation mutation
  const generateQrMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/cookie-extractions/qr/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error("Failed to generate QR code");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setQrCodeImage(data.qrCodeImage);
      setQrCodeStatus('waiting');
      startQrPolling(data.qrCodeId);
    },
    onError: (error: any) => {
      showToast({
        title: "Lỗi",
        description: error.message || "Không thể tạo mã QR",
        variant: "destructive",
      });
    },
  });

  const startQrPolling = async (qrCodeId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const token = localStorage.getItem("token");
        const encodedQrCodeId = encodeURIComponent(qrCodeId);
        const response = await fetch(`/api/cookie-extractions/qr/status?qrCodeId=${encodedQrCodeId}`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });

        if (!response.ok) {
          clearInterval(pollInterval);
          setQrCodeStatus('expired');
          return;
        }

        const data = await response.json();
        
        if (data.status === 'success') {
          clearInterval(pollInterval);
          setQrCodeStatus('success');
          setQrResults({
            spcSt: data.spcSt,
            spcF: data.spcF
          });
          showToast({
            title: "Thành công",
            description: "Đã trích xuất cookie thành công từ QR code",
          });
          queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
          queryClient.invalidateQueries({ queryKey: ["/api/cookie-extractions"] });
        } else if (data.status === 'expired') {
          clearInterval(pollInterval);
          setQrCodeStatus('expired');
          showToast({
            title: "Hết hạn",
            description: "Mã QR đã hết hạn, vui lòng tạo mã mới",
            variant: "destructive",
          });
        }
      } catch (error) {
        clearInterval(pollInterval);
        setQrCodeStatus('expired');
      }
    }, 3000);

    // Auto-expire after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (qrCodeStatus === 'waiting') {
        setQrCodeStatus('expired');
      }
    }, 300000);
  };

  const handleSpcfExtraction = () => {
    if (!spcfInput.trim()) {
      showToast({
        title: "Lỗi",
        description: "Vui lòng nhập dữ liệu",
        variant: "destructive",
      });
      return;
    }

    const entries = spcfInput.trim().split('\n').filter(line => line.trim());
    
    // Validate number of entries
    if (entries.length === 0) {
      showToast({
        title: "Lỗi",
        description: "Không có dữ liệu hợp lệ để xử lý",
        variant: "destructive",
      });
      return;
    }
    
    if (entries.length > 50) {
      showToast({
        title: "Lỗi", 
        description: `Số lượng vượt quá giới hạn (${entries.length}/50). Vui lòng giảm số lượng mục.`,
        variant: "destructive",
      });
      return;
    }

    // Validate format of each entry
    const invalidEntries: string[] = [];
    entries.forEach((entry, index) => {
      const parts = entry.split('|');
      
      // Must have at least SPC_F|username|password (3 parts, proxy is optional)
      if (parts.length < 3) {
        invalidEntries.push(`Dòng ${index + 1}: Thiếu thông tin (cần: SPC_F|username|password|proxy)`);
        return;
      }
      
      // Check SPC_F format
      const spcfPart = parts[0].trim();
      if (!spcfPart.startsWith('SPC_F=')) {
        invalidEntries.push(`Dòng ${index + 1}: SPC_F không đúng định dạng (phải bắt đầu bằng 'SPC_F=')`);
        return;
      }
      
      // Check SPC_F has value
      const spcfValue = spcfPart.substring(6).trim();
      if (!spcfValue || spcfValue.length < 10) {
        invalidEntries.push(`Dòng ${index + 1}: SPC_F quá ngắn hoặc không hợp lệ`);
        return;
      }
      
      // Check username
      if (!parts[1] || !parts[1].trim()) {
        invalidEntries.push(`Dòng ${index + 1}: Thiếu username`);
        return;
      }
      
      // Check password
      if (!parts[2] || !parts[2].trim()) {
        invalidEntries.push(`Dòng ${index + 1}: Thiếu password`);
        return;
      }
    });

    // Show validation errors
    if (invalidEntries.length > 0) {
      const errorMessage = invalidEntries.slice(0, 5).join('\n') + 
        (invalidEntries.length > 5 ? `\n... và ${invalidEntries.length - 5} lỗi khác` : '');
      
      showToast({
        title: `Phát hiện ${invalidEntries.length} lỗi định dạng`,
        description: errorMessage,
        variant: "destructive",
      });
      return;
    }

    // All validations passed, proceed with extraction
    extractFromSpcfMutation.mutate({ entries });
  };

  const handleCopyResult = (result: CookieExtractionResult) => {
    let text = '';
    if (result.spcSt && result.spcF) {
      text = `${result.spcSt}\n${result.spcF}`;
    } else if (result.spcSt) {
      text = result.spcSt;
    } else if (result.spcF) {
      text = result.spcF;
    } else {
      text = 'Không có cookie';
    }
    
    navigator.clipboard.writeText(text);
    showToast({
      title: "Đã sao chép",
      description: "Cookie đã được sao chép vào clipboard",
    });
  };

  const handleCopySingleCookie = (cookieText: string, cookieName: string) => {
    navigator.clipboard.writeText(cookieText);
    showToast({
      title: "Đã sao chép",
      description: `${cookieName} đã được sao chép vào clipboard`,
    });
  };

  const handleCopySelectedCookies = () => {
    const selectedItems = results.filter(r => selectedResults.includes(r.id) && r.status === 'success');
    
    if (selectedItems.length === 0) {
      showToast({
        title: "Lỗi",
        description: "Vui lòng chọn ít nhất một cookie thành công",
        variant: "destructive",
      });
      return;
    }

    const cookieText = selectedItems.map(item => {
      const lines = [];
      if (item.spcSt) lines.push(item.spcSt);
      if (item.spcF) lines.push(item.spcF);
      return lines.join('\n');
    }).join('\n\n');

    navigator.clipboard.writeText(cookieText);
    showToast({
      title: "Đã sao chép",
      description: `Đã sao chép ${selectedItems.length} cookie vào clipboard`,
    });
  };

  const handleSelectResult = (id: number) => {
    setSelectedResults(prev => 
      prev.includes(id) 
        ? prev.filter(item => item !== id)
        : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const allIds = results.map(result => result.id);
    setSelectedResults(selectedResults.length === allIds.length ? [] : allIds);
  };

  const exportToExcel = (data: CookieExtractionResult[]) => {
    const headers = ['Phương thức', 'Đầu vào', 'SPC_ST', 'SPC_F', 'Trạng thái', 'Tin nhắn', 'Chi phí', 'Thời gian'];
    const csvContent = [
      '\uFEFF' + headers.join(','),
      ...data.map(result => [
        result.method,
        `"${result.input}"`,
        `"${result.spcSt || ''}"`,
        `"${result.spcF || ''}"`,
        result.status === 'success' ? 'Thành công' : 'Thất bại',
        `"${result.message}"`,
        result.cost,
        format(new Date(result.createdAt), "dd/MM/yyyy HH:mm", { locale: vi })
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cookie-extraction-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`;
    link.click();
  };

  // Filter and paginate results
  const filteredResults = results.filter(result => 
    result.input.toLowerCase().includes(searchTerm.toLowerCase()) ||
    result.message.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredResults.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedResults = filteredResults.slice(startIndex, startIndex + pageSize);

  // Helper function for date filtering
  const getDateFilterPredicate = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (dateFilter) {
      case 'today':
        return (date: Date) => date >= today;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return (date: Date) => date >= yesterday && date < today;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return (date: Date) => date >= weekAgo;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return (date: Date) => date >= monthAgo;
      case 'custom':
        if (customDateRange.start && customDateRange.end) {
          const startDate = new Date(customDateRange.start);
          const endDate = new Date(customDateRange.end);
          endDate.setHours(23, 59, 59, 999);
          return (date: Date) => date >= startDate && date <= endDate;
        }
        return () => true;
      default:
        return () => true;
    }
  };

  // Filter and paginate history
  const filteredHistory = (cookieHistory || []).filter(item => {
    const matchesSearch = item.input.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.message.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDate = getDateFilterPredicate()(new Date(item.createdAt));
    
    return matchesSearch && matchesDate;
  })
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Sort newest first

  const totalHistoryPages = Math.ceil(filteredHistory.length / pageSize);
  const paginatedHistory = filteredHistory.slice(startIndex, startIndex + pageSize);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-700">
      <FixedHeader />
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg">
                <Shield className="h-8 w-8" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                Lấy Cookie Shopee
              </h1>
            </div>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Trích xuất cookie SPC_ST và SPC_F từ Shopee với 2 phương thức khác nhau
            </p>
            <div className="flex items-center justify-center gap-4 mt-4 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <span>Phương thức 1: SPC_F → SPC_ST (100 ₫/thành công)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span>Phương thức 2: QR Code → SPC_ST + SPC_F (100 ₫/thành công)</span>
              </div>
            </div>
          </div>

          <div className="flex gap-4 mb-6">
            <Button 
              onClick={() => setShowHistory(false)}
              variant={!showHistory ? "default" : "outline"}
              className="bg-gradient-to-r from-orange-500 to-red-500 text-white"
            >
              <Shield className="h-4 w-4 mr-2" />
              Trích xuất cookie
            </Button>
            <Button 
              onClick={() => setShowHistory(true)}
              variant={showHistory ? "default" : "outline"}
            >
              Lịch sử trích xuất
            </Button>
          </div>

          {!showHistory ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-2 h-12">
                <TabsTrigger value="spcf-method" className="flex items-center gap-2 text-base">
                  <Shield className="h-5 w-5" />
                  Phương thức SPC_F
                </TabsTrigger>
                <TabsTrigger value="qr-method" className="flex items-center gap-2 text-base">
                  <QrCode className="h-5 w-5" />
                  Phương thức QR Code
                </TabsTrigger>
              </TabsList>

              <TabsContent value="spcf-method" className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Input Section */}
                  <Card className="backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 border-orange-200 dark:border-orange-800">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                        <Shield className="h-5 w-5" />
                        Nhập Dữ Liệu SPC_F
                      </CardTitle>
                      <CardDescription>
                        Nhập danh sách theo định dạng: SPC_F|username|password|proxy (mỗi dòng một mục)
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Textarea
                        placeholder={`SPC_F=abc123|username1|password1|proxy1:port1
SPC_F=def456|username2|password2|proxy2:port2
SPC_F=ghi789|username3|password3|

Ghi chú: 
- Nếu không có proxy thì để trống, hệ thống sẽ dùng proxy xoay vòng
- Hỗ trợ tối đa 50 cookie mỗi lần`}
                        value={spcfInput}
                        onChange={(e) => setSpcfInput(e.target.value)}
                        rows={15}
                        className="font-mono text-sm"
                      />
                      <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          <span className={spcfInput.trim().split('\n').filter(line => line.trim()).length > 50 ? 'text-orange-500 font-semibold' : ''}>
                            {spcfInput.trim().split('\n').filter(line => line.trim()).length} mục
                            {spcfInput.trim().split('\n').filter(line => line.trim()).length > 50 && ' (tối đa 50)'}
                          </span>
                        </div>
                        <Button 
                          onClick={handleSpcfExtraction}
                          disabled={extractFromSpcfMutation.isPending || !spcfInput.trim()}
                          className="bg-gradient-to-r from-orange-500 to-red-500 text-white"
                        >
                          {extractFromSpcfMutation.isPending ? "Đang xử lý..." : "Bắt đầu trích xuất"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Results Section */}
                  <Card className="backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 border-green-200 dark:border-green-800">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        Kết Quả Trích Xuất
                      </CardTitle>
                      <CardDescription>
                        Danh sách cookie SPC_ST và SPC_F đã trích xuất thành công
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {extractFromSpcfMutation.isPending && (
                        <div className="text-center py-8">
                          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                          <p className="mt-2 text-gray-600 dark:text-gray-400">Đang xử lý...</p>
                        </div>
                      )}

                      {results.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                Tổng: {results.length} mục | Thành công: {results.filter(r => r.status === 'success').length} | Thất bại: {results.filter(r => r.status === 'failed').length}
                                {selectedResults.length > 0 && ` | Đã chọn: ${selectedResults.length}`}
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                                  {selectedResults.length === results.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={handleCopySelectedCookies}
                                  disabled={selectedResults.length === 0}
                                  className="bg-green-50 dark:bg-green-900/20"
                                >
                                  <Copy className="h-4 w-4 mr-1" />
                                  Copy đã chọn
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => exportToExcel(selectedResults.length > 0 ? results.filter(r => selectedResults.includes(r.id)) : results)}
                                >
                                  <Download className="h-4 w-4 mr-1" />
                                  Xuất Excel
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="max-h-96 overflow-y-auto">
                            {paginatedResults.map((result) => (
                              <div
                                key={result.id}
                                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedResults.includes(result.id)}
                                    onChange={() => handleSelectResult(result.id)}
                                    className="rounded"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">
                                      {result.input.substring(0, 50)}...
                                    </div>
                                    {result.status === 'success' && (
                                      <div className="text-xs text-green-600 dark:text-green-400 mt-1 space-y-1">
                                        {result.spcSt && (
                                          <div 
                                            className="font-mono cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 px-1 py-0.5 rounded transition-colors"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleCopySingleCookie(result.spcSt!, 'SPC_ST');
                                            }}
                                            title="Click để sao chép SPC_ST"
                                          >
                                            SPC_ST: {result.spcSt.substring(0, 40)}...
                                          </div>
                                        )}
                                        {result.spcF && (
                                          <div 
                                            className="font-mono cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 px-1 py-0.5 rounded transition-colors"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleCopySingleCookie(result.spcF!, 'SPC_F');
                                            }}
                                            title="Click để sao chép SPC_F"
                                          >
                                            SPC_F: {result.spcF.substring(0, 40)}...
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {result.status === 'failed' && (
                                      <div className="text-xs text-red-500 dark:text-red-400 mt-1">
                                        {result.message}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={result.status === 'success' ? 'default' : 'destructive'}>
                                    {result.status === 'success' ? 'Thành công' : 'Thất bại'}
                                  </Badge>
                                  {result.status === 'success' && (result.spcSt || result.spcF) && (
                                    <Button variant="outline" size="sm" onClick={() => handleCopyResult(result)}>
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {results.length === 0 && !extractFromSpcfMutation.isPending && (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                          Chưa có kết quả trích xuất
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="qr-method" className="space-y-6">
                <Card className="backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 border-blue-200 dark:border-blue-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                      <QrCode className="h-5 w-5" />
                      Trích Xuất Cookie Bằng QR Code
                    </CardTitle>
                    <CardDescription>
                      Quét mã QR để lấy cả cookie SPC_ST và SPC_F
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="text-center">
                      <Button 
                        onClick={() => generateQrMutation.mutate()}
                        disabled={generateQrMutation.isPending || qrCodeStatus === 'waiting'}
                        className="bg-gradient-to-r from-blue-500 to-purple-500 text-white"
                        size="lg"
                      >
                        {generateQrMutation.isPending ? "Đang tạo..." : 
                         qrCodeStatus === 'waiting' ? "Đang chờ quét..." : "Tạo mã QR"}
                      </Button>
                    </div>

                    {qrCodeImage && (
                      <div className="text-center space-y-4">
                        <div className="inline-block p-4 bg-white rounded-lg shadow-lg">
                          <img 
                            src={qrCodeImage} 
                            alt="QR Code" 
                            className="w-64 h-64 mx-auto"
                          />
                        </div>
                        
                        {qrCodeStatus === 'waiting' && (
                          <div className="text-center">
                            <div className="inline-block animate-pulse">
                              <div className="w-4 h-4 bg-blue-500 rounded-full mx-1 inline-block"></div>
                              <div className="w-4 h-4 bg-blue-500 rounded-full mx-1 inline-block animation-delay-200"></div>
                              <div className="w-4 h-4 bg-blue-500 rounded-full mx-1 inline-block animation-delay-400"></div>
                            </div>
                            <p className="text-blue-600 dark:text-blue-400 font-medium">
                              Vui lòng mở app Shopee và quét mã QR này
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Mã QR sẽ hết hạn sau 5 phút
                            </p>
                          </div>
                        )}

                        {qrCodeStatus === 'success' && qrResults && (
                          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                            <h3 className="text-green-600 dark:text-green-400 font-medium mb-3">
                              Trích xuất thành công!
                            </h3>
                            <div className="space-y-2 text-sm font-mono">
                              {qrResults.spcSt && (
                                <div className="flex justify-between items-center">
                                  <span>SPC_ST:</span>
                                  <div className="flex items-center gap-2">
                                    <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                      {qrResults.spcSt.substring(0, 20)}...
                                    </span>
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => {
                                        navigator.clipboard.writeText(`SPC_ST=${qrResults.spcSt}`);
                                        showToast({ title: "Đã sao chép", description: "SPC_ST đã được sao chép" });
                                      }}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                              {qrResults.spcF && (
                                <div className="flex justify-between items-center">
                                  <span>SPC_F:</span>
                                  <div className="flex items-center gap-2">
                                    <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                      {qrResults.spcF.substring(0, 20)}...
                                    </span>
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => {
                                        navigator.clipboard.writeText(`SPC_F=${qrResults.spcF}`);
                                        showToast({ title: "Đã sao chép", description: "SPC_F đã được sao chép" });
                                      }}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {qrCodeStatus === 'expired' && (
                          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
                            <p className="text-red-600 dark:text-red-400 font-medium">
                              Mã QR đã hết hạn
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              Vui lòng tạo mã QR mới
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <Card className="backdrop-blur-sm bg-white/80 dark:bg-gray-800/80">
              <CardHeader>
                <CardTitle>Lịch sử trích xuất cookie</CardTitle>
                <CardDescription>
                  Xem lại các lần trích xuất cookie trước đây
                </CardDescription>
              </CardHeader>
              <CardContent>
                {cookieHistory && cookieHistory.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex gap-4 items-center mb-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Tìm kiếm..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      
                      <Select value={dateFilter} onValueChange={setDateFilter}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Lọc theo ngày" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả</SelectItem>
                          <SelectItem value="today">Hôm nay</SelectItem>
                          <SelectItem value="yesterday">Hôm qua</SelectItem>
                          <SelectItem value="week">7 ngày qua</SelectItem>
                          <SelectItem value="month">30 ngày qua</SelectItem>
                          <SelectItem value="custom">Tùy chọn</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Select value={pageSize.toString()} onValueChange={(value) => setPageSize(parseInt(value))}>
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {dateFilter === 'custom' && (
                      <div className="flex gap-4 mb-4">
                        <div className="flex-1">
                          <Input
                            type="date"
                            placeholder="Từ ngày"
                            value={customDateRange.start}
                            onChange={(e) => setCustomDateRange({...customDateRange, start: e.target.value})}
                          />
                        </div>
                        <div className="flex-1">
                          <Input
                            type="date"
                            placeholder="Đến ngày"
                            value={customDateRange.end}
                            onChange={(e) => setCustomDateRange({...customDateRange, end: e.target.value})}
                          />
                        </div>
                      </div>
                    )}

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Phương thức</TableHead>
                          <TableHead>Đầu vào</TableHead>
                          <TableHead>Cookie</TableHead>
                          <TableHead>Trạng thái</TableHead>
                          <TableHead>Chi phí</TableHead>
                          <TableHead>Thời gian</TableHead>
                          <TableHead>Thao tác</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedHistory.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Badge variant={item.method === 'QR' ? 'secondary' : 'outline'}>
                                {item.method}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm max-w-xs truncate">
                              {item.input}
                            </TableCell>
                            <TableCell className="font-mono text-xs max-w-xs">
                              {item.status === 'success' ? (
                                <div className="space-y-1">
                                  {item.spcSt && (
                                    <div 
                                      className="bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded border cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                                      onClick={() => handleCopySingleCookie(item.spcSt!, 'SPC_ST')}
                                      title="Click để sao chép SPC_ST"
                                    >
                                      <span className="text-blue-600 dark:text-blue-400 font-medium">SPC_ST:</span>
                                      <div className="truncate text-gray-700 dark:text-gray-300">
                                        {item.spcSt.substring(0, 30)}...
                                      </div>
                                    </div>
                                  )}
                                  {item.spcF && (
                                    <div 
                                      className="bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded border cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                                      onClick={() => handleCopySingleCookie(item.spcF!, 'SPC_F')}
                                      title="Click để sao chép SPC_F"
                                    >
                                      <span className="text-green-600 dark:text-green-400 font-medium">SPC_F:</span>
                                      <div className="truncate text-gray-700 dark:text-gray-300">
                                        {item.spcF.substring(0, 30)}...
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={item.status === 'success' ? 'default' : 'destructive'}>
                                {item.status === 'success' ? 'Thành công' : 'Thất bại'}
                              </Badge>
                            </TableCell>
                            <TableCell>{item.cost} ₫</TableCell>
                            <TableCell>{format(new Date(item.createdAt), "dd/MM/yyyy HH:mm", { locale: vi })}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {item.status === 'success' && (
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => handleCopyResult(item)}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {/* Pagination */}
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Tổng {filteredHistory.length} bản ghi
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage - 1)}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Trước
                        </Button>
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            Trang {currentPage} / {totalHistoryPages}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage + 1)}
                          disabled={currentPage === totalHistoryPages}
                        >
                          Sau
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    Chưa có lịch sử trích xuất cookie
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Important Notes */}
          <Card className="mt-6 backdrop-blur-sm bg-yellow-50/80 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
            <CardContent className="pt-6">
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Lưu ý quan trọng:
                </h4>
                <ul className="space-y-2 list-disc list-inside">
                  <li><strong>Phương thức 1:</strong> Sử dụng cookie SPC_F và password để lấy SPC_ST (100 ₫/thành công)</li>
                  <li><strong>Phương thức 2:</strong> Quét QR code để lấy cả SPC_ST và SPC_F (100 ₫/thành công)</li>
                  <li>Cookie trích xuất thành công sẽ tự động được lưu vào trang quản lý cookie</li>
                  <li>Nếu cookie đã tồn tại trong hệ thống thì sẽ không lưu lại</li>
                  <li>Chỉ tính phí khi trích xuất thành công</li>
                  <li>Proxy tùy chọn, nếu không có hệ thống sẽ dùng proxy xoay vòng</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}