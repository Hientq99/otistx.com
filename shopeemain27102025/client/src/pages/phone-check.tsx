import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, CheckCircle, XCircle, Search, Copy, ChevronLeft, ChevronRight, Download, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FixedHeader } from "@/components/fixed-header";

interface CheckResult {
  phoneNumber: string;
  isRegistered: boolean;
  alreadyInDatabase: boolean;
  cost: number;
  error?: string;
}

interface BulkCheckResponse {
  success: boolean;
  results: CheckResult[];
  totalChecked: number;
  totalCost: number;
}

interface PhoneCheckHistory {
  id: number;
  phoneNumber: string;
  isRegistered: boolean;
  cost: number;
  checkedAt: string;
  userId: number;
}

export default function PhoneCheckPage() {
  const [phoneNumbers, setPhoneNumbers] = useState("");
  const [results, setResults] = useState<CheckResult[]>([]);
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([]);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "registered" | "unregistered">("all");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: userBalance } = useQuery({
    queryKey: ["/api/user/balance"],
    enabled: !!user,
  });

  const { data: phoneCheckHistory } = useQuery<PhoneCheckHistory[]>({
    queryKey: ["/api/phone-checks"],
    enabled: !!user && showHistory,
  });

  const checkPhonesMutation = useMutation({
    mutationFn: async (phoneNumbers: string[]) => {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/phone-checks/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ phoneNumbers })
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Response error:", response.status, text);
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const result = await response.json();
      return result as BulkCheckResponse;
    },
    onSuccess: (data) => {
      setResults(data.results);
      setSelectedNumbers([]);
      setCurrentPage(1);
      queryClient.invalidateQueries({ queryKey: ["/api/phone-checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
      toast({
        title: "Hoàn thành",
        description: `Đã kiểm tra ${data.totalChecked} số điện thoại. Chi phí: ${data.totalCost} ₫`,
      });
    },
    onError: (error) => {
      toast({
        title: "Lỗi",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phoneNumbers.trim()) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập số điện thoại",
        variant: "destructive",
      });
      return;
    }

    const numbers = phoneNumbers
      .split(/[\n,\s]+/)
      .map(n => n.trim())
      .filter(n => n.length > 0);

    if (numbers.length === 0) {
      toast({
        title: "Lỗi",
        description: "Không tìm thấy số điện thoại hợp lệ",
        variant: "destructive",
      });
      return;
    }

    checkPhonesMutation.mutate(numbers);
  };

  const handleSelectNumber = (phoneNumber: string, checked: boolean) => {
    if (checked) {
      setSelectedNumbers([...selectedNumbers, phoneNumber]);
    } else {
      setSelectedNumbers(selectedNumbers.filter(n => n !== phoneNumber));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const visibleNumbers = paginatedResults.map(r => r.phoneNumber);
      setSelectedNumbers(Array.from(new Set([...selectedNumbers, ...visibleNumbers])));
    } else {
      const visibleNumbers = paginatedResults.map(r => r.phoneNumber);
      setSelectedNumbers(selectedNumbers.filter(n => !visibleNumbers.includes(n)));
    }
  };

  const handleSelectHistoryItem = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedHistoryIds([...selectedHistoryIds, id]);
    } else {
      setSelectedHistoryIds(selectedHistoryIds.filter(i => i !== id));
    }
  };

  const handleSelectAllHistory = (checked: boolean) => {
    if (checked) {
      const visibleIds = paginatedHistory.map(h => h.id);
      setSelectedHistoryIds(Array.from(new Set([...selectedHistoryIds, ...visibleIds])));
    } else {
      const visibleIds = paginatedHistory.map(h => h.id);
      setSelectedHistoryIds(selectedHistoryIds.filter(i => !visibleIds.includes(i)));
    }
  };

  const copySelectedNumbers = () => {
    if (selectedNumbers.length === 0) {
      toast({
        title: "Thông báo",
        description: "Vui lòng chọn số điện thoại để sao chép",
        variant: "destructive",
      });
      return;
    }

    navigator.clipboard.writeText(selectedNumbers.join('\n'));
    toast({
      title: "Thành công",
      description: `Đã sao chép ${selectedNumbers.length} số điện thoại`,
    });
  };

  const copyRegisteredNumbers = () => {
    const registeredNumbers = results.filter(r => r.isRegistered).map(r => r.phoneNumber);
    if (registeredNumbers.length === 0) {
      toast({
        title: "Thông báo",
        description: "Không có số nào đã đăng ký",
        variant: "destructive",
      });
      return;
    }

    navigator.clipboard.writeText(registeredNumbers.join('\n'));
    toast({
      title: "Thành công",
      description: `Đã sao chép ${registeredNumbers.length} số đã đăng ký`,
    });
  };

  const copyUnregisteredNumbers = () => {
    const unregisteredNumbers = results.filter(r => !r.isRegistered && !r.error).map(r => r.phoneNumber);
    if (unregisteredNumbers.length === 0) {
      toast({
        title: "Thông báo",
        description: "Không có số nào chưa đăng ký",
        variant: "destructive",
      });
      return;
    }

    navigator.clipboard.writeText(unregisteredNumbers.join('\n'));
    toast({
      title: "Thành công",
      description: `Đã sao chép ${unregisteredNumbers.length} số chưa đăng ký`,
    });
  };

  const exportResultsToExcel = async () => {
    if (selectedNumbers.length === 0) {
      toast({
        title: "Thông báo",
        description: "Vui lòng chọn ít nhất 1 số để xuất Excel",
        variant: "destructive",
      });
      return;
    }

    const XLSX = await import('xlsx');
    const selectedResults = results.filter(r => selectedNumbers.includes(r.phoneNumber));
    const data = selectedResults.map(r => ({
      'Số điện thoại': r.phoneNumber,
      'Trạng thái': r.error ? 'Lỗi' : (r.isRegistered ? 'Đã đăng ký' : 'Chưa đăng ký'),
      'Đã có trong DB': r.alreadyInDatabase ? 'Có' : 'Không',
      'Chi phí (VND)': r.cost,
      'Ghi chú': r.error || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kết quả kiểm tra");
    
    const fileName = `kiem-tra-sdt-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);

    toast({
      title: "Thành công",
      description: `Đã xuất ${selectedResults.length} kết quả ra file Excel`,
    });
  };

  const exportHistoryToExcel = async () => {
    if (!phoneCheckHistory || selectedHistoryIds.length === 0) {
      toast({
        title: "Thông báo",
        description: "Vui lòng chọn ít nhất 1 mục lịch sử để xuất Excel",
        variant: "destructive",
      });
      return;
    }

    const XLSX = await import('xlsx');
    const selectedHistory = phoneCheckHistory.filter(h => selectedHistoryIds.includes(h.id));
    const data = selectedHistory.map(h => ({
      'Số điện thoại': h.phoneNumber,
      'Trạng thái': h.isRegistered ? 'Đã đăng ký' : 'Chưa đăng ký',
      'Chi phí (VND)': h.cost,
      'Thời gian': new Date(h.checkedAt).toLocaleString('vi-VN')
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lịch sử kiểm tra");
    
    const fileName = `lich-su-kiem-tra-sdt-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);

    toast({
      title: "Thành công",
      description: `Đã xuất ${selectedHistory.length} bản ghi ra file Excel`,
    });
  };

  // Memoized: Filter and paginate results
  const filteredResults = useMemo(() => {
    let filtered = results.filter(result => result.phoneNumber.includes(searchTerm));
    
    if (statusFilter === "registered") {
      filtered = filtered.filter(result => result.isRegistered && !result.error);
    } else if (statusFilter === "unregistered") {
      filtered = filtered.filter(result => !result.isRegistered && !result.error);
    }
    
    return filtered;
  }, [results, searchTerm, statusFilter]);

  const totalPages = useMemo(() => 
    Math.ceil(filteredResults.length / pageSize),
    [filteredResults.length, pageSize]
  );

  const startIndex = useMemo(() => 
    (currentPage - 1) * pageSize,
    [currentPage, pageSize]
  );

  const paginatedResults = useMemo(() => 
    filteredResults.slice(startIndex, startIndex + pageSize),
    [filteredResults, startIndex, pageSize]
  );

  // Memoized: Filter and paginate history
  const filteredHistory = useMemo(() => 
    phoneCheckHistory?.filter(h => h.phoneNumber.includes(searchTerm)) || [],
    [phoneCheckHistory, searchTerm]
  );

  const totalHistoryPages = useMemo(() => 
    Math.ceil(filteredHistory.length / pageSize),
    [filteredHistory.length, pageSize]
  );

  const historyStartIndex = useMemo(() => 
    (currentPage - 1) * pageSize,
    [currentPage, pageSize]
  );

  const paginatedHistory = useMemo(() => 
    filteredHistory.slice(historyStartIndex, historyStartIndex + pageSize),
    [filteredHistory, historyStartIndex, pageSize]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <FixedHeader />
      <div className="container mx-auto px-4 py-8 pt-24 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Kiểm Tra Số Điện Thoại Shopee
          </h1>
          <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
            Kiểm tra hàng loạt số điện thoại đã đăng ký Shopee
          </p>
        </div>

        {/* Tab Selection */}
        <div className="flex gap-2 mb-6">
          <Button 
            onClick={() => {
              setShowHistory(false);
              setCurrentPage(1);
              setSearchTerm("");
            }}
            variant={!showHistory ? "default" : "outline"}
            className="flex-1 sm:flex-none"
            data-testid="tab-check"
          >
            Kiểm tra mới
          </Button>
          <Button 
            onClick={() => {
              setShowHistory(true);
              setCurrentPage(1);
              setSearchTerm("");
              setSelectedHistoryIds([]);
            }}
            variant={showHistory ? "default" : "outline"}
            className="flex-1 sm:flex-none"
            data-testid="tab-history"
          >
            Lịch sử kiểm tra
          </Button>
        </div>

        {!showHistory ? (
          <>
            {/* Check Form & Results - Responsive Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Input Section */}
              <Card data-testid="card-input">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                    <Search className="h-5 w-5" />
                    Nhập Số Điện Thoại
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Nhập danh sách số điện thoại, mỗi số một dòng
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <Textarea
                      value={phoneNumbers}
                      onChange={(e) => setPhoneNumbers(e.target.value)}
                      placeholder="Nhập số điện thoại (một số mỗi dòng)&#10;Ví dụ:&#10;0386431186&#10;84386431187&#10;386431188"
                      className="min-h-32 text-sm md:text-base"
                      data-testid="textarea-phone-numbers"
                    />
                    
                    <div className="text-xs md:text-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                      <div className="mb-2 font-semibold">Định dạng hỗ trợ:</div>
                      <ul className="list-disc list-inside space-y-1">
                        <li>+84123456789 (quốc tế)</li>
                        <li>0123456789 (có số 0 đầu)</li>
                        <li>123456789 (9 chữ số)</li>
                        <li className="font-semibold text-orange-600">⚡ Tối đa 50 số/lần - Tốc độ siêu nhanh!</li>
                      </ul>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">
                        Số dư: <span className="font-bold">{userBalance ? `${userBalance.toLocaleString()} ₫` : "..."}</span>
                      </div>
                      <Button 
                        type="submit" 
                        disabled={checkPhonesMutation.isPending}
                        className="bg-orange-600 hover:bg-orange-700 w-full sm:w-auto"
                        data-testid="button-check"
                      >
                        {checkPhonesMutation.isPending ? "Đang kiểm tra..." : `Kiểm tra ${phoneNumbers.split(/[\n,\s]+/).filter(n => n.trim()).length} số`}
                      </Button>
                    </div>

                    {phoneNumbers && (
                      <div className="text-xs md:text-sm text-orange-600 bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
                        Số điện thoại sẽ kiểm tra: <strong>{phoneNumbers.split(/[\n,\s]+/).filter(n => n.trim()).length}</strong>
                        <br />
                        💰 Chi phí ước tính: <strong>{phoneNumbers.split(/[\n,\s]+/).filter(n => n.trim()).length * 100} ₫</strong>
                      </div>
                    )}
                  </form>
                </CardContent>
              </Card>

              {/* Results Summary */}
              <Card data-testid="card-results">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                    ✅ Kết Quả Kiểm Tra
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Tổng quan kết quả kiểm tra
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {checkPhonesMutation.isPending && (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Đang kiểm tra...</p>
                    </div>
                  )}

                  {results.length > 0 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                          <div className="text-xl md:text-2xl font-bold text-green-600">
                            {results.filter(r => !r.isRegistered && !r.error).length}
                          </div>
                          <div className="text-xs md:text-sm text-green-600">Chưa đăng ký</div>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                          <div className="text-xl md:text-2xl font-bold text-red-600">
                            {results.filter(r => r.isRegistered).length}
                          </div>
                          <div className="text-xs md:text-sm text-red-600">Đã đăng ký</div>
                        </div>
                        <div className="col-span-2 sm:col-span-1 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                          <div className="text-xl md:text-2xl font-bold text-blue-600">
                            {results.filter(r => r.error && r.error.includes('Rate limit')).length}
                          </div>
                          <div className="text-xs md:text-sm text-blue-600">Rate limit</div>
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={copyRegisteredNumbers}
                          className="gap-1 text-xs flex-1 sm:flex-none"
                          data-testid="button-copy-registered"
                        >
                          <Copy className="h-3 w-3" />
                          <span className="hidden sm:inline">Copy đã đăng ký</span>
                          <span className="sm:hidden">Đã ĐK</span>
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={copyUnregisteredNumbers}
                          className="gap-1 text-xs flex-1 sm:flex-none"
                          data-testid="button-copy-unregistered"
                        >
                          <Copy className="h-3 w-3" />
                          <span className="hidden sm:inline">Copy chưa đăng ký</span>
                          <span className="sm:hidden">Chưa ĐK</span>
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={copySelectedNumbers}
                          className="gap-1 text-xs flex-1 sm:flex-none"
                          data-testid="button-copy-selected"
                        >
                          <Copy className="h-3 w-3" />
                          Đã chọn ({selectedNumbers.length})
                        </Button>
                      </div>

                      {results.some(r => r.cost > 0) && (
                        <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                          <span className="text-base md:text-lg font-bold text-orange-600">
                            Tổng chi phí: {results.reduce((sum, r) => sum + r.cost, 0).toLocaleString()} ₫
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {results.length === 0 && !checkPhonesMutation.isPending && (
                    <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                      Chưa có kết quả kiểm tra
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Detailed Results Table */}
            {results.length > 0 && (
              <Card className="mt-6" data-testid="card-results-table">
                <CardHeader>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg md:text-xl">Bảng kết quả chi tiết</CardTitle>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={exportResultsToExcel}
                        className="gap-1 bg-green-600 hover:bg-green-700"
                        disabled={selectedNumbers.length === 0}
                        data-testid="button-export-results"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                        <span className="hidden sm:inline">Xuất Excel</span>
                        <span className="sm:hidden">Excel</span>
                        {selectedNumbers.length > 0 && ` (${selectedNumbers.length})`}
                      </Button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        placeholder="Tìm kiếm..."
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full sm:w-48 text-sm"
                        data-testid="input-search-results"
                      />
                      <Select value={statusFilter} onValueChange={(value: "all" | "registered" | "unregistered") => {
                        setStatusFilter(value);
                        setCurrentPage(1);
                      }}>
                        <SelectTrigger className="w-full sm:w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả</SelectItem>
                          <SelectItem value="registered">Đã đăng ký</SelectItem>
                          <SelectItem value="unregistered">Chưa đăng ký</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={pageSize.toString()} onValueChange={(value) => {
                        setPageSize(parseInt(value));
                        setCurrentPage(1);
                      }}>
                        <SelectTrigger className="w-full sm:w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={copySelectedNumbers}
                        className="gap-1"
                        disabled={selectedNumbers.length === 0}
                        data-testid="button-copy-selected-table"
                      >
                        <Copy className="h-4 w-4" />
                        <span className="hidden sm:inline">Copy đã chọn</span>
                        <span className="sm:hidden">Copy</span>
                        {selectedNumbers.length > 0 && ` (${selectedNumbers.length})`}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Mobile View */}
                  <div className="block md:hidden space-y-3">
                    {paginatedResults.map((result, index) => (
                      <div key={index} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <Checkbox
                            checked={selectedNumbers.includes(result.phoneNumber)}
                            onCheckedChange={(checked) => handleSelectNumber(result.phoneNumber, checked as boolean)}
                            data-testid={`checkbox-result-mobile-${index}`}
                          />
                          <div className="flex-1 ml-3">
                            <div className="font-mono text-sm font-bold">{result.phoneNumber}</div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {result.error ? (
                                <Badge variant="secondary" className="gap-1 text-xs">
                                  <AlertCircle className="h-3 w-3" />
                                  {result.error}
                                </Badge>
                              ) : result.isRegistered ? (
                                <Badge variant="destructive" className="gap-1 text-xs">
                                  <XCircle className="h-3 w-3" />
                                  Đã đăng ký
                                </Badge>
                              ) : (
                                <Badge variant="default" className="gap-1 bg-green-600 text-xs">
                                  <CheckCircle className="h-3 w-3" />
                                  Chưa đăng ký
                                </Badge>
                              )}
                              {result.alreadyInDatabase && (
                                <Badge variant="outline" className="text-xs">Có trong DB</Badge>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Chi phí: <span className="font-bold">{result.cost} ₫</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={paginatedResults.length > 0 && paginatedResults.every(r => selectedNumbers.includes(r.phoneNumber))}
                              onCheckedChange={handleSelectAll}
                              data-testid="checkbox-select-all-results"
                            />
                          </TableHead>
                          <TableHead>Số điện thoại</TableHead>
                          <TableHead>Trạng thái</TableHead>
                          <TableHead>Trong DB</TableHead>
                          <TableHead className="text-right">Chi phí</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedResults.map((result, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Checkbox
                                checked={selectedNumbers.includes(result.phoneNumber)}
                                onCheckedChange={(checked) => handleSelectNumber(result.phoneNumber, checked as boolean)}
                                data-testid={`checkbox-result-${index}`}
                              />
                            </TableCell>
                            <TableCell className="font-mono">{result.phoneNumber}</TableCell>
                            <TableCell>
                              {result.error ? (
                                <Badge variant="secondary" className="gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  {result.error}
                                </Badge>
                              ) : result.isRegistered ? (
                                <Badge variant="destructive" className="gap-1">
                                  <XCircle className="h-3 w-3" />
                                  Đã đăng ký
                                </Badge>
                              ) : (
                                <Badge variant="default" className="gap-1 bg-green-600">
                                  <CheckCircle className="h-3 w-3" />
                                  Chưa đăng ký
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {result.alreadyInDatabase ? (
                                <Badge variant="outline">Có</Badge>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold">{result.cost} ₫</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
                    <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                      Hiển thị {startIndex + 1}-{Math.min(startIndex + pageSize, filteredResults.length)} / {filteredResults.length}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">Trước</span>
                      </Button>
                      <div className="flex items-center px-3 text-sm">
                        Trang {currentPage}/{totalPages || 1}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                        data-testid="button-next-page"
                      >
                        <span className="hidden sm:inline">Sau</span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          /* History Section */
          <Card data-testid="card-history">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg md:text-xl">Lịch sử kiểm tra số điện thoại</CardTitle>
                  <CardDescription className="text-sm">
                    Xem lại các lần kiểm tra trước đây
                  </CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder="Tìm kiếm..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full sm:w-48 text-sm"
                    data-testid="input-search-history"
                  />
                  <Select value={pageSize.toString()} onValueChange={(value) => {
                    setPageSize(parseInt(value));
                    setCurrentPage(1);
                  }}>
                    <SelectTrigger className="w-full sm:w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={exportHistoryToExcel}
                    className="gap-1 bg-green-600 hover:bg-green-700"
                    disabled={selectedHistoryIds.length === 0}
                    data-testid="button-export-history"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    <span className="hidden sm:inline">Xuất Excel</span>
                    <span className="sm:hidden">Excel</span>
                    {selectedHistoryIds.length > 0 && ` (${selectedHistoryIds.length})`}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {phoneCheckHistory && phoneCheckHistory.length > 0 ? (
                <>
                  {/* Mobile View */}
                  <div className="block md:hidden space-y-3">
                    {paginatedHistory.map((item) => (
                      <div key={item.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <Checkbox
                            checked={selectedHistoryIds.includes(item.id)}
                            onCheckedChange={(checked) => handleSelectHistoryItem(item.id, checked as boolean)}
                            data-testid={`checkbox-history-mobile-${item.id}`}
                          />
                          <div className="flex-1 ml-3">
                            <div className="font-mono text-sm font-bold">{item.phoneNumber}</div>
                            <div className="mt-1">
                              {item.isRegistered ? (
                                <Badge variant="destructive" className="gap-1 text-xs">
                                  <XCircle className="h-3 w-3" />
                                  Đã đăng ký
                                </Badge>
                              ) : (
                                <Badge variant="default" className="gap-1 bg-green-600 text-xs">
                                  <CheckCircle className="h-3 w-3" />
                                  Chưa đăng ký
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Chi phí: <span className="font-bold">{item.cost || 0} ₫</span>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                              {new Date(item.checkedAt).toLocaleString('vi-VN')}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={paginatedHistory.length > 0 && paginatedHistory.every(h => selectedHistoryIds.includes(h.id))}
                              onCheckedChange={handleSelectAllHistory}
                              data-testid="checkbox-select-all-history"
                            />
                          </TableHead>
                          <TableHead>Số điện thoại</TableHead>
                          <TableHead>Trạng thái</TableHead>
                          <TableHead>Chi phí</TableHead>
                          <TableHead>Thời gian</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedHistory.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedHistoryIds.includes(item.id)}
                                onCheckedChange={(checked) => handleSelectHistoryItem(item.id, checked as boolean)}
                                data-testid={`checkbox-history-${item.id}`}
                              />
                            </TableCell>
                            <TableCell className="font-mono">{item.phoneNumber}</TableCell>
                            <TableCell>
                              {item.isRegistered ? (
                                <Badge variant="destructive" className="gap-1">
                                  <XCircle className="h-3 w-3" />
                                  Đã đăng ký
                                </Badge>
                              ) : (
                                <Badge variant="default" className="gap-1 bg-green-600">
                                  <CheckCircle className="h-3 w-3" />
                                  Chưa đăng ký
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>{item.cost || 0} ₫</TableCell>
                            <TableCell>{new Date(item.checkedAt).toLocaleString('vi-VN')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
                    <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                      Hiển thị {historyStartIndex + 1}-{Math.min(historyStartIndex + pageSize, filteredHistory.length)} / {filteredHistory.length}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        data-testid="button-prev-history"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">Trước</span>
                      </Button>
                      <div className="flex items-center px-3 text-sm">
                        Trang {currentPage}/{totalHistoryPages || 1}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage >= totalHistoryPages}
                        data-testid="button-next-history"
                      >
                        <span className="hidden sm:inline">Sau</span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                  Chưa có lịch sử kiểm tra
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
