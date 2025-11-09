import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Copy, Search, Calendar, User, CheckCircle, XCircle, AlertCircle, Phone, Download, Trash2, FileText, Filter } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { FixedHeader } from "@/components/fixed-header";
import { Progress } from "@/components/ui/progress";

interface UsernameCheckResult {
  username: string;
  status: number | null;
  isAvailable: boolean;
  statusMessage: string;
}

interface UsernameCheckHistory {
  id: number;
  username: string;
  status: number | null;
  isAvailable: boolean;
  userIp: string;
  createdAt: string;
}

interface PhoneCheckResult {
  phone: string;
  normalizedPhone: string;
  status: 'live' | 'blocked' | 'error';
  statusMessage: string;
  errorCode: number | null;
}

export default function UsernameCheck() {
  const [usernames, setUsernames] = useState("");
  const [results, setResults] = useState<UsernameCheckResult[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState("");
  const [phoneResults, setPhoneResults] = useState<PhoneCheckResult[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isProcessingPhones, setIsProcessingPhones] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'blocked' | 'error'>('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch username check history
  const { data: history = [] } = useQuery<UsernameCheckHistory[]>({
    queryKey: ['/api/username-checks/history'],
    enabled: true
  });

  // Bulk username check mutation
  const checkUsernamesMutation = useMutation({
    mutationFn: async (usernames: string[]) => {
      return await apiRequest({
        url: '/api/username-checks/bulk', 
        method: 'POST',
        body: { usernames }
      });
    },
    onSuccess: (data) => {
      setResults(data.results);
      setProgress(100);
      queryClient.invalidateQueries({ queryKey: ['/api/username-checks/history'] });
      toast({
        title: "✅ Kiểm tra hoàn thành",
        description: `Đã kiểm tra ${data.totalChecked} username. ${data.activeCount} hoạt động, ${data.bannedCount} bị khóa, ${data.errorCount} lỗi.`
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Lỗi kiểm tra username",
        description: error.message || "Có lỗi xảy ra khi kiểm tra username",
        variant: "destructive"
      });
      setProgress(0);
    },
    onSettled: () => {
      setIsProcessing(false);
    }
  });

  // Bulk phone number LIVE check mutation
  const checkPhonesMutation = useMutation({
    mutationFn: async (phoneNumbers: string[]) => {
      return await apiRequest({
        url: '/api/phone-live-checks/bulk', 
        method: 'POST',
        body: { phoneNumbers }
      });
    },
    onSuccess: (data) => {
      setPhoneResults(data.results);
      toast({
        title: "✅ Kiểm tra số điện thoại hoàn thành",
        description: `Đã kiểm tra ${data.totalChecked} số. ${data.liveCount} live, ${data.blockedCount} bị khóa, ${data.errorCount} lỗi.`
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Lỗi kiểm tra số điện thoại",
        description: error.message || "Có lỗi xảy ra khi kiểm tra số điện thoại",
        variant: "destructive"
      });
    },
    onSettled: () => {
      setIsProcessingPhones(false);
    }
  });

  const handleCheckUsernames = () => {
    const usernameList = usernames
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (usernameList.length === 0) {
      toast({
        title: "⚠️ Lỗi đầu vào",
        description: "Vui lòng nhập ít nhất một username",
        variant: "destructive"
      });
      return;
    }

    if (usernameList.length > 20) {
      toast({
        title: "⚠️ Vượt quá giới hạn",
        description: "Tối đa 20 username mỗi lần kiểm tra. Bạn đã nhập " + usernameList.length + " username.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setProgress(10);
    
    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 300);

    checkUsernamesMutation.mutate(usernameList);
  };

  const handleCheckPhones = () => {
    const phoneList = phoneNumbers
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (phoneList.length === 0) {
      toast({
        title: "⚠️ Lỗi đầu vào",
        description: "Vui lòng nhập ít nhất một số điện thoại",
        variant: "destructive"
      });
      return;
    }

    if (phoneList.length > 20) {
      toast({
        title: "⚠️ Vượt quá giới hạn",
        description: "Tối đa 20 số điện thoại mỗi lần kiểm tra. Bạn đã nhập " + phoneList.length + " số.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessingPhones(true);
    checkPhonesMutation.mutate(phoneList);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "✅ Đã sao chép",
      description: "Đã sao chép vào clipboard"
    });
  };

  const copyBulkUsernames = (type: 'all' | 'live' | 'blocked') => {
    let filtered = results;
    
    if (type === 'live') {
      filtered = results.filter(r => r.status === 1 && r.isAvailable);
    } else if (type === 'blocked') {
      filtered = results.filter(r => r.status === 2);
    }

    const text = filtered.map(r => r.username).join('\n');
    navigator.clipboard.writeText(text);
    
    toast({
      title: "✅ Đã sao chép",
      description: `Đã sao chép ${filtered.length} username ${type === 'live' ? 'hoạt động' : type === 'blocked' ? 'bị khóa' : ''}`.trim()
    });
  };

  const exportToExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      
      const data = results.map(r => ({
        'Username': r.username,
        'Trạng thái': r.status === 1 ? 'Hoạt động' : r.status === 2 ? 'Bị khóa' : 'Lỗi',
        'Thông báo': r.statusMessage
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Username Check');
      
      XLSX.writeFile(wb, `username-check-${new Date().toISOString().split('T')[0]}.xlsx`);
      
      toast({
        title: "✅ Xuất Excel thành công",
        description: `Đã xuất ${results.length} username`
      });
    } catch (error) {
      toast({
        title: "❌ Lỗi xuất Excel",
        description: "Không thể xuất file Excel",
        variant: "destructive"
      });
    }
  };

  const clearResults = () => {
    setResults([]);
    setProgress(0);
    toast({
      title: "🗑️ Đã xóa kết quả",
      description: "Kết quả kiểm tra đã được xóa"
    });
  };

  const getStatusBadge = (status: number | null, isAvailable: boolean) => {
    if (status === 1 && isAvailable) {
      return <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200"><CheckCircle className="w-3 h-3 mr-1" />Hoạt động</Badge>;
    } else if (status === 2) {
      return <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200"><XCircle className="w-3 h-3 mr-1" />Bị khóa</Badge>;
    } else {
      return <Badge className="bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-700 dark:text-gray-300"><AlertCircle className="w-3 h-3 mr-1" />Lỗi</Badge>;
    }
  };

  const getPhoneStatusBadge = (status: 'live' | 'blocked' | 'error') => {
    if (status === 'live') {
      return <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200"><CheckCircle className="w-3 h-3 mr-1" />Live</Badge>;
    } else if (status === 'blocked') {
      return <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200"><XCircle className="w-3 h-3 mr-1" />Bị khóa</Badge>;
    } else {
      return <Badge className="bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-700 dark:text-gray-300"><AlertCircle className="w-3 h-3 mr-1" />Lỗi</Badge>;
    }
  };

  // Filter history based on search term and status
  const filteredHistory = history.filter(item => {
    const matchesSearch = item.username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = 
      filterStatus === 'all' ||
      (filterStatus === 'live' && item.status === 1 && item.isAvailable) ||
      (filterStatus === 'blocked' && item.status === 2) ||
      (filterStatus === 'error' && item.status === null);
    
    return matchesSearch && matchesFilter;
  });

  // Filter results
  const filteredResults = results.filter(item => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'live') return item.status === 1 && item.isAvailable;
    if (filterStatus === 'blocked') return item.status === 2;
    if (filterStatus === 'error') return item.status === null;
    return true;
  });

  // Statistics
  const stats = {
    total: results.length,
    live: results.filter(r => r.status === 1 && r.isAvailable).length,
    blocked: results.filter(r => r.status === 2).length,
    error: results.filter(r => r.status === null).length
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <FixedHeader />

      {/* Page Header */}
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-orange-200 dark:border-gray-700 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl shadow-lg">
                <User className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  Kiểm tra Username & SĐT Shopee
                  <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 text-xs">
                    API tích hợp
                  </Badge>
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Kiểm tra tình trạng Username và số điện thoại Shopee - Miễn phí 100%
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200 px-3 py-1">
                <CheckCircle className="w-4 h-4 mr-1" />
                Miễn phí 100%
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs defaultValue="check" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="check" className="flex items-center space-x-2" data-testid="tab-username">
              <Search className="w-4 h-4" />
              <span>Kiểm tra Username</span>
            </TabsTrigger>
            <TabsTrigger value="phone" className="flex items-center space-x-2" data-testid="tab-phone">
              <Phone className="w-4 h-4" />
              <span>Kiểm tra SĐT</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center space-x-2" data-testid="tab-history">
              <Calendar className="w-4 h-4" />
              <span>Lịch sử ({history.length})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="check" className="space-y-6">
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Main Form */}
              <div className="lg:col-span-2 space-y-6">
                <Card className="shadow-sm border-orange-200 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-orange-600 dark:text-orange-400">
                      Nhập danh sách Username
                    </CardTitle>
                    <CardDescription>
                      Nhập từng username một dòng (tối đa 20 username). Dịch vụ hoàn toàn miễn phí.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      placeholder="username1&#10;username2&#10;username3"
                      value={usernames}
                      onChange={(e) => setUsernames(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                      disabled={isProcessing}
                      data-testid="input-usernames"
                    />
                    
                    {isProcessing && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                          <span>Đang kiểm tra...</span>
                          <span>{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {usernames.split('\n').filter(l => l.trim()).length} username
                      </span>
                      <Button
                        onClick={handleCheckUsernames}
                        disabled={isProcessing || !usernames.trim()}
                        className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                        data-testid="button-check-usernames"
                      >
                        {isProcessing ? "Đang kiểm tra..." : "Kiểm tra Username"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Results */}
                {results.length > 0 && (
                  <Card className="shadow-sm border-orange-200 dark:border-gray-700">
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-orange-600 dark:text-orange-400">
                            Kết quả kiểm tra ({filteredResults.length}/{results.length})
                          </CardTitle>
                          <div className="flex gap-2 mt-2">
                            <Badge className="bg-green-100 text-green-800 border-green-200">
                              {stats.live} Live
                            </Badge>
                            <Badge className="bg-red-100 text-red-800 border-red-200">
                              {stats.blocked} Khóa
                            </Badge>
                            <Badge className="bg-gray-100 text-gray-800 border-gray-200">
                              {stats.error} Lỗi
                            </Badge>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap justify-end">
                          <Button variant="outline" size="sm" onClick={() => setFilterStatus('all')} data-testid="filter-all">
                            <Filter className="h-3 w-3 mr-1" />
                            {filterStatus === 'all' && '✓ '}Tất cả
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setFilterStatus('live')} data-testid="filter-live">
                            {filterStatus === 'live' && '✓ '}Live
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setFilterStatus('blocked')} data-testid="filter-blocked">
                            {filterStatus === 'blocked' && '✓ '}Khóa
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => copyBulkUsernames('all')} data-testid="copy-all">
                            <Copy className="h-3 w-3 mr-1" />
                            Copy tất cả
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => copyBulkUsernames('live')} className="bg-green-50 dark:bg-green-900/20" data-testid="copy-live">
                            <Copy className="h-3 w-3 mr-1" />
                            Copy Live
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => copyBulkUsernames('blocked')} className="bg-red-50 dark:bg-red-900/20" data-testid="copy-blocked">
                            <Copy className="h-3 w-3 mr-1" />
                            Copy Khóa
                          </Button>
                          <Button variant="outline" size="sm" onClick={exportToExcel} data-testid="export-excel">
                            <Download className="h-3 w-3 mr-1" />
                            Xuất Excel
                          </Button>
                          <Button variant="outline" size="sm" onClick={clearResults} className="text-red-600 hover:bg-red-50" data-testid="clear-results">
                            <Trash2 className="h-3 w-3 mr-1" />
                            Xóa
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Username</TableHead>
                              <TableHead>Trạng thái</TableHead>
                              <TableHead>Thông báo</TableHead>
                              <TableHead className="w-[100px]">Thao tác</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredResults.map((result, index) => (
                              <TableRow key={index}>
                                <TableCell className="font-mono" data-testid={`username-${index}`}>{result.username}</TableCell>
                                <TableCell data-testid={`status-${index}`}>{getStatusBadge(result.status, result.isAvailable)}</TableCell>
                                <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                                  {result.statusMessage}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => copyToClipboard(result.username)}
                                    data-testid={`copy-${index}`}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                <Card className="shadow-sm border-orange-200 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Thông tin dịch vụ
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Chi phí</span>
                      <Badge className="bg-green-100 text-green-800 border-green-200">Miễn phí</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Tốc độ</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">2-3s/username</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Độ chính xác</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">99.9%</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-orange-200 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Hướng dẫn sử dụng
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                      <p>1. Nhập username Shopee (mỗi dòng một username)</p>
                      <p>2. Tối đa 20 username mỗi lần kiểm tra</p>
                      <p>3. Click "Kiểm tra Username"</p>
                      <p>4. Xem kết quả và copy/xuất dữ liệu</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="phone" className="space-y-6">
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Phone Number Check Form */}
              <div className="lg:col-span-2 space-y-6">
                <Card className="shadow-sm border-orange-200 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-orange-600 dark:text-orange-400">
                      Nhập danh sách số điện thoại
                    </CardTitle>
                    <CardDescription>
                      Nhập từng số điện thoại một dòng (tối đa 20 số). Hỗ trợ định dạng: 84xxxxxxxxx, 0xxxxxxxxx, hoặc xxxxxxxxx
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      placeholder="84386431186&#10;0386431186&#10;386431186"
                      value={phoneNumbers}
                      onChange={(e) => setPhoneNumbers(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                      disabled={isProcessingPhones}
                      data-testid="input-phones"
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {phoneNumbers.split('\n').filter(l => l.trim()).length} số điện thoại
                      </span>
                      <Button
                        onClick={handleCheckPhones}
                        disabled={isProcessingPhones || !phoneNumbers.trim()}
                        className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                        data-testid="button-check-phones"
                      >
                        {isProcessingPhones ? "Đang kiểm tra..." : "Kiểm tra số điện thoại"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Phone Results */}
                {phoneResults.length > 0 && (
                  <Card className="shadow-sm border-orange-200 dark:border-gray-700">
                    <CardHeader>
                      <CardTitle className="text-orange-600 dark:text-orange-400">
                        Kết quả kiểm tra số điện thoại ({phoneResults.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Số điện thoại</TableHead>
                              <TableHead>Số chuẩn hóa</TableHead>
                              <TableHead>Trạng thái</TableHead>
                              <TableHead>Thông báo</TableHead>
                              <TableHead className="w-[100px]">Thao tác</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {phoneResults.map((result, index) => (
                              <TableRow key={index}>
                                <TableCell className="font-mono">{result.phone}</TableCell>
                                <TableCell className="font-mono text-sm text-gray-600 dark:text-gray-400">
                                  {result.normalizedPhone}
                                </TableCell>
                                <TableCell>{getPhoneStatusBadge(result.status)}</TableCell>
                                <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                                  {result.statusMessage}
                                  {result.errorCode && result.status === 'error' && (
                                    <span className="block text-xs text-red-500 mt-1">
                                      Mã lỗi: {result.errorCode}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => copyToClipboard(result.normalizedPhone)}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Phone Check Sidebar */}
              <div className="space-y-6">
                <Card className="shadow-sm border-orange-200 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Định dạng số điện thoại
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <p><strong>Hỗ trợ các định dạng:</strong></p>
                      <p>• 84xxxxxxxxx (84 + 9 số)</p>
                      <p>• 0xxxxxxxxx (0 + 9 số)</p>
                      <p>• xxxxxxxxx (9 số)</p>
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                        * Tất cả sẽ được chuẩn hóa về 84 + 9 số
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-orange-200 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Ý nghĩa kết quả
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center space-x-2">
                        <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Live</Badge>
                        <span>Số khả dụng</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Bị khóa</Badge>
                        <span>Số đã bị khóa</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge className="bg-gray-100 text-gray-800 border-gray-200 text-xs">Lỗi</Badge>
                        <span>Lỗi kiểm tra</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card className="shadow-sm border-orange-200 dark:border-gray-700">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle className="text-orange-600 dark:text-orange-400">
                      Lịch sử kiểm tra
                    </CardTitle>
                    <CardDescription>
                      Tất cả username đã kiểm tra ({filteredHistory.length}/{history.length})
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => setFilterStatus('all')} data-testid="history-filter-all">
                      {filterStatus === 'all' && '✓ '}Tất cả
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setFilterStatus('live')} data-testid="history-filter-live">
                      {filterStatus === 'live' && '✓ '}Live
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setFilterStatus('blocked')} data-testid="history-filter-blocked">
                      {filterStatus === 'blocked' && '✓ '}Khóa
                    </Button>
                    <div className="flex items-center space-x-2">
                      <Search className="w-4 h-4 text-gray-400" />
                      <Input
                        placeholder="Tìm username..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-48"
                        data-testid="input-search-history"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Username</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead>IP</TableHead>
                        <TableHead>Thời gian</TableHead>
                        <TableHead className="w-[100px]">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                            <FileText className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                            <p>Chưa có lịch sử kiểm tra</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredHistory.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono">{item.username}</TableCell>
                            <TableCell>{getStatusBadge(item.status, item.isAvailable)}</TableCell>
                            <TableCell className="text-sm text-gray-600 dark:text-gray-400">{item.userIp}</TableCell>
                            <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: vi })}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyToClipboard(item.username)}
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
