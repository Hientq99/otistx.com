import { useState, useRef } from "react";
import { FixedHeader } from "@/components/fixed-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Mail, 
  Upload, 
  FileText, 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Shield,
  Copy,
  Download,
  History,
  Pause,
  AlertTriangle,
  Trash2,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  Calendar
} from "lucide-react";

interface EmailAdditionResult {
  cookieId: string;
  email: string;
  status: boolean;
  message: string;
  proxy?: string;
}

interface EmailAdditionHistory {
  id: number;
  cookieId: string;
  cookiePreview: string;
  email: string;
  status: boolean;
  message: string;
  proxy?: string;
  createdAt: string;
}

interface EmailEntry {
  cookie: string;
  email: string;
  proxy?: string;
  index: number;
}

export default function AddEmail() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State management
  const [inputText, setInputText] = useState("");
  const [parsedEntries, setParsedEntries] = useState<EmailEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<EmailAdditionResult[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  
  // Results filtering and selection
  const [selectedResults, setSelectedResults] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState("");
  
  // History filtering and pagination
  const [selectedHistory, setSelectedHistory] = useState<number[]>([]);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historyDateFilter, setHistoryDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'>('all');
  const [historyDateRange, setHistoryDateRange] = useState<{start: string, end: string}>({start: '', end: ''});
  const [historyPage, setHistoryPage] = useState(1);
  const [historyItemsPerPage, setHistoryItemsPerPage] = useState(10);

  // Fetch email addition history
  const { data: emailHistory = [], isLoading: historyLoading } = useQuery<EmailAdditionHistory[]>({
    queryKey: ["/api/email-additions"],
  });

  // Bulk email addition mutation
  const emailAdditionMutation = useMutation({
    mutationFn: async (data: { entries: EmailEntry[] }) => {
      return await apiRequest({
        url: "/api/email-additions/bulk",
        method: "POST",
        body: data
      });
    },
    onSuccess: (data) => {
      setResults(data);
      setIsProcessing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/email-additions"] });
      toast({
        title: "Hoàn thành!",
        description: `Đã xử lý ${data.length} yêu cầu thêm email`,
      });
    },
    onError: (error: Error) => {
      setIsProcessing(false);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể thực hiện bulk email addition",
        variant: "destructive",
      });
    }
  });

  // Parse input text
  const parseInputText = (text: string): EmailEntry[] => {
    const lines = text.trim().split('\n').filter(line => line.trim());
    const entries: EmailEntry[] = [];
    
    lines.forEach((line, index) => {
      const parts = line.trim().split('|');
      if (parts.length >= 2) {
        entries.push({
          cookie: parts[0].trim(),
          email: parts[1].trim(),
          proxy: parts[2]?.trim() || undefined,
          index: index
        });
      }
    });
    
    return entries;
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setInputText(text);
      const parsed = parseInputText(text);
      setParsedEntries(parsed);
      toast({
        title: "File đã được tải lên!",
        description: `Phát hiện ${parsed.length} mục cần xử lý`,
      });
    };
    reader.readAsText(file);
  };

  // Handle text input change
  const handleTextChange = (text: string) => {
    setInputText(text);
    const parsed = parseInputText(text);
    setParsedEntries(parsed);
  };

  // Start processing
  const handleStartProcessing = () => {
    if (parsedEntries.length === 0) {
      toast({
        title: "Thông báo",
        description: "Vui lòng nhập dữ liệu để xử lý",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setCurrentIndex(0);
    setResults([]);
    setIsPaused(false);
    
    emailAdditionMutation.mutate({ entries: parsedEntries });
  };

  // Filter results based on status and search query
  const filteredResults = results.filter(result => {
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'success' && result.status) ||
      (statusFilter === 'failed' && !result.status);
    
    const matchesSearch = !searchQuery || 
      result.cookieId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      result.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      result.message.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesStatus && matchesSearch;
  });

  // Selection handlers
  const toggleSelectResult = (cookieId: string) => {
    setSelectedResults(prev => 
      prev.includes(cookieId) 
        ? prev.filter(id => id !== cookieId)
        : [...prev, cookieId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedResults.length === filteredResults.length) {
      setSelectedResults([]);
    } else {
      setSelectedResults(filteredResults.map(result => result.cookieId));
    }
  };

  // Copy selected results
  const copySelectedResults = () => {
    const selectedData = filteredResults.filter(result => 
      selectedResults.includes(result.cookieId)
    );
    
    const copyText = selectedData.map(result => 
      `${result.cookieId}\t${result.email}\t${result.status ? 'Thành công' : 'Thất bại'}\t${result.message}\t${result.proxy || ''}`
    ).join('\n');
    
    navigator.clipboard.writeText(copyText).then(() => {
      toast({
        title: "Đã copy!",
        description: `Đã copy ${selectedData.length} kết quả`,
      });
    });
  };

  // Delete selected results
  const deleteSelectedResults = () => {
    const remainingResults = results.filter(result => 
      !selectedResults.includes(result.cookieId)
    );
    setResults(remainingResults);
    setSelectedResults([]);
    
    toast({
      title: "Đã xóa!",
      description: `Đã xóa ${selectedResults.length} kết quả`,
    });
  };

  // Date filtering helpers
  const getDateFilterRange = (filter: string, customRange?: {start: string, end: string}) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (filter) {
      case 'today':
        return { start: today, end: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
      case 'yesterday':
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        return { start: yesterday, end: today };
      case 'week':
        const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { start: weekStart, end: now };
      case 'month':
        const monthStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { start: monthStart, end: now };
      case 'custom':
        if (customRange?.start && customRange?.end) {
          return {
            start: new Date(customRange.start),
            end: new Date(new Date(customRange.end).getTime() + 24 * 60 * 60 * 1000)
          };
        }
        return null;
      default:
        return null;
    }
  };

  // Filter email history
  const filteredEmailHistory = emailHistory.filter(item => {
    const matchesStatus = historyStatusFilter === 'all' || 
      (historyStatusFilter === 'success' && item.status) ||
      (historyStatusFilter === 'failed' && !item.status);
    
    const matchesSearch = !historySearchQuery || 
      item.cookieId.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      item.email.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      item.message.toLowerCase().includes(historySearchQuery.toLowerCase());
    
    const dateRange = getDateFilterRange(historyDateFilter, historyDateRange);
    const matchesDate = !dateRange || 
      (new Date(item.createdAt) >= dateRange.start && new Date(item.createdAt) < dateRange.end);
    
    return matchesStatus && matchesSearch && matchesDate;
  })
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Sort newest first

  // Paginate history
  const totalHistoryPages = Math.ceil(filteredEmailHistory.length / historyItemsPerPage);
  const paginatedHistory = filteredEmailHistory.slice(
    (historyPage - 1) * historyItemsPerPage,
    historyPage * historyItemsPerPage
  );

  // History selection handlers
  const toggleSelectHistory = (id: number) => {
    setSelectedHistory(prev => 
      prev.includes(id) 
        ? prev.filter(historyId => historyId !== id)
        : [...prev, id]
    );
  };

  const toggleSelectAllHistory = () => {
    if (selectedHistory.length === paginatedHistory.length) {
      setSelectedHistory([]);
    } else {
      setSelectedHistory(paginatedHistory.map(item => item.id));
    }
  };

  // Export history
  const exportHistory = (selectedOnly = false) => {
    const dataToExport = selectedOnly 
      ? filteredEmailHistory.filter(item => selectedHistory.includes(item.id))
      : filteredEmailHistory;
    
    const csvContent = [
      ['Cookie', 'Email', 'Trạng thái', 'Thông báo', 'Proxy', 'Thời gian'].join(','),
      ...dataToExport.map(item => [
        item.cookiePreview,
        item.email,
        item.status ? 'Thành công' : 'Thất bại',
        `"${item.message}"`,
        item.proxy || '',
        new Date(item.createdAt).toLocaleString('vi-VN')
      ].join(','))
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `email_addition_history_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    toast({
      title: "Xuất file thành công!",
      description: `Đã xuất ${dataToExport.length} bản ghi lịch sử`,
    });
  };

  // Export results (all or selected)
  const exportResults = (selectedOnly = false) => {
    const dataToExport = selectedOnly 
      ? filteredResults.filter(result => selectedResults.includes(result.cookieId))
      : filteredResults;
    
    const csvContent = [
      ['Cookie ID', 'Email', 'Trạng thái', 'Thông báo', 'Proxy'].join(','),
      ...dataToExport.map(result => [
        result.cookieId,
        result.email,
        result.status ? 'Thành công' : 'Thất bại',
        `"${result.message}"`,
        result.proxy || ''
      ].join(','))
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `email_addition_results_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    toast({
      title: "Xuất file thành công!",
      description: `Đã xuất ${dataToExport.length} kết quả`,
    });
  };

  const progressPercentage = parsedEntries.length > 0 ? (currentIndex / parsedEntries.length) * 100 : 0;

  return (
    <>
      <FixedHeader />
      <main className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 pt-16">
        <div className="container mx-auto px-4 py-8">
          {/* Professional Header */}
          <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg rounded-lg border border-orange-200/50 dark:border-gray-700/50 p-6 mb-8 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg shadow-lg">
                  <Mail className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    Thêm Email Vào Tài Khoản Shopee
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    Bulk thêm email với định dạng: cookie|email|proxy (proxy tùy chọn)
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  100 VND
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  mỗi email thành công
                </div>
              </div>
            </div>
          </div>

          <Tabs defaultValue="bulk-add" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="bulk-add" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Thêm Email Hàng Loạt
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Lịch Sử Thêm Email
              </TabsTrigger>
            </TabsList>

            {/* Bulk Add Tab */}
            <TabsContent value="bulk-add" className="space-y-6">
              {/* Input Section */}
              <Card className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-orange-200/50 dark:border-gray-700/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Nhập Dữ Liệu
                  </CardTitle>
                  <CardDescription>
                    Định dạng: cookie|email|proxy (mỗi dòng một mục, proxy có thể bỏ trống)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* File Upload */}
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Tải file lên
                    </Button>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      hoặc dán trực tiếp vào ô bên dưới
                    </span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  {/* Text Input */}
                  <div className="space-y-2">
                    <Label htmlFor="input-text">Dữ liệu Email</Label>
                    <Textarea
                      id="input-text"
                      placeholder="SPC_ST=abc123...|user@example.com|proxy1&#10;SPC_ST=def456...|user2@example.com|&#10;SPC_ST=ghi789...|user3@example.com|proxy3"
                      value={inputText}
                      onChange={(e) => handleTextChange(e.target.value)}
                      className="min-h-32 font-mono text-sm"
                    />
                  </div>

                  {/* Parsed Preview */}
                  {parsedEntries.length > 0 && (
                    <div className="space-y-2">
                      <Label>Xem trước ({parsedEntries.length} mục)</Label>
                      <ScrollArea className="h-32 w-full border rounded-md p-2">
                        <div className="space-y-1">
                          {parsedEntries.slice(0, 10).map((entry, index) => (
                            <div key={index} className="text-sm font-mono bg-gray-50 dark:bg-gray-800 p-2 rounded">
                              <span className="text-blue-600 dark:text-blue-400">Cookie:</span> {entry.cookie.substring(0, 20)}...
                              <span className="ml-4 text-green-600 dark:text-green-400">Email:</span> {entry.email}
                              {entry.proxy && <span className="ml-4 text-purple-600 dark:text-purple-400">Proxy:</span>}
                              {entry.proxy && <span> {entry.proxy}</span>}
                            </div>
                          ))}
                          {parsedEntries.length > 10 && (
                            <div className="text-sm text-gray-600 dark:text-gray-400 text-center">
                              ... và {parsedEntries.length - 10} mục khác
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-4">
                    <Button
                      onClick={handleStartProcessing}
                      disabled={isProcessing || parsedEntries.length === 0}
                      className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      {isProcessing ? "Đang xử lý..." : "Bắt đầu xử lý"}
                    </Button>
                    
                    {results.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() => exportResults(false)}
                          className="flex items-center gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Xuất tất cả ({filteredResults.length})
                        </Button>
                        {selectedResults.length > 0 && (
                          <>
                            <Button
                              variant="outline"
                              onClick={() => exportResults(true)}
                              className="flex items-center gap-2"
                            >
                              <Download className="h-4 w-4" />
                              Xuất đã chọn ({selectedResults.length})
                            </Button>
                            <Button
                              variant="outline"
                              onClick={copySelectedResults}
                              className="flex items-center gap-2"
                            >
                              <Copy className="h-4 w-4" />
                              Copy ({selectedResults.length})
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={deleteSelectedResults}
                              className="flex items-center gap-2"
                            >
                              <Trash2 className="h-4 w-4" />
                              Xóa ({selectedResults.length})
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Progress Section */}
              {isProcessing && (
                <Card className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-orange-200/50 dark:border-gray-700/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Tiến Độ Xử Lý
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Đang xử lý: {currentIndex + 1} / {parsedEntries.length}</span>
                        <span>{Math.round(progressPercentage)}%</span>
                      </div>
                      <Progress value={progressPercentage} className="w-full" />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Results Section */}
              {results.length > 0 && (
                <Card className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-orange-200/50 dark:border-gray-700/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5" />
                        Kết Quả Xử Lý ({filteredResults.length}/{results.length})
                      </CardTitle>
                      
                      {/* Filter and Search Controls */}
                      <div className="flex items-center gap-4">
                        {/* Status Filter */}
                        <div className="flex items-center gap-2">
                          <Filter className="h-4 w-4" />
                          <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'success' | 'failed')}
                            className="px-3 py-1 border rounded-md bg-white dark:bg-gray-800 text-sm"
                          >
                            <option value="all">Tất cả</option>
                            <option value="success">Thành công</option>
                            <option value="failed">Thất bại</option>
                          </select>
                        </div>
                        
                        {/* Search */}
                        <div className="flex items-center gap-2">
                          <Search className="h-4 w-4" />
                          <Input
                            placeholder="Tìm kiếm..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-40"
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    {selectedResults.length > 0 && (
                      <div className="flex items-center gap-2 mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                        <span className="text-sm font-medium">
                          Đã chọn {selectedResults.length} mục:
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={copySelectedResults}
                          className="flex items-center gap-1"
                        >
                          <Copy className="h-3 w-3" />
                          Copy
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => exportResults(true)}
                          className="flex items-center gap-1"
                        >
                          <Download className="h-3 w-3" />
                          Xuất Excel
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={deleteSelectedResults}
                          className="flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" />
                          Xóa
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-96 w-full">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">
                              <div className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={selectedResults.length === filteredResults.length && filteredResults.length > 0}
                                  onChange={toggleSelectAll}
                                  className="rounded border-gray-300"
                                />
                              </div>
                            </TableHead>
                            <TableHead>Cookie ID</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Trạng thái</TableHead>
                            <TableHead>Thông báo</TableHead>
                            <TableHead>Proxy</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredResults.map((result, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={selectedResults.includes(result.cookieId)}
                                  onChange={() => toggleSelectResult(result.cookieId)}
                                  className="rounded border-gray-300"
                                />
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {result.cookieId}
                              </TableCell>
                              <TableCell>{result.email}</TableCell>
                              <TableCell>
                                <Badge variant={result.status ? "default" : "destructive"}>
                                  {result.status ? (
                                    <>
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Thành công
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="h-3 w-3 mr-1" />
                                      Thất bại
                                    </>
                                  )}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-xs truncate">
                                {result.message}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {result.proxy || "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                    
                    {/* Bottom Action Bar */}
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Hiển thị {filteredResults.length} / {results.length} kết quả
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() => exportResults(false)}
                          className="flex items-center gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Xuất tất cả Excel
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="space-y-6">
              <Card className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-orange-200/50 dark:border-gray-700/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <History className="h-5 w-5" />
                      Lịch Sử Thêm Email ({filteredEmailHistory.length}/{emailHistory.length})
                    </CardTitle>
                    
                    {/* Filter Controls */}
                    <div className="flex items-center gap-4">
                      {/* Date Filter */}
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <select
                          value={historyDateFilter}
                          onChange={(e) => {
                            setHistoryDateFilter(e.target.value as any);
                            setHistoryPage(1);
                          }}
                          className="px-3 py-1 border rounded-md bg-white dark:bg-gray-800 text-sm"
                        >
                          <option value="all">Tất cả</option>
                          <option value="today">Hôm nay</option>
                          <option value="yesterday">Hôm qua</option>
                          <option value="week">7 ngày qua</option>
                          <option value="month">30 ngày qua</option>
                          <option value="custom">Tùy chọn</option>
                        </select>
                      </div>
                      
                      {/* Custom Date Range */}
                      {historyDateFilter === 'custom' && (
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={historyDateRange.start}
                            onChange={(e) => setHistoryDateRange(prev => ({...prev, start: e.target.value}))}
                            className="px-2 py-1 border rounded text-sm"
                          />
                          <span>-</span>
                          <input
                            type="date"
                            value={historyDateRange.end}
                            onChange={(e) => setHistoryDateRange(prev => ({...prev, end: e.target.value}))}
                            className="px-2 py-1 border rounded text-sm"
                          />
                        </div>
                      )}
                      
                      {/* Status Filter */}
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        <select
                          value={historyStatusFilter}
                          onChange={(e) => {
                            setHistoryStatusFilter(e.target.value as any);
                            setHistoryPage(1);
                          }}
                          className="px-3 py-1 border rounded-md bg-white dark:bg-gray-800 text-sm"
                        >
                          <option value="all">Tất cả</option>
                          <option value="success">Thành công</option>
                          <option value="failed">Thất bại</option>
                        </select>
                      </div>
                      
                      {/* Search */}
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4" />
                        <Input
                          placeholder="Tìm kiếm..."
                          value={historySearchQuery}
                          onChange={(e) => {
                            setHistorySearchQuery(e.target.value);
                            setHistoryPage(1);
                          }}
                          className="w-40"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Selection Action Bar */}
                  {selectedHistory.length > 0 && (
                    <div className="flex items-center gap-2 mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <span className="text-sm font-medium">
                        Đã chọn {selectedHistory.length} mục:
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportHistory(true)}
                        className="flex items-center gap-1"
                      >
                        <Download className="h-3 w-3" />
                        Xuất Excel
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {historyLoading ? (
                    <div className="space-y-3">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-700 h-12 rounded"></div>
                      ))}
                    </div>
                  ) : filteredEmailHistory.length === 0 ? (
                    <div className="text-center py-8">
                      <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 dark:text-gray-400">
                        {emailHistory.length === 0 ? "Chưa có lịch sử thêm email nào" : "Không tìm thấy kết quả phù hợp"}
                      </p>
                    </div>
                  ) : (
                    <>
                      <ScrollArea className="h-96 w-full">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">
                                <div className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={selectedHistory.length === paginatedHistory.length && paginatedHistory.length > 0}
                                    onChange={toggleSelectAllHistory}
                                    className="rounded border-gray-300"
                                  />
                                </div>
                              </TableHead>
                              <TableHead>Cookie</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Trạng thái</TableHead>
                              <TableHead>Thông báo</TableHead>
                              <TableHead>Proxy</TableHead>
                              <TableHead>Thời gian</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedHistory.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell>
                                  <input
                                    type="checkbox"
                                    checked={selectedHistory.includes(item.id)}
                                    onChange={() => toggleSelectHistory(item.id)}
                                    className="rounded border-gray-300"
                                  />
                                </TableCell>
                                <TableCell className="font-mono text-sm max-w-24 truncate">
                                  {item.cookiePreview}
                                </TableCell>
                                <TableCell>{item.email}</TableCell>
                                <TableCell>
                                  <Badge variant={item.status ? "default" : "destructive"}>
                                    {item.status ? (
                                      <>
                                        <CheckCircle className="h-3 w-3 mr-1" />
                                        Thành công
                                      </>
                                    ) : (
                                      <>
                                        <XCircle className="h-3 w-3 mr-1" />
                                        Thất bại
                                      </>
                                    )}
                                  </Badge>
                                </TableCell>
                                <TableCell className="max-w-xs truncate">
                                  {item.message}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {item.proxy || "-"}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {new Date(item.createdAt).toLocaleString('vi-VN')}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                      
                      {/* Pagination and Export Controls */}
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <div className="flex items-center gap-4">
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            Hiển thị {paginatedHistory.length} / {filteredEmailHistory.length} bản ghi
                          </div>
                          
                          {/* Items per page */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm">Hiển thị:</span>
                            <select
                              value={historyItemsPerPage}
                              onChange={(e) => {
                                setHistoryItemsPerPage(Number(e.target.value));
                                setHistoryPage(1);
                              }}
                              className="px-2 py-1 border rounded text-sm"
                            >
                              <option value={10}>10</option>
                              <option value={20}>20</option>
                              <option value={50}>50</option>
                            </select>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {/* Pagination */}
                          {totalHistoryPages > 1 && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                                disabled={historyPage === 1}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              
                              <span className="text-sm px-2">
                                Trang {historyPage} / {totalHistoryPages}
                              </span>
                              
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setHistoryPage(prev => Math.min(totalHistoryPages, prev + 1))}
                                disabled={historyPage === totalHistoryPages}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                          
                          {/* Export All */}
                          <Button
                            variant="outline"
                            onClick={() => exportHistory(false)}
                            className="flex items-center gap-2"
                          >
                            <Download className="h-4 w-4" />
                            Xuất tất cả Excel
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </>
  );
}