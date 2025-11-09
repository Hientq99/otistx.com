import { useState, useEffect } from "react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  ShoppingCart, 
  Play, 
  Wifi, 
  CheckCircle, 
  User, 
  Globe,
  History,
  Search,
  Filter,
  Calendar,
  Copy,
  Download,
  Settings2,
  ChevronLeft,
  ChevronRight,
  X
} from "lucide-react";

interface ShopeeCookie {
  id: string;
  cookieType: string;
  cookiePreview: string;
  shopeeRegion: string;
  createdAt: string;
}

interface AccountCheckResult {
  cookieId: string;
  status: boolean;
  message: string;
  username?: string;
  nickname?: string;
  email?: string;
  phone?: string;
  userid?: string;
  shopid?: string;
  ctime?: string;
  proxy?: string;
}

interface AccountCheckHistory {
  id: number;
  cookieId: string;
  cookiePreview: string;
  status: boolean;
  message: string;
  username?: string;
  nickname?: string;
  email?: string;
  phone?: string;
  userid?: string;
  shopid?: string;
  ctime?: string;
  proxy?: string;
  createdAt: string;
}

export default function AccountCheckPage() {
  const [selectedCookies, setSelectedCookies] = useState<string[]>([]);
  const [proxyList, setProxyList] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<AccountCheckResult[]>([]);
  const [selectedResults, setSelectedResults] = useState<string[]>([]);
  const [searchHistory, setSearchHistory] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyItemsPerPage, setHistoryItemsPerPage] = useState(10);
  const [selectedHistoryItems, setSelectedHistoryItems] = useState<number[]>([]);
  const [dateFilter, setDateFilter] = useState("");
  const [dateFilterType, setDateFilterType] = useState("all"); // "all", "today", "yesterday", "week", "month", "custom"
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // Bulk check states
  const [bulkCookieText, setBulkCookieText] = useState("");
  const [isBulkChecking, setIsBulkChecking] = useState(false);
  const [bulkCheckResults, setBulkCheckResults] = useState<AccountCheckResult[]>([]);
  const [selectedBulkResults, setSelectedBulkResults] = useState<string[]>([]);
  
  // Mobile responsive state
  const [isMobile, setIsMobile] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mobile detection
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

  // Helper function to get cookie preview from cookie ID
  const getCookiePreview = (cookieId: string): string => {
    if (!cookies) return cookieId;
    const cookie = (cookies as ShopeeCookie[]).find(c => c.id === cookieId);
    return cookie?.cookiePreview || cookieId;
  };

  const { data: checkHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["/api/account-checks"],
  });

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
        // Just cookie without proxy
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

  const checkAccountMutation = useMutation({
    mutationFn: async (data: { cookieIds: string[]; proxies: string[] }) => {
      return await apiRequest({
        url: "/api/account-check",
        method: "POST",
        body: data,
      });
    },
    onSuccess: (results) => {
      setCheckResults(results);
      queryClient.invalidateQueries({ queryKey: ["/api/account-checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopee-cookies"] });
      toast({
        title: "Kiểm tra hoàn tất!",
        description: `Đã kiểm tra ${results.length} cookie`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể kiểm tra tài khoản",
        variant: "destructive",
      });
    }
  });

  // Bulk check mutation
  const bulkCheckAccountMutation = useMutation({
    mutationFn: async (data: { entries: { cookie: string; proxy?: string }[] }) => {
      return await apiRequest({
        url: "/api/account-check/bulk",
        method: "POST",
        body: data,
      });
    },
    onSuccess: (results) => {
      setBulkCheckResults(results);
      setIsBulkChecking(false);
      queryClient.invalidateQueries({ queryKey: ["/api/account-checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopee-cookies"] });
      toast({
        title: "Kiểm tra form hoàn tất!",
        description: `Đã kiểm tra ${results.length} cookie`,
      });
    },
    onError: (error: any) => {
      setIsBulkChecking(false);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể kiểm tra tài khoản form",
        variant: "destructive",
      });
    }
  });

  const handleBulkCheck = () => {
    if (!bulkCookieText.trim()) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập danh sách cookie",
        variant: "destructive",
      });
      return;
    }

    const entries = parseBulkCookieText(bulkCookieText);
    if (entries.length === 0) {
      toast({
        title: "Lỗi", 
        description: "Không có cookie hợp lệ để kiểm tra",
        variant: "destructive",
      });
      return;
    }

    setIsBulkChecking(true);
    setBulkCheckResults([]);
    bulkCheckAccountMutation.mutate({ entries });
  };

  const handleStartCheck = () => {
    if (selectedCookies.length === 0) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn ít nhất một cookie",
        variant: "destructive",
      });
      return;
    }

    setIsChecking(true);
    const proxies = parseProxyList(proxyList);
    
    checkAccountMutation.mutate(
      { cookieIds: selectedCookies, proxies },
      {
        onSettled: () => setIsChecking(false)
      }
    );
  };

  const getStatusBadge = (result: AccountCheckResult | AccountCheckHistory) => {
    if (result.status) {
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
          Thành công
        </Badge>
      );
    } else {
      return (
        <Badge variant="destructive">
          Thất bại
        </Badge>
      );
    }
  };

  // Date filtering helper functions
  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isYesterday = (date: Date) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
  };

  const isThisWeek = (date: Date) => {
    const now = new Date();
    const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
    return date >= weekStart;
  };

  const isThisMonth = (date: Date) => {
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  };

  const filteredHistory = (checkHistory as AccountCheckHistory[])?.filter(item => {
    const matchesSearch = !searchHistory || 
      item.cookiePreview.toLowerCase().includes(searchHistory.toLowerCase()) ||
      item.username?.toLowerCase().includes(searchHistory.toLowerCase()) ||
      item.message.toLowerCase().includes(searchHistory.toLowerCase());
    
    const matchesStatus = filterStatus === "all" || 
      (filterStatus === "success" && item.status) ||
      (filterStatus === "failed" && !item.status);

    // Date filtering
    let matchesDate = true;
    if (dateFilterType !== "all" && item.createdAt) {
      const itemDate = new Date(item.createdAt);
      
      switch (dateFilterType) {
        case "today":
          matchesDate = isToday(itemDate);
          break;
        case "yesterday":
          matchesDate = isYesterday(itemDate);
          break;
        case "week":
          matchesDate = isThisWeek(itemDate);
          break;
        case "month":
          matchesDate = isThisMonth(itemDate);
          break;
        case "custom":
          if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            matchesDate = itemDate >= start && itemDate <= end;
          } else if (startDate) {
            const start = new Date(startDate);
            matchesDate = itemDate >= start;
          } else if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            matchesDate = itemDate <= end;
          }
          break;
      }
    }

    return matchesSearch && matchesStatus && matchesDate;
  })
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) || []; // Sort newest first

  // Pagination for history
  const totalHistoryPages = Math.ceil(filteredHistory.length / historyItemsPerPage);
  const paginatedHistory = filteredHistory.slice(
    (historyPage - 1) * historyItemsPerPage,
    historyPage * historyItemsPerPage
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Đã sao chép!",
      description: "Nội dung đã được sao chép vào clipboard",
    });
  };

  // Copy full cookie value to clipboard
  const copyCookieToClipboard = async (cookieId: string) => {
    try {
      const fullCookie = await apiRequest({
        url: `/api/shopee-cookies/${cookieId}`,
        method: "GET"
      });
      await navigator.clipboard.writeText(fullCookie.cookieValue);
      toast({
        title: "Đã sao chép!",
        description: "Cookie đầy đủ đã được sao chép vào clipboard",
      });
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể sao chép cookie",
        variant: "destructive",
      });
    }
  };

  // Results selection handlers
  const toggleResultSelection = (cookieId: string) => {
    setSelectedResults(prev => 
      prev.includes(cookieId) 
        ? prev.filter(id => id !== cookieId)
        : [...prev, cookieId]
    );
  };

  const handleSelectAllBulkResults = () => {
    if (selectedBulkResults.length === bulkCheckResults.length) {
      setSelectedBulkResults([]);
    } else {
      setSelectedBulkResults(bulkCheckResults.map(result => result.cookieId));
    }
  };

  const toggleBulkResultSelection = (cookieId: string) => {
    setSelectedBulkResults(prev => 
      prev.includes(cookieId) 
        ? prev.filter(id => id !== cookieId)
        : [...prev, cookieId]
    );
  };

  const handleSelectAllResults = () => {
    if (selectedResults.length === checkResults.length) {
      setSelectedResults([]);
    } else {
      setSelectedResults(checkResults.map(result => result.cookieId));
    }
  };

  // History selection handlers
  const toggleHistorySelection = (id: number) => {
    setSelectedHistoryItems(prev => 
      prev.includes(id) 
        ? prev.filter(itemId => itemId !== id)
        : [...prev, id]
    );
  };

  const handleSelectAllHistory = () => {
    const currentPageItems = paginatedHistory.map((item: AccountCheckHistory) => item.id);
    if (selectedHistoryItems.length === currentPageItems.length) {
      setSelectedHistoryItems([]);
    } else {
      setSelectedHistoryItems(currentPageItems);
    }
  };

  // Export to Excel function with UTF-8 BOM
  const exportToExcel = (data: any[], filename: string) => {
    const worksheet = data.map(item => ({
      'Cookie ID': item.cookieId || item.id,
      'Trạng thái': item.status ? 'Thành công' : 'Thất bại',
      'Username': item.username || '-',
      'Nickname': item.nickname || '-',
      'Email': item.email || '-',
      'Phone': item.phone || '-',
      'Userid': item.userid || '-',
      'Shopid': item.shopid || '-',
      'Create time': item.ctime || '-',
      'Proxy': item.proxy || '-',
      'Thông báo': item.message || '-',
      'Thời gian': item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN') : '-'
    }));
    
    // CSV export with UTF-8 BOM for proper Vietnamese font display
    const csvContent = [
      Object.keys(worksheet[0]).join(','),
      ...worksheet.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');
    
    // Add UTF-8 BOM to fix Vietnamese font display in Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
    
    toast({
      title: "Xuất Excel thành công!",
      description: `Đã xuất ${data.length} bản ghi`,
    });
  };

  // Mobile card component for account check results
  const AccountCheckCard = ({ 
    item, 
    isSelected = false, 
    onToggleSelection = () => {} 
  }: { 
    item: AccountCheckResult | AccountCheckHistory;
    isSelected?: boolean;
    onToggleSelection?: (id: string) => void;
  }) => (
    <Card className="mb-4 border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelection('id' in item ? item.id.toString() : item.cookieId)}
              />
              {getStatusBadge(item)}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">Cookie Value:</span>
                <span 
                  className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors"
                  onClick={() => {
                    copyCookieToClipboard(item.cookieId);
                  }}
                >
                  {getCookiePreview(item.cookieId).substring(0, 15)}...
                </span>
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => copyToClipboard('id' in item ? JSON.stringify(item, null, 2) : JSON.stringify(item, null, 2))}
            className="h-8 w-8 p-0"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {item.username && (
            <div className="flex items-center justify-between cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(item.username || '')}>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Username:</span>
              <span className="text-sm font-semibold">{item.username}</span>
            </div>
          )}
          {item.nickname && (
            <div className="flex items-center justify-between cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(item.nickname || '')}>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Nickname:</span>
              <span className="text-sm">{item.nickname}</span>
            </div>
          )}
          {item.email && (
            <div className="flex items-center justify-between cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(item.email || '')}>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Email:</span>
              <span className="text-sm font-mono">{item.email}</span>
            </div>
          )}
          {item.phone && (
            <div className="flex items-center justify-between cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(item.phone || '')}>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Phone:</span>
              <span className="text-sm">{item.phone}</span>
            </div>
          )}
          {item.userid && (
            <div className="flex items-center justify-between cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(item.userid || '')}>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">User ID:</span>
              <span className="text-sm font-mono">{item.userid}</span>
            </div>
          )}
          {item.shopid && (
            <div className="flex items-center justify-between cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(item.shopid || '')}>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Shop ID:</span>
              <span className="text-sm font-mono">{item.shopid}</span>
            </div>
          )}
          {item.proxy && (
            <div className="flex items-center justify-between cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(item.proxy || 'System')}>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Proxy:</span>
              <span className="text-sm font-mono">{item.proxy === 'System' ? 'Hệ thống' : item.proxy}</span>
            </div>
          )}
          <div className="flex items-center justify-between cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(item.status ? 'Success' : item.message)}>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Message:</span>
            <span className={`text-sm ${item.status ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {item.status ? 'Success' : item.message}
            </span>
          </div>
          {'createdAt' in item && (
            <div className="flex items-center justify-between cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(new Date(item.createdAt).toLocaleString('vi-VN'))}>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Thời gian:</span>
              <span className="text-sm">{new Date(item.createdAt).toLocaleString('vi-VN')}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <FixedHeader />
      <div className="container mx-auto px-4 md:px-6 py-8 pt-24">
        {/* Page Title */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 text-white">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                Kiểm tra Tài khoản Shopee
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Xác minh thông tin tài khoản với cookie SPC_ST
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Globe className="h-4 w-4" />
              <span>Proxy tự động</span>
            </div>
            <Badge variant="outline" className="text-orange-600 border-orange-200">
              100 VND/check thành công
            </Badge>
          </div>
        </div>
        <Tabs defaultValue="check" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm">
            <TabsTrigger value="check" className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Kiểm tra tài khoản
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              Kiểm tra form
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Lịch sử kiểm tra
            </TabsTrigger>
          </TabsList>

          {/* Check Tab */}
          <TabsContent value="check" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
              {/* Cookie Selection */}
              <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
                <CardHeader className="border-b border-gray-100 dark:border-gray-700">
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-orange-600" />
                    Chọn Cookie để Kiểm tra
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {cookiesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                    </div>
                  ) : !cookies || (cookies as ShopeeCookie[]).length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <User className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>Chưa có cookie nào</p>
                      <p className="text-sm">Vui lòng thêm cookie trong Cookie Manager</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {selectedCookies.length} / {(cookies as ShopeeCookie[]).length} cookie được chọn
                        </span>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={handleSelectAllCookies}
                        >
                          {selectedCookies.length === (cookies as ShopeeCookie[]).length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                        </Button>
                      </div>
                      
                      <ScrollArea className="h-64">
                        <div className="space-y-2">
                          {(cookies as ShopeeCookie[]).map((cookie: ShopeeCookie) => (
                            <div 
                              key={cookie.id}
                              className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-slate-700/50"
                            >
                              <Checkbox
                                checked={selectedCookies.includes(cookie.id)}
                                onCheckedChange={() => toggleCookieSelection(cookie.id)}
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant={cookie.cookieType === 'SPC_F' ? 'default' : 'secondary'} className="text-xs">
                                    {cookie.cookieType}
                                  </Badge>
                                  <span className="font-mono text-xs">{cookie.id}</span>
                                </div>
                                <div className="text-xs text-gray-500 font-mono">
                                  {cookie.cookiePreview.length > 30 
                                    ? `${cookie.cookiePreview.substring(0, 30)}...`
                                    : cookie.cookiePreview
                                  }
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Proxy Configuration */}
              <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
                <CardHeader className="border-b border-gray-100 dark:border-gray-700">
                  <CardTitle className="flex items-center gap-2">
                    <Wifi className="h-5 w-5 text-orange-600" />
                    Cấu hình Proxy (Tùy chọn)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Danh sách Proxy
                    </Label>
                    <Textarea
                      placeholder={`Nhập danh sách proxy (mỗi dòng một proxy):
http://ip:port
http://ip:port:user:pass
socks5://ip:port
socks5://ip:port:user:pass

Để trống để sử dụng proxy hệ thống`}
                      value={proxyList}
                      onChange={(e) => setProxyList(e.target.value)}
                      className="h-32 font-mono text-sm"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Wifi className="h-4 w-4" />
                    <span>
                      {proxyList.trim() ? 
                        `${parseProxyList(proxyList).length} proxy được cấu hình` : 
                        'Sử dụng proxy hệ thống'
                      }
                    </span>
                  </div>

                  <Separator />

                  <Button 
                    onClick={handleStartCheck}
                    disabled={isChecking || selectedCookies.length === 0}
                    className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
                  >
                    {isChecking ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Đang kiểm tra...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Bắt đầu Kiểm tra ({selectedCookies.length} cookie)
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Results Section */}
            {checkResults.length > 0 && (
              <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
                <CardHeader className="border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-orange-600" />
                      Kết quả Kiểm tra
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAllResults}
                        className="h-8"
                      >
                        <Checkbox 
                          checked={selectedResults.length === checkResults.length}
                          className="mr-2"
                        />
                        Chọn tất cả ({selectedResults.length})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const selectedData = checkResults.filter(result => 
                            selectedResults.includes(result.cookieId)
                          );
                          exportToExcel(selectedData, 'ket-qua-kiem-tra');
                        }}
                        disabled={selectedResults.length === 0}
                        className="h-8"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Xuất Excel ({selectedResults.length})
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {isMobile ? (
                    <ScrollArea className="h-96 p-4">
                      {checkResults.map((result, index) => (
                        <AccountCheckCard 
                          key={index} 
                          item={result}
                          isSelected={selectedResults.includes(result.cookieId)}
                          onToggleSelection={toggleResultSelection}
                        />
                      ))}
                    </ScrollArea>
                  ) : (
                    <ScrollArea className="h-96">
                      <Table>
                        <TableHeader className="bg-gray-50 dark:bg-slate-900/50 sticky top-0">
                          <TableRow>
                            <TableHead className="w-12">
                              <Checkbox
                                checked={selectedResults.length === checkResults.length}
                                onCheckedChange={handleSelectAllResults}
                              />
                            </TableHead>
                            <TableHead className="font-semibold">Cookie Value</TableHead>
                            <TableHead className="font-semibold">Trạng thái</TableHead>
                            <TableHead className="font-semibold">Username</TableHead>
                            <TableHead className="font-semibold">Nickname</TableHead>
                            <TableHead className="font-semibold">Email</TableHead>
                            <TableHead className="font-semibold">Phone</TableHead>
                            <TableHead className="font-semibold">Userid</TableHead>
                            <TableHead className="font-semibold">Shopid</TableHead>
                            <TableHead className="font-semibold">Create time</TableHead>
                            <TableHead className="font-semibold">Proxy</TableHead>
                            <TableHead className="font-semibold">Thông báo</TableHead>
                            <TableHead className="font-semibold">Thao tác</TableHead>
                          </TableRow>
                        </TableHeader>
                      <TableBody>
                        {checkResults.map((result, index) => (
                          <TableRow key={index} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                            <TableCell>
                              <Checkbox
                                checked={selectedResults.includes(result.cookieId)}
                                onCheckedChange={() => toggleResultSelection(result.cookieId)}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(getCookiePreview(result.cookieId))}>
                              {getCookiePreview(result.cookieId).substring(0, 15)}...
                            </TableCell>
                            <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.status ? 'Thành công' : 'Thất bại')}>
                              {getStatusBadge(result)}
                            </TableCell>
                            <TableCell className="font-medium cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.username || '-')}>
                              {result.username || '-'}
                            </TableCell>
                            <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.nickname || '-')}>
                              {result.nickname || '-'}
                            </TableCell>
                            <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.email || '-')}>
                              {result.email || '-'}
                            </TableCell>
                            <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.phone || '-')}>
                              {result.phone || '-'}
                            </TableCell>
                            <TableCell className="font-mono text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.userid || '-')}>
                              {result.userid || '-'}
                            </TableCell>
                            <TableCell className="font-mono text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.shopid || '-')}>
                              {result.shopid || '-'}
                            </TableCell>
                            <TableCell className="text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.ctime ? new Date(result.ctime).toLocaleDateString('vi-VN') : '-')}>
                              {result.ctime ? (
                                new Date(result.ctime).toLocaleDateString('vi-VN', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit'
                                })
                              ) : '-'}
                            </TableCell>
                            <TableCell className="font-mono text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.proxy || 'System')}>
                              {result.proxy || 'System'}
                            </TableCell>
                            <TableCell className="max-w-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.status ? 'Success' : result.message)}>
                              <div className="truncate" title={result.message}>
                                <span className={result.status ? "text-green-600" : "text-red-600"}>
                                  {result.status ? 'Success' : result.message}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-center" onClick={() => copyToClipboard(JSON.stringify(result, null, 2))} title="Click để copy toàn bộ dữ liệu">
                              <span className="text-xs text-gray-500 select-none">JSON</span>
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

          {/* Bulk Check Tab */}
          <TabsContent value="bulk" className="space-y-6">
            <div className="space-y-6">
              {/* Bulk Input Form */}
              <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
                <CardHeader className="border-b border-gray-100 dark:border-gray-700">
                  <CardTitle className="flex items-center gap-2">
                    <Play className="h-5 w-5 text-orange-600" />
                    Nhập danh sách Cookie|Proxy
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="bulkCookieText" className="text-sm font-medium">
                        Danh sách Cookie (format: cookie|proxy hoặc chỉ cookie)
                      </Label>
                      <Textarea
                        id="bulkCookieText"
                        placeholder={`SPC_ST=abc123...|1.2.3.4:8080:user:pass
SPC_F=def456...|5.6.7.8:8080:user2:pass2
SPC_ST=ghi789...
(Nếu không có proxy thì sẽ dùng HTTP proxy từ database)`}
                        className="mt-2 h-40 font-mono text-sm"
                        value={bulkCookieText}
                        onChange={(e) => setBulkCookieText(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Globe className="h-4 w-4" />
                      <span>Cookie thành công sẽ tự động thêm vào quản lý cookie</span>
                    </div>
                    <Button
                      onClick={handleBulkCheck}
                      disabled={isBulkChecking || !bulkCookieText.trim()}
                      className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
                    >
                      {isBulkChecking ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Đang kiểm tra...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Bắt đầu kiểm tra ({parseBulkCookieText(bulkCookieText).length})
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Bulk Check Results */}
              <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
                <CardHeader className="border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-orange-600" />
                      Kết quả Kiểm tra form
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAllBulkResults}
                        className="h-8"
                      >
                        <Checkbox 
                          checked={selectedBulkResults.length === bulkCheckResults.length}
                          className="mr-2"
                        />
                        Chọn tất cả ({selectedBulkResults.length})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const selectedData = bulkCheckResults.filter(result => 
                            selectedBulkResults.includes(result.cookieId)
                          );
                          exportToExcel(selectedData, 'ket-qua-bulk-check');
                        }}
                        disabled={selectedBulkResults.length === 0}
                        className="h-8"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Xuất Excel ({selectedBulkResults.length})
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {bulkCheckResults.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-30" />
                      <p>Kết quả kiểm tra form sẽ hiển thị tại đây</p>
                    </div>
                  ) : isMobile ? (
                    <ScrollArea className="h-96 p-4">
                      {bulkCheckResults.map((result, index) => (
                        <AccountCheckCard 
                          key={index} 
                          item={result}
                          isSelected={selectedBulkResults.includes(result.cookieId)}
                          onToggleSelection={toggleBulkResultSelection}
                        />
                      ))}
                    </ScrollArea>
                  ) : (
                    <ScrollArea className="h-96">
                      <Table>
                        <TableHeader className="bg-gray-50 dark:bg-slate-900/50 sticky top-0">
                          <TableRow>
                            <TableHead className="w-12">
                              <Checkbox
                                checked={selectedBulkResults.length === bulkCheckResults.length}
                                onCheckedChange={handleSelectAllBulkResults}
                              />
                            </TableHead>
                            <TableHead className="font-semibold">Cookie Value</TableHead>
                            <TableHead className="font-semibold">Trạng thái</TableHead>
                            <TableHead className="font-semibold">Username</TableHead>
                            <TableHead className="font-semibold">Nickname</TableHead>
                            <TableHead className="font-semibold">Email</TableHead>
                            <TableHead className="font-semibold">Phone</TableHead>
                            <TableHead className="font-semibold">Userid</TableHead>
                            <TableHead className="font-semibold">Shopid</TableHead>
                            <TableHead className="font-semibold">Create time</TableHead>
                            <TableHead className="font-semibold">Proxy</TableHead>
                            <TableHead className="font-semibold">Thông báo</TableHead>
                            <TableHead className="font-semibold">Thao tác</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bulkCheckResults.map((result, index) => (
                            <TableRow key={index} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                              <TableCell>
                                <Checkbox
                                  checked={selectedBulkResults.includes(result.cookieId)}
                                  onCheckedChange={() => toggleBulkResultSelection(result.cookieId)}
                                />
                              </TableCell>
                              <TableCell className="font-mono text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(getCookiePreview(result.cookieId))}>
                                {getCookiePreview(result.cookieId).substring(0, 15)}...
                              </TableCell>
                              <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.status ? 'Thành công' : 'Thất bại')}>
                                {getStatusBadge(result)}
                              </TableCell>
                              <TableCell className="font-medium cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.username || '-')}>
                                {result.username || '-'}
                              </TableCell>
                              <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.nickname || '-')}>
                                {result.nickname || '-'}
                              </TableCell>
                              <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.email || '-')}>
                                {result.email || '-'}
                              </TableCell>
                              <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.phone || '-')}>
                                {result.phone || '-'}
                              </TableCell>
                              <TableCell className="font-mono text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.userid || '-')}>
                                {result.userid || '-'}
                              </TableCell>
                              <TableCell className="font-mono text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.shopid || '-')}>
                                {result.shopid || '-'}
                              </TableCell>
                              <TableCell className="text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.ctime ? new Date(result.ctime).toLocaleDateString('vi-VN') : '-')}>
                                {result.ctime ? (
                                  new Date(result.ctime).toLocaleDateString('vi-VN', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit'
                                  })
                                ) : '-'}
                              </TableCell>
                              <TableCell className="text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.proxy || '-')}>
                                {result.proxy || '-'}
                              </TableCell>
                              <TableCell className="text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(result.message || '-')}>
                                {result.message || '-'}
                              </TableCell>
                              <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-center" onClick={() => copyToClipboard(JSON.stringify(result, null, 2))} title="Click để copy toàn bộ dữ liệu">
                                <span className="text-xs text-gray-500 select-none">JSON</span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-6">
            <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
              <CardHeader className="border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5 text-orange-600" />
                    Lịch sử Kiểm tra Tài khoản
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllHistory}
                      className="h-8"
                    >
                      <Checkbox 
                        checked={selectedHistoryItems.length === paginatedHistory.length}
                        className="mr-2"
                      />
                      Chọn tất cả ({selectedHistoryItems.length})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const selectedData = filteredHistory.filter(item => 
                          selectedHistoryItems.includes(item.id)
                        );
                        exportToExcel(selectedData, 'lich-su-kiem-tra');
                      }}
                      disabled={selectedHistoryItems.length === 0}
                      className="h-8"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Xuất Excel ({selectedHistoryItems.length})
                    </Button>
                  </div>
                </div>
                {/* Mobile Filters */}
                {isMobile ? (
                  <div className="flex flex-col gap-4 mt-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="relative">
                          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Tìm kiếm..."
                            value={searchHistory}
                            onChange={(e) => setSearchHistory(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </div>
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Filter className="h-4 w-4" />
                          </Button>
                        </SheetTrigger>
                        <SheetContent>
                          <SheetHeader>
                            <SheetTitle>Bộ lọc tìm kiếm</SheetTitle>
                          </SheetHeader>
                          <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Trạng thái</Label>
                              <Select value={filterStatus} onValueChange={setFilterStatus}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Chọn trạng thái" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Tất cả</SelectItem>
                                  <SelectItem value="success">Thành công</SelectItem>
                                  <SelectItem value="failed">Thất bại</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Thời gian</Label>
                              <Select 
                                value={dateFilterType} 
                                onValueChange={(value) => {
                                  setDateFilterType(value);
                                  setHistoryPage(1);
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Chọn thời gian" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Tất cả thời gian</SelectItem>
                                  <SelectItem value="today">Hôm nay</SelectItem>
                                  <SelectItem value="yesterday">Hôm qua</SelectItem>
                                  <SelectItem value="week">Tuần này</SelectItem>
                                  <SelectItem value="month">Tháng này</SelectItem>
                                  <SelectItem value="custom">Tùy chọn</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {dateFilterType === "custom" && (
                              <div className="space-y-3">
                                <div className="space-y-2">
                                  <Label htmlFor="mobile-startDate" className="text-sm font-medium">Từ ngày</Label>
                                  <Input
                                    id="mobile-startDate"
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => {
                                      setStartDate(e.target.value);
                                      setHistoryPage(1);
                                    }}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="mobile-endDate" className="text-sm font-medium">Đến ngày</Label>
                                  <Input
                                    id="mobile-endDate"
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => {
                                      setEndDate(e.target.value);
                                      setHistoryPage(1);
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                            
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Số lượng hiển thị</Label>
                              <Select 
                                value={historyItemsPerPage.toString()} 
                                onValueChange={(value) => {
                                  setHistoryItemsPerPage(Number(value));
                                  setHistoryPage(1);
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Chọn số lượng" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="10">10</SelectItem>
                                  <SelectItem value="20">20</SelectItem>
                                  <SelectItem value="50">50</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </SheetContent>
                      </Sheet>
                    </div>
                  </div>
                ) : (
                  // Desktop Filters
                  <div className="flex items-center gap-4 mt-4">
                    <div className="flex-1">
                      <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Tìm kiếm theo cookie, username hoặc thông báo..."
                          value={searchHistory}
                          onChange={(e) => setSearchHistory(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-gray-400" />
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-3 py-2 border rounded-md text-sm"
                      >
                        <option value="all">Tất cả</option>
                        <option value="success">Thành công</option>
                        <option value="failed">Thất bại</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <select
                        value={dateFilterType}
                        onChange={(e) => {
                          setDateFilterType(e.target.value);
                          setHistoryPage(1);
                        }}
                        className="px-3 py-2 border rounded-md text-sm"
                      >
                        <option value="all">Tất cả thời gian</option>
                        <option value="today">Hôm nay</option>
                        <option value="yesterday">Hôm qua</option>
                        <option value="week">Tuần này</option>
                        <option value="month">Tháng này</option>
                        <option value="custom">Tùy chọn</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Hiển thị:</span>
                      <select
                        value={historyItemsPerPage}
                        onChange={(e) => {
                          setHistoryItemsPerPage(Number(e.target.value));
                          setHistoryPage(1);
                        }}
                        className="px-3 py-2 border rounded-md text-sm"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                  </div>
                )}
                
                {/* Custom Date Range - Desktop Only */}
                {!isMobile && dateFilterType === "custom" && (
                  <div className="flex items-center gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="startDate" className="text-sm text-gray-600 dark:text-gray-400">
                        Từ ngày:
                      </Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          setHistoryPage(1);
                        }}
                        className="w-40"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="endDate" className="text-sm text-gray-600 dark:text-gray-400">
                        Đến ngày:
                      </Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={endDate}
                        onChange={(e) => {
                          setEndDate(e.target.value);
                          setHistoryPage(1);
                        }}
                        className="w-40"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setStartDate("");
                        setEndDate("");
                        setHistoryPage(1);
                      }}
                      className="h-8"
                    >
                      Xóa bộ lọc
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <History className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>Chưa có lịch sử kiểm tra</p>
                    <p className="text-sm">Thực hiện kiểm tra tài khoản để xem lịch sử</p>
                  </div>
                ) : isMobile ? (
                  <ScrollArea className="h-96 p-4">
                    {paginatedHistory.map((item: AccountCheckHistory) => (
                      <AccountCheckCard 
                        key={item.id} 
                        item={item}
                        isSelected={selectedHistoryItems.includes(item.id)}
                        onToggleSelection={(id) => toggleHistorySelection(parseInt(id))}
                      />
                    ))}
                  </ScrollArea>
                ) : (
                  <>
                    <ScrollArea className="h-96">
                      <Table>
                        <TableHeader className="bg-gray-50 dark:bg-slate-900/50 sticky top-0">
                          <TableRow>
                            <TableHead className="w-12">
                              <Checkbox
                                checked={selectedHistoryItems.length === paginatedHistory.length && paginatedHistory.length > 0}
                                onCheckedChange={handleSelectAllHistory}
                              />
                            </TableHead>
                            <TableHead className="font-semibold w-32">Thời gian</TableHead>
                            <TableHead className="font-semibold w-48">Cookie ID</TableHead>
                            <TableHead className="font-semibold w-64">Thông tin tài khoản</TableHead>
                            <TableHead className="font-semibold w-24">Trạng thái</TableHead>
                            <TableHead className="font-semibold">Kết quả</TableHead>
                            <TableHead className="font-semibold w-20">Thao tác</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedHistory.map((item) => (
                            <TableRow key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                              <TableCell>
                                <Checkbox
                                  checked={selectedHistoryItems.includes(item.id)}
                                  onCheckedChange={() => toggleHistorySelection(item.id)}
                                />
                              </TableCell>
                              <TableCell className="text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(new Date(item.createdAt).toLocaleString('vi-VN'))}>
                                <div className="flex flex-col">
                                  <span className="font-medium text-gray-900 dark:text-gray-100">
                                    {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                                  </span>
                                  <span className="text-gray-500">
                                    {new Date(item.createdAt).toLocaleTimeString('vi-VN', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyCookieToClipboard(item.cookieId)}>
                                <div className="space-y-1">
                                  <span className="font-mono text-sm font-medium text-blue-600 dark:text-blue-400">
                                    {getCookiePreview(item.cookieId).substring(0, 15)}...
                                  </span>
                                  {item.proxy && (
                                    <div className="text-xs text-gray-500">
                                      Proxy: {item.proxy}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                const accountInfo = [
                                  item.username && `Username: ${item.username}`,
                                  item.email && `Email: ${item.email}`,
                                  item.phone && `Phone: ${item.phone}`,
                                  item.userid && `UserID: ${item.userid}`,
                                  item.shopid && `ShopID: ${item.shopid}`
                                ].filter(Boolean).join('\n');
                                copyToClipboard(accountInfo || 'Không có thông tin tài khoản');
                              }}>
                                <div className="space-y-1">
                                  {item.username && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-gray-500">User:</span>
                                      <span className="font-medium text-sm">{item.username}</span>
                                    </div>
                                  )}
                                  {item.email && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-gray-500">Email:</span>
                                      <span className="text-sm">{item.email}</span>
                                    </div>
                                  )}
                                  {item.phone && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-gray-500">Phone:</span>
                                      <span className="text-sm">{item.phone}</span>
                                    </div>
                                  )}
                                  {(item.userid || item.shopid) && (
                                    <div className="flex gap-3">
                                      {item.userid && (
                                        <span className="text-xs font-mono text-gray-600">
                                          ID: {item.userid}
                                        </span>
                                      )}
                                      {item.shopid && (
                                        <span className="text-xs font-mono text-gray-600">
                                          Shop: {item.shopid}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(item.status ? 'Thành công' : 'Thất bại')}>
                                {getStatusBadge(item)}
                              </TableCell>
                              <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => copyToClipboard(item.status ? 'Thành công' : item.message)}>
                                <div className="space-y-1">
                                  <div className={`text-sm ${item.status ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                                    {item.status ? '✓ Thành công' : '✗ Thất bại'}
                                  </div>
                                  {!item.status && item.message && (
                                    <div className="text-xs text-gray-600 dark:text-gray-400" title={item.message}>
                                      {item.message.length > 50 ? `${item.message.substring(0, 50)}...` : item.message}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-center" onClick={() => copyToClipboard(JSON.stringify(item, null, 2))} title="Click để copy toàn bộ dữ liệu">
                                <span className="text-xs text-gray-500 select-none">JSON</span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                    
                    {filteredHistory.length > 0 && (
                      <div className="flex items-center justify-between px-6 py-4 border-t">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Hiển thị {((historyPage - 1) * historyItemsPerPage) + 1} - {Math.min(historyPage * historyItemsPerPage, filteredHistory.length)} của {filteredHistory.length} bản ghi
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setHistoryPage(Math.max(1, historyPage - 1))}
                            disabled={historyPage === 1}
                          >
                            Trước
                          </Button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalHistoryPages) }, (_, i) => {
                              const page = i + 1;
                              return (
                                <Button
                                  key={page}
                                  variant={historyPage === page ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setHistoryPage(page)}
                                  className="w-8 h-8"
                                >
                                  {page}
                                </Button>
                              );
                            })}
                            {totalHistoryPages > 5 && (
                              <>
                                <span className="text-gray-400">...</span>
                                <Button
                                  variant={historyPage === totalHistoryPages ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setHistoryPage(totalHistoryPages)}
                                  className="w-8 h-8"
                                >
                                  {totalHistoryPages}
                                </Button>
                              </>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setHistoryPage(Math.min(totalHistoryPages, historyPage + 1))}
                            disabled={historyPage === totalHistoryPages}
                          >
                            Tiếp
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