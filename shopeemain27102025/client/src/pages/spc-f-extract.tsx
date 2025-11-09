import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FixedHeader } from "@/components/fixed-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Key, 
  Play, 
  CheckCircle, 
  History,
  Copy,
  Download,
  ChevronLeft,
  ChevronRight,
  Globe,
  X
} from "lucide-react";

interface ShopeeCookie {
  id: string;
  cookieType: string;
  cookiePreview: string;
  shopeeRegion: string;
  createdAt: string;
}

interface SpcFExtractionResult {
  cookieId?: string;
  spcSt: string;
  spcF: string | null;
  username: string | null;
  status: boolean;
  message: string;
  proxy?: string;
}

interface SpcFExtractionHistory {
  id: number;
  cookieId: string;
  spcSt: string;
  spcF: string | null;
  username: string | null;
  status: boolean;
  message: string;
  proxy?: string;
  createdAt: string;
}

export default function SpcFExtractPage() {
  const [selectedCookies, setSelectedCookies] = useState<string[]>([]);
  const [proxyList, setProxyList] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractResults, setExtractResults] = useState<SpcFExtractionResult[]>([]);
  
  const [bulkCookieText, setBulkCookieText] = useState("");
  const [isBulkExtracting, setIsBulkExtracting] = useState(false);
  const [bulkExtractResults, setBulkExtractResults] = useState<SpcFExtractionResult[]>([]);
  
  const [historyPage, setHistoryPage] = useState(1);
  const [historyItemsPerPage, setHistoryItemsPerPage] = useState(10);
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<number[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setSelectedHistoryIds([]);
  }, [historyPage, historySearchTerm, historyItemsPerPage]);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  const { data: cookies, isLoading: cookiesLoading } = useQuery({
    queryKey: ["/api/shopee-cookies"],
  });

  const { data: extractionHistory, isLoading: historyLoading } = useQuery<SpcFExtractionHistory[]>({
    queryKey: ["/api/spc-f-extractions"],
  });

  // Get service pricing for SPC_F extraction
  const { data: pricingData } = useQuery<{ price: number }>({
    queryKey: ['/api/spc-f-extract-price'],
  });
  
  const spcFExtractPrice = pricingData?.price || 100;

  const parseProxyList = (proxyText: string) => {
    return proxyText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  };

  const parseBulkCookieText = (text: string) => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const entries: { cookie: string; proxy?: string }[] = [];
    
    for (const line of lines) {
      if (line.includes('|')) {
        const [cookie, proxy] = line.split('|').map(part => part.trim());
        if (cookie) {
          entries.push({ cookie, proxy: proxy || undefined });
        }
      } else {
        if (line) {
          entries.push({ cookie: line });
        }
      }
    }
    
    return entries;
  };

  const handleSelectAllCookies = () => {
    if (selectedCookies.length === (cookies as ShopeeCookie[])?.length) {
      setSelectedCookies([]);
    } else {
      setSelectedCookies((cookies as ShopeeCookie[])?.map(cookie => cookie.id) || []);
    }
  };

  const toggleCookieSelection = (cookieId: string) => {
    setSelectedCookies(prev => 
      prev.includes(cookieId) 
        ? prev.filter(id => id !== cookieId)
        : [...prev, cookieId]
    );
  };

  const extractSpcFMutation = useMutation({
    mutationFn: async (data: { cookieIds: string[]; proxies: string[] }) => {
      return await apiRequest({
        url: "/api/spc-f-extract",
        method: "POST",
        body: data,
      });
    },
    onSuccess: (results) => {
      setExtractResults(results);
      queryClient.invalidateQueries({ queryKey: ["/api/spc-f-extractions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopee-cookies"] });
      
      const successCount = results.filter((r: SpcFExtractionResult) => r.status && r.spcF).length;
      toast({
        title: "Trích xuất hoàn tất!",
        description: `Đã trích xuất thành công ${successCount}/${results.length} SPC_F`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể trích xuất SPC_F",
        variant: "destructive",
      });
    }
  });

  const bulkExtractSpcFMutation = useMutation({
    mutationFn: async (data: { entries: { cookie: string; proxy?: string }[] }) => {
      return await apiRequest({
        url: "/api/spc-f-extract/bulk",
        method: "POST",
        body: data,
      });
    },
    onSuccess: (results) => {
      setBulkExtractResults(results);
      setIsBulkExtracting(false);
      queryClient.invalidateQueries({ queryKey: ["/api/spc-f-extractions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopee-cookies"] });
      
      const successCount = results.filter((r: SpcFExtractionResult) => r.status && r.spcF).length;
      toast({
        title: "Trích xuất form hoàn tất!",
        description: `Đã trích xuất thành công ${successCount}/${results.length} SPC_F`,
      });
    },
    onError: (error: any) => {
      setIsBulkExtracting(false);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể trích xuất SPC_F form",
        variant: "destructive",
      });
    }
  });

  const handleExtract = async () => {
    if (selectedCookies.length === 0) {
      toast({
        title: "Chưa chọn cookie",
        description: "Vui lòng chọn ít nhất một cookie để trích xuất",
        variant: "destructive",
      });
      return;
    }

    setIsExtracting(true);
    const proxies = parseProxyList(proxyList);
    
    try {
      await extractSpcFMutation.mutateAsync({
        cookieIds: selectedCookies,
        proxies,
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleBulkExtract = async () => {
    const entries = parseBulkCookieText(bulkCookieText);
    
    if (entries.length === 0) {
      toast({
        title: "Chưa nhập cookie",
        description: "Vui lòng nhập ít nhất một cookie để trích xuất",
        variant: "destructive",
      });
      return;
    }

    setIsBulkExtracting(true);
    
    try {
      await bulkExtractSpcFMutation.mutateAsync({ entries });
    } catch (error) {
      setIsBulkExtracting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Đã sao chép!",
      description: "Đã sao chép vào clipboard",
    });
  };

  const exportResults = (results: SpcFExtractionResult[]) => {
    const successResults = results.filter(r => r.status && r.spcF);
    if (successResults.length === 0) {
      toast({
        title: "Không có kết quả",
        description: "Không có SPC_F nào để xuất",
        variant: "destructive",
      });
      return;
    }

    const exportText = successResults
      .map(r => `${r.username || 'Unknown'}|${r.spcF}|${r.spcSt}`)
      .join('\n');
    
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spc_f_extract_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Đã xuất file!",
      description: `Đã xuất ${successResults.length} SPC_F thành công`,
    });
  };

  const toggleHistorySelection = (id: number) => {
    const item = (extractionHistory || []).find(h => h.id === id);
    if (!item || !item.status || !item.spcF) {
      return;
    }
    
    setSelectedHistoryIds(prev => 
      prev.includes(id) 
        ? prev.filter(historyId => historyId !== id)
        : [...prev, id]
    );
  };

  const handleSelectAllHistory = (checked: boolean) => {
    if (checked) {
      const allIds = paginatedHistory
        .filter(item => item.status && item.spcF)
        .map(item => item.id);
      setSelectedHistoryIds(allIds);
    } else {
      setSelectedHistoryIds([]);
    }
  };

  const exportSelectedHistory = () => {
    if (selectedHistoryIds.length === 0) {
      toast({
        title: "Chưa chọn cookie",
        description: "Vui lòng chọn ít nhất một cookie để xuất",
        variant: "destructive",
      });
      return;
    }

    const selectedItems = (extractionHistory || []).filter(item => 
      selectedHistoryIds.includes(item.id) && item.status && item.spcF
    );

    if (selectedItems.length === 0) {
      toast({
        title: "Không có kết quả hợp lệ",
        description: "Các cookie đã chọn không có SPC_F hợp lệ",
        variant: "destructive",
      });
      return;
    }

    const exportText = selectedItems
      .map(item => `${item.username || 'Unknown'}|${item.spcF}|${item.spcSt}`)
      .join('\n');
    
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spc_f_history_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Đã xuất file!",
      description: `Đã xuất ${selectedItems.length} SPC_F từ lịch sử`,
    });

    setSelectedHistoryIds([]);
  };

  const sortedHistory = [...(extractionHistory || [])].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  const filteredHistory = historySearchTerm
    ? sortedHistory.filter(item => 
        (item.username?.toLowerCase().includes(historySearchTerm.toLowerCase())) ||
        (item.spcSt?.toLowerCase().includes(historySearchTerm.toLowerCase())) ||
        (item.spcF?.toLowerCase().includes(historySearchTerm.toLowerCase()))
      )
    : sortedHistory;
    
  const totalPages = Math.ceil(filteredHistory.length / historyItemsPerPage);
  const paginatedHistory = filteredHistory.slice(
    (historyPage - 1) * historyItemsPerPage,
    historyPage * historyItemsPerPage
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <FixedHeader />
      
      <main className="container mx-auto px-3 md:px-4 py-4 md:py-6 mt-16">
        <div className="mb-4 md:mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2" data-testid="text-page-title">
            <Key className="h-6 w-6 md:h-8 md:w-8" />
            Trích Xuất SPC_F
          </h1>
          <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 mt-2">
            Trích xuất SPC_F từ SPC_ST cookies - Giá: {spcFExtractPrice.toLocaleString('vi-VN')}đ/cookie thành công
          </p>
        </div>

        <Tabs defaultValue="extract" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="extract" data-testid="tab-extract" className="text-xs md:text-sm">
              <Play className="h-3 w-3 md:h-4 md:w-4 md:mr-2" />
              <span className="hidden md:inline">Trích Xuất</span>
              <span className="md:hidden">Trích xuất</span>
            </TabsTrigger>
            <TabsTrigger value="bulk" data-testid="tab-bulk" className="text-xs md:text-sm">
              <CheckCircle className="h-3 w-3 md:h-4 md:w-4 md:mr-2" />
              <span className="hidden md:inline">Trích Xuất Form</span>
              <span className="md:hidden">Form</span>
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history" className="text-xs md:text-sm">
              <History className="h-3 w-3 md:h-4 md:w-4 md:mr-2" />
              <span className="hidden md:inline">Lịch Sử</span>
              <span className="md:hidden">Lịch sử</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="extract" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5" />
                  Chọn Cookies
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {cookiesLoading ? (
                  <div className="text-center py-4">Đang tải...</div>
                ) : (
                  <>
                    <div className="flex items-center space-x-2 mb-4">
                      <Checkbox
                        id="select-all"
                        checked={selectedCookies.length === (cookies as ShopeeCookie[])?.length}
                        onCheckedChange={handleSelectAllCookies}
                        data-testid="checkbox-select-all"
                      />
                      <Label htmlFor="select-all" className="text-sm md:text-base">
                        Chọn tất cả ({selectedCookies.length}/{(cookies as ShopeeCookie[])?.length || 0})
                      </Label>
                    </div>
                    
                    <ScrollArea className="h-[200px] border rounded-md p-3 md:p-4">
                      {(cookies as ShopeeCookie[])?.map((cookie) => (
                        <div key={cookie.id} className="flex items-center space-x-2 mb-2">
                          <Checkbox
                            id={cookie.id}
                            checked={selectedCookies.includes(cookie.id)}
                            onCheckedChange={() => toggleCookieSelection(cookie.id)}
                            data-testid={`checkbox-cookie-${cookie.id}`}
                          />
                          <Label htmlFor={cookie.id} className="flex-1 cursor-pointer">
                            <div className="text-xs md:text-sm">
                              <span className="font-medium">{cookie.cookieType}</span>
                              <span className="text-gray-500 ml-2 break-all">
                                {isMobile ? cookie.cookiePreview.substring(0, 20) : cookie.cookiePreview.substring(0, 30)}...
                              </span>
                            </div>
                          </Label>
                        </div>
                      ))}
                    </ScrollArea>
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="proxy-list" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Danh Sách Proxy (tùy chọn)
                  </Label>
                  <Textarea
                    id="proxy-list"
                    placeholder="socks5://user:pass@ip:port&#10;http://user:pass@ip:port&#10;..."
                    value={proxyList}
                    onChange={(e) => setProxyList(e.target.value)}
                    rows={4}
                    className="font-mono text-xs md:text-sm"
                    data-testid="textarea-proxy-list"
                  />
                  <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
                    Mỗi proxy một dòng. Hỗ trợ: socks5, socks4, http
                  </p>
                </div>

                <Button
                  onClick={handleExtract}
                  disabled={isExtracting || selectedCookies.length === 0}
                  className="w-full"
                  data-testid="button-extract"
                >
                  {isExtracting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Đang trích xuất...
                    </>
                  ) : (
                    `Bắt Đầu Trích Xuất (${(selectedCookies.length * spcFExtractPrice).toLocaleString('vi-VN')}đ)`
                  )}
                </Button>
              </CardContent>
            </Card>

            {extractResults.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      Kết Quả Trích Xuất
                    </CardTitle>
                    <Button
                      onClick={() => exportResults(extractResults)}
                      variant="outline"
                      size="sm"
                      data-testid="button-export-results"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Xuất File
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0 md:p-6">
                  {isMobile ? (
                    <div className="space-y-3 p-4">
                      {extractResults.map((result, index) => (
                        <Card key={index} className="border shadow-sm">
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">Username</span>
                              <Badge variant={result.status && result.spcF ? "default" : "destructive"}>
                                {result.status && result.spcF ? "Thành công" : "Thất bại"}
                              </Badge>
                            </div>
                            <p className="font-medium text-sm">{result.username || 'N/A'}</p>
                            
                            <Separator />
                            
                            <div>
                              <span className="text-xs text-gray-500">SPC_F</span>
                              <div className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded border text-xs font-mono break-all">
                                {result.spcF ? result.spcF.substring(0, 50) + '...' : 'Không có'}
                              </div>
                            </div>

                            {result.proxy && (
                              <div>
                                <span className="text-xs text-gray-500">Proxy</span>
                                <p className="text-xs font-mono mt-1">{result.proxy}</p>
                              </div>
                            )}
                            
                            {result.spcF && (
                              <Button
                                onClick={() => copyToClipboard(`${result.username || 'Unknown'}|${result.spcF}|${result.spcSt}`)}
                                variant="outline"
                                size="sm"
                                className="w-full mt-2"
                                data-testid={`button-copy-${index}`}
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                Sao chép
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Username</TableHead>
                            <TableHead>SPC_F</TableHead>
                            <TableHead>Proxy</TableHead>
                            <TableHead>Trạng Thái</TableHead>
                            <TableHead>Thao Tác</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {extractResults.map((result, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">
                                {result.username || 'N/A'}
                              </TableCell>
                              <TableCell className="max-w-xs truncate">
                                {result.spcF ? (
                                  <code className="text-xs">{result.spcF.substring(0, 40)}...</code>
                                ) : (
                                  <span className="text-gray-400">Không có</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs font-mono">
                                {result.proxy || '-'}
                              </TableCell>
                              <TableCell>
                                <Badge variant={result.status && result.spcF ? "default" : "destructive"}>
                                  {result.status && result.spcF ? "Thành công" : "Thất bại"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {result.spcF && (
                                  <Button
                                    onClick={() => copyToClipboard(`${result.username || 'Unknown'}|${result.spcF}|${result.spcSt}`)}
                                    variant="ghost"
                                    size="sm"
                                    data-testid={`button-copy-${index}`}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="bulk" className="space-y-6">
            <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
              <CardHeader className="border-b border-gray-100 dark:border-gray-700">
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-blue-600" />
                  Nhập danh sách Cookie SPC_ST
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="bulkCookieText" className="text-sm font-medium">
                      Danh sách Cookie SPC_ST (format: cookie|proxy hoặc chỉ cookie)
                    </Label>
                    <Textarea
                      id="bulkCookieText"
                      placeholder={`SPC_ST=abc123...|1.2.3.4:8080:user:pass
SPC_ST=def456...|5.6.7.8:8080:user2:pass2
SPC_ST=ghi789...
(Nếu không có proxy thì sẽ dùng HTTP proxy từ database)`}
                      className="mt-2 h-40 font-mono text-sm"
                      value={bulkCookieText}
                      onChange={(e) => setBulkCookieText(e.target.value)}
                      data-testid="textarea-bulk-cookie"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Globe className="h-4 w-4" />
                    <span>Cookie thành công sẽ tự động thêm vào quản lý cookie</span>
                  </div>
                  <Button
                    onClick={handleBulkExtract}
                    disabled={isBulkExtracting || !bulkCookieText.trim()}
                    className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                    data-testid="button-bulk-extract"
                  >
                    {isBulkExtracting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Đang trích xuất...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Bắt đầu trích xuất ({parseBulkCookieText(bulkCookieText).length}) - {(parseBulkCookieText(bulkCookieText).length * spcFExtractPrice).toLocaleString('vi-VN')}đ
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {bulkExtractResults.length > 0 && (
              <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
                <CardHeader className="border-b border-gray-100 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                      Kết quả Trích xuất form
                    </CardTitle>
                    <Button
                      onClick={() => exportResults(bulkExtractResults)}
                      variant="outline"
                      size="sm"
                      data-testid="button-export-bulk-results"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Xuất File
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0 md:p-6">
                  {isMobile ? (
                    <div className="space-y-3 p-4">
                      {bulkExtractResults.map((result, index) => (
                        <Card key={index} className="border shadow-sm">
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">#{index + 1}</span>
                              <Badge variant={result.status && result.spcF ? "default" : "destructive"}>
                                {result.status && result.spcF ? "Thành công" : "Thất bại"}
                              </Badge>
                            </div>

                            <div>
                              <span className="text-xs text-gray-500">Username</span>
                              <p className="font-medium text-sm mt-1">{result.username || '-'}</p>
                            </div>
                            
                            <Separator />
                            
                            <div>
                              <span className="text-xs text-gray-500">SPC_ST Preview</span>
                              <div className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded border text-xs font-mono break-all">
                                {result.spcSt.substring(0, 40)}...
                              </div>
                            </div>

                            <div>
                              <span className="text-xs text-gray-500">SPC_F</span>
                              <div className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded border text-xs font-mono break-all">
                                {result.spcF ? result.spcF.substring(0, 50) + '...' : 'Không có'}
                              </div>
                            </div>

                            {result.proxy && (
                              <div>
                                <span className="text-xs text-gray-500">Proxy</span>
                                <p className="text-xs font-mono mt-1">{result.proxy}</p>
                              </div>
                            )}

                            <div>
                              <span className="text-xs text-gray-500">Thông báo</span>
                              <p className={`text-xs mt-1 ${result.status && result.spcF ? 'text-green-600' : 'text-red-600'}`}>
                                {result.status && result.spcF ? 'Success' : result.message}
                              </p>
                            </div>
                            
                            {result.spcF && (
                              <Button
                                onClick={() => copyToClipboard(`${result.username || 'Unknown'}|${result.spcF}|${result.spcSt}`)}
                                variant="outline"
                                size="sm"
                                className="w-full mt-2"
                                data-testid={`button-copy-bulk-${index}`}
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                Sao chép
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <ScrollArea className="h-96">
                      <Table>
                        <TableHeader className="bg-gray-50 dark:bg-slate-900/50 sticky top-0">
                          <TableRow>
                            <TableHead className="font-semibold">SPC_ST Preview</TableHead>
                            <TableHead className="font-semibold">Username</TableHead>
                            <TableHead className="font-semibold">SPC_F</TableHead>
                            <TableHead className="font-semibold">Trạng thái</TableHead>
                            <TableHead className="font-semibold">Proxy</TableHead>
                            <TableHead className="font-semibold">Thông báo</TableHead>
                            <TableHead className="font-semibold">Thao tác</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bulkExtractResults.map((result, index) => (
                            <TableRow key={index} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                              <TableCell className="font-mono text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.spcSt)}>
                                {result.spcSt.substring(0, 20)}...
                              </TableCell>
                              <TableCell className="font-medium cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.username || '-')}>
                                {result.username || '-'}
                              </TableCell>
                              <TableCell className="max-w-xs truncate cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => result.spcF && copyToClipboard(result.spcF)}>
                                {result.spcF ? (
                                  <code className="text-xs">{result.spcF.substring(0, 30)}...</code>
                                ) : (
                                  <span className="text-gray-400">Không có</span>
                                )}
                              </TableCell>
                              <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.status && result.spcF ? 'Thành công' : 'Thất bại')}>
                                <Badge variant={result.status && result.spcF ? "default" : "destructive"}>
                                  {result.status && result.spcF ? "Thành công" : "Thất bại"}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.proxy || 'System')}>
                                {result.proxy || 'System'}
                              </TableCell>
                              <TableCell className="max-w-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.status && result.spcF ? 'Success' : result.message)}>
                                <div className="truncate" title={result.message}>
                                  <span className={result.status && result.spcF ? "text-green-600" : "text-red-600"}>
                                    {result.status && result.spcF ? 'Success' : result.message}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {result.spcF && (
                                  <Button
                                    onClick={() => copyToClipboard(`${result.username || 'Unknown'}|${result.spcF}|${result.spcSt}`)}
                                    variant="ghost"
                                    size="sm"
                                    data-testid={`button-copy-bulk-${index}`}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Lịch Sử Trích Xuất {selectedHistoryIds.length > 0 && `(${selectedHistoryIds.length} đã chọn)`}
                  </CardTitle>
                  {selectedHistoryIds.length > 0 && (
                    <Button
                      onClick={exportSelectedHistory}
                      variant="outline"
                      size="sm"
                      data-testid="button-export-history"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Xuất File
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="text-center py-4">Đang tải...</div>
                ) : (
                  <>
                    <div className="mb-4 space-y-4">
                      <Input
                        placeholder="Tìm kiếm theo username, SPC_ST, SPC_F..."
                        value={historySearchTerm}
                        onChange={(e) => {
                          setHistorySearchTerm(e.target.value);
                          setHistoryPage(1);
                        }}
                        className="w-full"
                        data-testid="input-history-search"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs md:text-sm text-gray-600 dark:text-gray-400">Hiển thị:</span>
                        <Button
                          variant={historyItemsPerPage === 10 ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            setHistoryItemsPerPage(10);
                            setHistoryPage(1);
                          }}
                        >
                          10
                        </Button>
                        <Button
                          variant={historyItemsPerPage === 20 ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            setHistoryItemsPerPage(20);
                            setHistoryPage(1);
                          }}
                        >
                          20
                        </Button>
                        <Button
                          variant={historyItemsPerPage === 50 ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            setHistoryItemsPerPage(50);
                            setHistoryPage(1);
                          }}
                        >
                          50
                        </Button>
                      </div>
                    </div>
                    
                    {isMobile ? (
                      <>
                        <div className="mb-3 flex items-center gap-2">
                          <Checkbox
                            id="select-all-history-mobile"
                            checked={
                              paginatedHistory.filter(item => item.status && item.spcF).length > 0 &&
                              paginatedHistory.filter(item => item.status && item.spcF).every(item => selectedHistoryIds.includes(item.id))
                            }
                            onCheckedChange={handleSelectAllHistory}
                            data-testid="checkbox-select-all-history-mobile"
                          />
                          <Label htmlFor="select-all-history-mobile" className="text-sm">
                            Chọn tất cả ({selectedHistoryIds.length}/{paginatedHistory.filter(item => item.status && item.spcF).length})
                          </Label>
                        </div>
                        <div className="space-y-3">
                          {paginatedHistory.map((item) => (
                            <Card key={item.id} className="border shadow-sm">
                              <CardContent className="p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {item.status && item.spcF && (
                                      <Checkbox
                                        id={`history-mobile-${item.id}`}
                                        checked={selectedHistoryIds.includes(item.id)}
                                        onCheckedChange={() => toggleHistorySelection(item.id)}
                                        data-testid={`checkbox-history-${item.id}`}
                                      />
                                    )}
                                    <span className="text-xs text-gray-500">
                                      {new Date(item.createdAt).toLocaleString('vi-VN', { 
                                        month: 'short', 
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                  </div>
                                  <Badge variant={item.status && item.spcF ? "default" : "destructive"}>
                                    {item.status && item.spcF ? "Thành công" : "Thất bại"}
                                  </Badge>
                                </div>

                                <div>
                                  <span className="text-xs text-gray-500">Username</span>
                                  <p className="font-medium text-sm mt-1">{item.username || 'N/A'}</p>
                                </div>
                                
                                <Separator />
                                
                                <div>
                                  <span className="text-xs text-gray-500">SPC_ST</span>
                                  <div className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded border text-xs font-mono break-all">
                                    {item.spcSt.substring(0, 30)}...
                                  </div>
                                </div>

                                <div>
                                  <span className="text-xs text-gray-500">SPC_F</span>
                                  <div className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded border text-xs font-mono break-all">
                                    {item.spcF ? item.spcF.substring(0, 40) + '...' : 'Không có'}
                                  </div>
                                </div>

                                {item.proxy && (
                                  <div>
                                    <span className="text-xs text-gray-500">Proxy</span>
                                    <p className="text-xs font-mono mt-1">{item.proxy}</p>
                                  </div>
                                )}

                                <div>
                                  <span className="text-xs text-gray-500">Thông báo</span>
                                  <p className={`text-xs mt-1 ${item.status && item.spcF ? 'text-green-600' : 'text-red-600'}`}>
                                    {item.message}
                                  </p>
                                </div>
                                
                                {item.spcF && (
                                  <Button
                                    onClick={() => copyToClipboard(`${item.username || 'Unknown'}|${item.spcF}|${item.spcSt}`)}
                                    variant="outline"
                                    size="sm"
                                    className="w-full mt-2"
                                    data-testid={`button-copy-history-${item.id}`}
                                  >
                                    <Copy className="h-4 w-4 mr-2" />
                                    Sao chép
                                  </Button>
                                )}
                              </CardContent>
                            </Card>
                          ))}
                        </div>

                        {totalPages > 1 && (
                          <div className="flex items-center justify-between mt-4 gap-2">
                            <Button
                              onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                              disabled={historyPage === 1}
                              variant="outline"
                              size="sm"
                              data-testid="button-prev-page"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-xs text-gray-600 dark:text-gray-400 text-center">
                              {historyPage} / {totalPages}
                            </span>
                            <Button
                              onClick={() => setHistoryPage(prev => Math.min(totalPages, prev + 1))}
                              disabled={historyPage === totalPages}
                              variant="outline"
                              size="sm"
                              data-testid="button-next-page"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <ScrollArea className="h-[500px]">
                          <Table>
                            <TableHeader className="bg-gray-50 dark:bg-slate-900/50 sticky top-0">
                              <TableRow>
                                <TableHead className="w-[50px]">
                                  <Checkbox
                                    id="select-all-history"
                                    checked={
                                      paginatedHistory.filter(item => item.status && item.spcF).length > 0 &&
                                      paginatedHistory.filter(item => item.status && item.spcF).every(item => selectedHistoryIds.includes(item.id))
                                    }
                                    onCheckedChange={handleSelectAllHistory}
                                    data-testid="checkbox-select-all-history"
                                  />
                                </TableHead>
                                <TableHead className="font-semibold">Thời Gian</TableHead>
                                <TableHead className="font-semibold">Username</TableHead>
                                <TableHead className="font-semibold">SPC_ST (20 ký tự)</TableHead>
                                <TableHead className="font-semibold">SPC_F</TableHead>
                                <TableHead className="font-semibold">Proxy</TableHead>
                                <TableHead className="font-semibold">Trạng Thái</TableHead>
                                <TableHead className="font-semibold">Thông Báo</TableHead>
                                <TableHead className="font-semibold">Thao Tác</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paginatedHistory.map((item) => (
                                <TableRow key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                                  <TableCell>
                                    {item.status && item.spcF && (
                                      <Checkbox
                                        id={`history-${item.id}`}
                                        checked={selectedHistoryIds.includes(item.id)}
                                        onCheckedChange={() => toggleHistorySelection(item.id)}
                                        data-testid={`checkbox-history-desktop-${item.id}`}
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell 
                                    className="text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" 
                                    onClick={() => copyToClipboard(new Date(item.createdAt).toLocaleString('vi-VN'))}
                                  >
                                    {new Date(item.createdAt).toLocaleString('vi-VN')}
                                  </TableCell>
                                  <TableCell 
                                    className="font-medium cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" 
                                    onClick={() => copyToClipboard(item.username || 'N/A')}
                                  >
                                    {item.username || 'N/A'}
                                  </TableCell>
                                  <TableCell 
                                    className="font-mono text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" 
                                    onClick={() => copyToClipboard(item.spcSt)}
                                  >
                                    {item.spcSt.substring(0, 20)}...
                                  </TableCell>
                                  <TableCell 
                                    className="max-w-xs truncate cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" 
                                    onClick={() => item.spcF && copyToClipboard(item.spcF)}
                                  >
                                    {item.spcF ? (
                                      <code className="text-xs">{item.spcF.substring(0, 30)}...</code>
                                    ) : (
                                      <span className="text-gray-400">Không có</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono">
                                    {item.proxy || '-'}
                                  </TableCell>
                                  <TableCell 
                                    className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" 
                                    onClick={() => copyToClipboard(item.status && item.spcF ? 'Thành công' : 'Thất bại')}
                                  >
                                    <Badge variant={item.status && item.spcF ? "default" : "destructive"}>
                                      {item.status && item.spcF ? "Thành công" : "Thất bại"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell 
                                    className="max-w-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" 
                                    onClick={() => copyToClipboard(item.message)}
                                  >
                                    <div className="truncate" title={item.message}>
                                      <span className={item.status && item.spcF ? "text-green-600" : "text-red-600"}>
                                        {item.message}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    {item.spcF && (
                                      <Button
                                        onClick={() => copyToClipboard(`${item.username || 'Unknown'}|${item.spcF}|${item.spcSt}`)}
                                        variant="ghost"
                                        size="sm"
                                        data-testid={`button-copy-history-${item.id}`}
                                      >
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>

                        {totalPages > 1 && (
                          <div className="flex items-center justify-between mt-4">
                            <Button
                              onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                              disabled={historyPage === 1}
                              variant="outline"
                              size="sm"
                              data-testid="button-prev-page"
                            >
                              <ChevronLeft className="h-4 w-4" />
                              Trước
                            </Button>
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              Trang {historyPage} / {totalPages} (Tổng: {filteredHistory.length})
                            </span>
                            <Button
                              onClick={() => setHistoryPage(prev => Math.min(totalPages, prev + 1))}
                              disabled={historyPage === totalPages}
                              variant="outline"
                              size="sm"
                              data-testid="button-next-page"
                            >
                              Sau
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
