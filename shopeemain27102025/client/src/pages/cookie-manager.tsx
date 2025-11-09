import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FixedHeader } from "@/components/fixed-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Cookie, Plus, Copy, Search, Trash2, Download, ChevronLeft, ChevronRight, Eye, X, User, Mail, Phone, Hash, Shield, Clock, Calendar, Filter, ArrowUpDown, ArrowUp, ArrowDown, Globe, Package, Truck, MapPin, DollarSign, ShoppingBag } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";

interface ShopeeCookie {
  id: string;
  cookieType: string; // 'SPC_F' or 'SPC_ST'
  cookiePreview: string;
  shopeeRegion?: string;
  createdAt: Date;
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

interface TrackingCheckHistory {
  id: number;
  cookieId: string;
  cookiePreview: string;
  status: boolean;
  message: string;
  orderCount?: number;
  orderId?: string;
  trackingNumber?: string;
  trackingInfo?: string;
  shippingName?: string;
  shippingPhone?: string;
  shippingAddress?: string;
  orderName?: string;
  orderPrice?: string;
  orderTime?: string;
  proxy?: string;
  createdAt: string;
}

interface EmailAdditionHistory {
  id: number;
  cookieId: string;
  cookieValue: string;
  email: string;
  status: boolean;
  message: string;
  proxy?: string;
  createdAt: string;
}

export default function CookieManager() {
  const { toast } = useToast();
  const [cookieInput, setCookieInput] = useState("");
  const [selectedCookies, setSelectedCookies] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedAccountInfo, setSelectedAccountInfo] = useState<AccountCheckHistory | null>(null);
  const [selectedTrackingInfo, setSelectedTrackingInfo] = useState<TrackingCheckHistory[]>([]);
  const [selectedEmailInfo, setSelectedEmailInfo] = useState<EmailAdditionHistory | null>(null);
  const [isTrackingDialogOpen, setIsTrackingDialogOpen] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  
  // Date filtering state
  const [dateFilterType, setDateFilterType] = useState("all"); // "all", "today", "yesterday", "week", "month", "custom"
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  
  // Sorting state
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Fetch user's cookies
  const { data: cookies = [], isLoading } = useQuery<ShopeeCookie[]>({
    queryKey: ["/api/shopee-cookies"],
  });

  // Fetch account check history
  const { data: accountChecks = [] } = useQuery({
    queryKey: ["/api/account-checks"],
  });

  // Fetch tracking check history
  const { data: trackingChecks = [] } = useQuery({
    queryKey: ["/api/tracking-checks"],
  });

  // Fetch email addition history
  const { data: emailAdditions = [] } = useQuery({
    queryKey: ["/api/email-additions"],
  });

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

  // Filter and paginate cookies
  const filteredCookies = useMemo(() => {
    let filtered = cookies;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(cookie => 
        cookie.id.toLowerCase().includes(query) ||
        cookie.cookieType.toLowerCase().includes(query) ||
        cookie.cookiePreview.toLowerCase().includes(query)
      );
    }

    // Date filter
    if (dateFilterType !== "all") {
      filtered = filtered.filter(cookie => {
        const cookieDate = new Date(cookie.createdAt);
        
        switch (dateFilterType) {
          case "today":
            return isToday(cookieDate);
          case "yesterday":
            return isYesterday(cookieDate);
          case "week":
            return isThisWeek(cookieDate);
          case "month":
            return isThisMonth(cookieDate);
          case "custom":
            if (startDate && endDate) {
              const start = new Date(startDate);
              const end = new Date(endDate);
              end.setHours(23, 59, 59, 999);
              return cookieDate >= start && cookieDate <= end;
            } else if (startDate) {
              const start = new Date(startDate);
              return cookieDate >= start;
            } else if (endDate) {
              const end = new Date(endDate);
              end.setHours(23, 59, 59, 999);
              return cookieDate <= end;
            }
            return true;
          default:
            return true;
        }
      });
    }

    // Apply sorting
    if (sortField) {
      filtered.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortField) {
          case 'id':
            aValue = a.id;
            bValue = b.id;
            break;
          case 'type':
            aValue = a.cookieType;
            bValue = b.cookieType;
            break;
          case 'value':
            aValue = a.cookiePreview;
            bValue = b.cookiePreview;
            break;
          case 'createdAt':
            aValue = new Date(a.createdAt);
            bValue = new Date(b.createdAt);
            break;
          case 'account':
            const aAccount = getAccountCheckInfo(a.id);
            const bAccount = getAccountCheckInfo(b.id);
            aValue = aAccount ? aAccount.username || aAccount.nickname || '' : '';
            bValue = bAccount ? bAccount.username || bAccount.nickname || '' : '';
            break;
          case 'tracking':
            const aTracking = getTrackingCheckInfo(a.id);
            const bTracking = getTrackingCheckInfo(b.id);
            aValue = aTracking.length;
            bValue = bTracking.length;
            break;
          case 'email':
            const aEmail = getEmailAdditionInfo(a.id);
            const bEmail = getEmailAdditionInfo(b.id);
            aValue = aEmail ? aEmail.email || '' : '';
            bValue = bEmail ? bEmail.email || '' : '';
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [cookies, searchQuery, dateFilterType, startDate, endDate, sortField, sortDirection]);

  // Get account check information for a cookie
  const getAccountCheckInfo = (cookieId: string): AccountCheckHistory | null => {
    const checks = accountChecks as AccountCheckHistory[];
    return checks.find(check => check.cookieId === cookieId && check.status) || null;
  };

  // Get tracking check information for a cookie (returns first record for compatibility)
  const getTrackingCheckInfo = (cookieId: string): TrackingCheckHistory[] => {
    const checks = trackingChecks as TrackingCheckHistory[];
    const trackingRecord = checks.find(check => check.cookieId === cookieId && check.status);
    
    if (!trackingRecord) return [];
    
    // Parse comma-separated multiple orders from single record
    const orderIds = trackingRecord.orderId?.split(',') || [''];
    const trackingNumbers = trackingRecord.trackingNumber?.split(',') || [''];
    const orderNames = trackingRecord.orderName?.split(' | ') || [''];
    const orderPrices = trackingRecord.orderPrice?.split(',') || [''];
    const orderTimes = trackingRecord.orderTime?.split(',') || [''];
    const shippingNames = trackingRecord.shippingName?.split(',') || [''];
    const shippingPhones = trackingRecord.shippingPhone?.split(',') || [''];
    const shippingAddresses = trackingRecord.shippingAddress?.split(' | ') || [''];
    const trackingInfos = trackingRecord.trackingInfo?.split(' | ') || [''];
    
    const orderCount = Math.max(orderIds.length, 1);
    
    // Create array of orders from parsed data
    const orders = [];
    for (let i = 0; i < orderCount; i++) {
      orders.push({
        ...trackingRecord,
        orderId: orderIds[i] || '',
        trackingNumber: trackingNumbers[i] || '',
        orderName: orderNames[i] || '',
        orderPrice: orderPrices[i] || '',
        orderTime: orderTimes[i] || '',
        shippingName: shippingNames[i] || '',
        shippingPhone: shippingPhones[i] || '',
        shippingAddress: shippingAddresses[i] || '',
        trackingInfo: trackingInfos[i] || ''
      });
    }
    
    return orders;
  };

  // Get all tracking check information for a cookie (returns all records)
  const getAllTrackingCheckInfo = (cookieId: string): TrackingCheckHistory[] => {
    const checks = trackingChecks as TrackingCheckHistory[];
    return checks.filter(check => check.cookieId === cookieId && check.status) || [];
  };

  // Get email addition information for a cookie
  const getEmailAdditionInfo = (cookieId: string): EmailAdditionHistory | null => {
    const additions = emailAdditions as EmailAdditionHistory[];
    return additions.find(addition => addition.cookieId === cookieId && addition.status) || null;
  };

  // Show tracking detail popup
  const showTrackingDetail = (cookieId: string) => {
    const trackingInfo = getTrackingCheckInfo(cookieId);
    if (trackingInfo.length > 0) {
      setSelectedTrackingInfo(trackingInfo);
      setIsTrackingDialogOpen(true);
    }
  };

  // Show email detail popup
  const showEmailDetail = (cookieId: string) => {
    const emailInfo = getEmailAdditionInfo(cookieId);
    if (emailInfo) {
      setSelectedEmailInfo(emailInfo);
      setIsEmailDialogOpen(true);
    }
  };

  // Handle column sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get sort icon for column
  const getSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4" />
      : <ArrowDown className="h-4 w-4" />;
  };

  // Format Vietnamese time
  const formatVietnameseTime = (timeString: string): string => {
    if (!timeString) return "";
    
    // Check if it's an epoch timestamp (all digits)
    if (/^\d+$/.test(timeString)) {
      const epochTime = parseInt(timeString) * 1000; // Convert to milliseconds
      return new Date(epochTime).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour12: false
      });
    }
    
    // Otherwise try to parse as regular date
    try {
      return new Date(timeString).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour12: false
      });
    } catch {
      return timeString;
    }
  };

  const totalPages = Math.ceil(filteredCookies.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCookies = filteredCookies.slice(startIndex, startIndex + itemsPerPage);

  // Reset to first page when search query changes
  useMemo(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Reset to first page when items per page changes
  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  // Function to detect Shopee region based on cookie string
  const detectShopeeRegion = (cookieString: string) => {
    if (cookieString.includes('shopee.vn')) return 'Vietnam';
    if (cookieString.includes('shopee.sg')) return 'Singapore';
    if (cookieString.includes('shopee.my')) return 'Malaysia';
    if (cookieString.includes('shopee.th')) return 'Thailand';
    if (cookieString.includes('shopee.ph')) return 'Philippines';
    if (cookieString.includes('shopee.tw')) return 'Taiwan';
    if (cookieString.includes('shopee.br')) return 'Brazil';
    return 'Standard';
  };

  // Function to parse cookies from input text - each line is a separate cookie
  const parseCookies = (input: string) => {
    const lines = input.split('\n').filter(line => line.trim());
    const cookies: { cookieType: string; cookieValue: string; shopeeRegion?: string }[] = [];
    
    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('SPC_ST=')) {
        const region = detectShopeeRegion(trimmedLine);
        cookies.push({ 
          cookieType: 'SPC_ST', 
          cookieValue: trimmedLine, // Store the complete cookie string including prefix
          shopeeRegion: region
        });
      } else if (trimmedLine.startsWith('SPC_F=')) {
        const region = detectShopeeRegion(trimmedLine);
        cookies.push({ 
          cookieType: 'SPC_F', 
          cookieValue: trimmedLine, // Store the complete cookie string including prefix
          shopeeRegion: region
        });
      }
    });
    
    return cookies;
  };

  // Add new cookies
  const addCookieMutation = useMutation({
    mutationFn: async (cookiesData: { cookieType: string; cookieValue: string; shopeeRegion?: string }[]) => {
      // Filter out duplicate cookies
      const existingCookies = cookies || [];
      const newCookies = cookiesData.filter(newCookie => {
        const newCookiePreview = newCookie.cookieValue.substring(0, 50);
        return !existingCookies.some(existing => 
          existing.cookieType === newCookie.cookieType && 
          existing.cookiePreview === newCookiePreview
        );
      });

      if (newCookies.length === 0) {
        throw new Error("Tất cả cookie đã tồn tại trong hệ thống");
      }

      if (newCookies.length < cookiesData.length) {
        const duplicateCount = cookiesData.length - newCookies.length;
        console.log(`Bỏ qua ${duplicateCount} cookie trùng lặp`);
      }

      const results = [];
      for (const data of newCookies) {
        const result = await apiRequest({
          url: "/api/shopee-cookies",
          method: "POST",
          body: {
            cookieType: data.cookieType,
            cookieValue: data.cookieValue,
            shopeeRegion: data.shopeeRegion
          }
        });
        results.push(result);
      }
      return { results, duplicateCount: cookiesData.length - newCookies.length };
    },
    onSuccess: (data) => {
      const { results, duplicateCount } = data;
      let description = `Đã thêm ${results.length} cookie Shopee mới`;
      if (duplicateCount > 0) {
        description += `, bỏ qua ${duplicateCount} cookie trùng lặp`;
      }
      
      toast({
        title: "Thành công!",
        description: description,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/shopee-cookies"] });
      setCookieInput("");
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể thêm cookie",
        variant: "destructive",
      });
    }
  });

  // Delete selected cookies
  const deleteCookiesMutation = useMutation({
    mutationFn: async (cookieIds: string[]) => {
      const results = [];
      for (const id of cookieIds) {
        const result = await apiRequest({
          url: `/api/shopee-cookies/${id}`,
          method: "DELETE"
        });
        results.push(result);
      }
      return results;
    },
    onSuccess: (results) => {
      toast({
        title: "Thành công!",
        description: `Đã xóa ${results.length} cookie`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/shopee-cookies"] });
      setSelectedCookies([]);
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể xóa cookie",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cookieInput.trim()) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập cookie",
        variant: "destructive",
      });
      return;
    }

    const parsedCookies = parseCookies(cookieInput);
    if (parsedCookies.length === 0) {
      toast({
        title: "Lỗi",
        description: "Không thể phân tích cookie. Vui lòng kiểm tra định dạng.",
        variant: "destructive",
      });
      return;
    }

    addCookieMutation.mutate(parsedCookies);
  };

  const copyToClipboard = async (cookieId: string) => {
    try {
      // Fetch full cookie value from API
      const fullCookie = await apiRequest({
        url: `/api/shopee-cookies/${cookieId}`,
        method: "GET"
      });
      
      // Copy full cookie value
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

  const toggleSelectCookie = (cookieId: string) => {
    setSelectedCookies(prev => 
      prev.includes(cookieId) 
        ? prev.filter(id => id !== cookieId)
        : [...prev, cookieId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedCookies.length === paginatedCookies.length && paginatedCookies.length > 0) {
      setSelectedCookies([]);
    } else {
      setSelectedCookies(paginatedCookies.map(cookie => cookie.id));
    }
  };

  const copySelectedCookies = async () => {
    try {
      const selectedCookieData = filteredCookies.filter(cookie => selectedCookies.includes(cookie.id));
      
      // Fetch full cookie values for all selected cookies
      const fullCookiesPromises = selectedCookieData.map(cookie =>
        apiRequest({
          url: `/api/shopee-cookies/${cookie.id}`,
          method: "GET"
        })
      );
      
      const fullCookies = await Promise.all(fullCookiesPromises);
      const cookieText = fullCookies.map(cookie => cookie.cookieValue).join('\n');
      
      await navigator.clipboard.writeText(cookieText);
      toast({
        title: "Đã sao chép!",
        description: `Đã sao chép ${selectedCookies.length} cookie đầy đủ vào clipboard`,
      });
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể sao chép cookie",
        variant: "destructive",
      });
    }
  };

  const deleteSelectedCookies = () => {
    if (selectedCookies.length === 0) return;
    
    if (confirm(`Bạn có chắc muốn xóa ${selectedCookies.length} cookie đã chọn?`)) {
      deleteCookiesMutation.mutate(selectedCookies);
    }
  };

  return (
    <>
      <FixedHeader />
      <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 pt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center justify-center gap-3">
                <Cookie className="h-8 w-8 text-orange-600" />
                Quản Lý Cookie Shopee
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Nhập cookie mỗi dòng một cookie, hệ thống sẽ tự động phát hiện loại SPC_F và SPC_ST
              </p>
            </div>

            {/* Cookie Input Form */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Thêm Cookie Shopee
                </CardTitle>
                <CardDescription>
                  Nhập cookie theo định dạng: SPC_ST=... hoặc SPC_F=... (mỗi dòng một cookie)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="cookieInput">Cookie Input *</Label>
                    <Textarea
                      id="cookieInput"
                      placeholder={`Ví dụ:\nSPC_ST=.Wm42MkF2clZtTVoycVVKeZj6gOblPauWSe2JLGfxGhl3vA...\nSPC_F=mndmandms\nSPC_ST=.aXNqRFBMT...\nSPC_F=abc123def`}
                      value={cookieInput}
                      onChange={(e) => setCookieInput(e.target.value)}
                      className="min-h-[150px] font-mono text-sm"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Mỗi dòng một cookie. Hệ thống sẽ tự động detect SPC_F và SPC_ST
                    </p>
                  </div>
                  
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                      <Search className="h-4 w-4" />
                      <span className="text-sm font-medium">Tự động phát hiện và kiểm tra cookie trùng lặp</span>
                    </div>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      Hệ thống sẽ tự động bỏ qua cookie đã tồn tại và tạo ID ngẫu nhiên 6 ký tự
                    </p>
                  </div>

                  {/* Preview parsed cookies */}
                  {cookieInput && (
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Xem trước ({parseCookies(cookieInput).length} cookie được phát hiện):
                      </div>
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {parseCookies(cookieInput).map((cookie, index) => {
                          const isDuplicate = cookies?.some(existing => 
                            existing.cookieType === cookie.cookieType && 
                            existing.cookiePreview === cookie.cookiePreview
                          );
                          return (
                            <div key={index} className="flex items-center gap-2 text-xs">
                              <Badge variant={cookie.cookieType === 'SPC_F' ? 'default' : 'secondary'} className="text-xs">
                                {cookie.cookieType}
                              </Badge>
                              <code className="bg-white dark:bg-gray-700 px-1 rounded text-xs">
                                {cookie.cookiePreview.substring(0, 20)}...
                              </code>
                              {isDuplicate && (
                                <Badge variant="destructive" className="text-xs">
                                  Trùng lặp
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button 
                      type="submit" 
                      disabled={addCookieMutation.isPending}
                      className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700"
                    >
                      {addCookieMutation.isPending ? "Đang thêm..." : "Thêm Cookie"}
                    </Button>
                    {cookieInput && (
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setCookieInput("")}
                      >
                        Xóa
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Search and Controls */}
            {cookies.length > 0 && (
              <div className="space-y-4 mb-6">
                {/* Search Bar */}
                <div className="flex items-center gap-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Tìm kiếm theo ID, loại, hoặc giá trị cookie..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  {/* Date Filter */}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <select
                      value={dateFilterType}
                      onChange={(e) => {
                        setDateFilterType(e.target.value);
                        setCurrentPage(1);
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
                </div>
                
                {/* Custom Date Range */}
                {dateFilterType === "custom" && (
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
                          setCurrentPage(1);
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
                          setCurrentPage(1);
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
                        setCurrentPage(1);
                      }}
                      className="h-8"
                    >
                      Xóa bộ lọc
                    </Button>
                  </div>
                )}

                {/* Controls Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedCookies.length} / {filteredCookies.length} được chọn
                    </span>
                    {searchQuery && (
                      <span className="text-sm text-blue-600 dark:text-blue-400">
                        Tìm thấy {filteredCookies.length} / {cookies.length} cookie
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedCookies.length > 0 && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={copySelectedCookies}
                          className="flex items-center gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Copy ({selectedCookies.length})
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={deleteSelectedCookies}
                          disabled={deleteCookiesMutation.isPending}
                          className="flex items-center gap-2"
                        >
                          <Trash2 className="h-4 w-4" />
                          Xóa ({selectedCookies.length})
                        </Button>
                      </>
                    )}
                    {/* Items per page selector */}
                    <div className="flex items-center gap-2">
                      <Label htmlFor="itemsPerPage" className="text-sm whitespace-nowrap">
                        Hiển thị:
                      </Label>
                      <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
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
                  </div>
                </div>
              </div>
            )}

            {/* Cookie Table */}
            <div className="space-y-4">
              {isLoading ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="animate-pulse">
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : cookies.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <Cookie className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      Chưa có cookie nào
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Thêm cookie Shopee đầu tiên để bắt đầu quản lý tài khoản
                    </p>
                    <Button 
                      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                      className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Thêm Cookie
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectedCookies.length === paginatedCookies.length && paginatedCookies.length > 0}
                              onCheckedChange={toggleSelectAll}
                            />
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 select-none"
                            onClick={() => handleSort('id')}
                          >
                            <div className="flex items-center gap-1">
                              ID
                              {getSortIcon('id')}
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 select-none"
                            onClick={() => handleSort('type')}
                          >
                            <div className="flex items-center gap-1">
                              Loại
                              {getSortIcon('type')}
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 select-none"
                            onClick={() => handleSort('value')}
                          >
                            <div className="flex items-center gap-1">
                              Cookie Value
                              {getSortIcon('value')}
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 select-none"
                            onClick={() => handleSort('createdAt')}
                          >
                            <div className="flex items-center gap-1">
                              Thời gian
                              {getSortIcon('createdAt')}
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 select-none"
                            onClick={() => handleSort('account')}
                          >
                            <div className="flex items-center gap-1">
                              Account
                              {getSortIcon('account')}
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 select-none"
                            onClick={() => handleSort('tracking')}
                          >
                            <div className="flex items-center gap-1">
                              Tracking
                              {getSortIcon('tracking')}
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 select-none"
                            onClick={() => handleSort('email')}
                          >
                            <div className="flex items-center gap-1">
                              Email
                              {getSortIcon('email')}
                            </div>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedCookies.flatMap((cookie: ShopeeCookie) => {
                          const accountInfo = getAccountCheckInfo(cookie.id);
                          const rows = [
                            <TableRow key={cookie.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedCookies.includes(cookie.id)}
                                  onCheckedChange={() => toggleSelectCookie(cookie.id)}
                                />
                              </TableCell>
                              <TableCell className="font-medium">{cookie.id}</TableCell>
                              <TableCell>
                                <Badge variant={cookie.cookieType === 'SPC_F' ? 'default' : 'secondary'} className="text-xs">
                                  {cookie.cookieType}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2 max-w-md">
                                  <code className="font-mono text-xs bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded truncate">
                                    {cookie.cookiePreview.length > 50 
                                      ? `${cookie.cookiePreview.substring(0, 25)}...${cookie.cookiePreview.substring(cookie.cookiePreview.length - 15)}`
                                      : cookie.cookiePreview
                                    }
                                  </code>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => copyToClipboard(cookie.id)}
                                    className="h-6 px-1"
                                    title="Copy full cookie value"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-gray-500">
                                {format(new Date(cookie.createdAt), "dd/MM/yyyy HH:mm")}
                              </TableCell>
                              <TableCell>
                                {accountInfo ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setSelectedAccountInfo(accountInfo)}
                                    className="h-6 px-1"
                                    title="Xem thông tin tài khoản"
                                  >
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                ) : (
                                  <span className="text-xs text-gray-400">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {getTrackingCheckInfo(cookie.id).length > 0 ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => showTrackingDetail(cookie.id)}
                                    className="h-6 px-1"
                                    title="Xem lịch sử tracking"
                                  >
                                    <Eye className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                  </Button>
                                ) : (
                                  <span className="text-xs text-gray-400">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {getEmailAdditionInfo(cookie.id) ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => showEmailDetail(cookie.id)}
                                    className="h-6 px-1"
                                    title="Xem lịch sử email"
                                  >
                                    <Eye className="h-3 w-3 text-green-600 dark:text-green-400" />
                                  </Button>
                                ) : (
                                  <span className="text-xs text-gray-400">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ];



                          return rows;
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Pagination Controls */}
              {filteredCookies.length > 0 && totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Hiển thị {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredCookies.length)} của {filteredCookies.length} cookie
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="flex items-center gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Trước
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        
                        return (
                          <Button
                            key={pageNum}
                            size="sm"
                            variant={currentPage === pageNum ? "default" : "outline"}
                            onClick={() => setCurrentPage(pageNum)}
                            className="w-8 h-8 p-0"
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="flex items-center gap-1"
                    >
                      Sau
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* How to get cookies guide */}
            <Card className="mt-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cookie className="h-5 w-5" />
                  Hướng dẫn lấy Cookie
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-2">Cách 1: Sử dụng Browser Developer Tools</h4>
                    <ol className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
                      <li>1. Mở trang Shopee và đăng nhập</li>
                      <li>2. Nhấn F12 để mở Developer Tools</li>
                      <li>3. Vào tab Application → Cookies → shopee.vn</li>
                      <li>4. Tìm và sao chép giá trị SPC_F và SPC_ST</li>
                    </ol>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Cách 2: Sử dụng Extension</h4>
                    <ol className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
                      <li>1. Cài extension "Cookie Editor"</li>
                      <li>2. Mở trang Shopee đã đăng nhập</li>
                      <li>3. Click vào icon extension</li>
                      <li>4. Tìm và sao chép SPC_F và SPC_ST</li>
                    </ol>
                  </div>
                </div>
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Lưu ý:</strong> Mỗi dòng chỉ nên có một cookie (SPC_F hoặc SPC_ST). Cookie có thể hết hạn theo thời gian.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Account Information Dialog */}
      <Dialog open={!!selectedAccountInfo} onOpenChange={() => setSelectedAccountInfo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Thông tin tài khoản Shopee
            </DialogTitle>
          </DialogHeader>
          
          {selectedAccountInfo && (
            <div className="space-y-6">
              {/* Status Banner */}
              <div className={`p-4 rounded-lg border ${
                selectedAccountInfo.status 
                  ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' 
                  : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
              }`}>
                <div className="flex items-center gap-2">
                  <Shield className={`h-4 w-4 ${
                    selectedAccountInfo.status ? 'text-green-600' : 'text-red-600'
                  }`} />
                  <span className={`font-medium ${
                    selectedAccountInfo.status ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
                  }`}>
                    {selectedAccountInfo.status ? 'Tài khoản hoạt động' : 'Tài khoản có vấn đề'}
                  </span>
                </div>
                {selectedAccountInfo.message && (
                  <p className={`text-sm mt-1 ${
                    selectedAccountInfo.status ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                  }`}>
                    {selectedAccountInfo.message}
                  </p>
                )}
              </div>

              {/* Account Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white border-b pb-2">
                    Thông tin cơ bản
                  </h3>
                  
                  {selectedAccountInfo.username && (
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Username</p>
                        <p className="font-medium">{selectedAccountInfo.username}</p>
                      </div>
                    </div>
                  )}
                  
                  {selectedAccountInfo.nickname && (
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Nickname</p>
                        <p className="font-medium">{selectedAccountInfo.nickname}</p>
                      </div>
                    </div>
                  )}
                  
                  {selectedAccountInfo.userid && (
                    <div className="flex items-center gap-3">
                      <Hash className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">User ID</p>
                        <p className="font-mono text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                          {selectedAccountInfo.userid}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white border-b pb-2">
                    Thông tin liên hệ
                  </h3>
                  
                  {selectedAccountInfo.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Email</p>
                        <p className="font-medium">{selectedAccountInfo.email}</p>
                      </div>
                    </div>
                  )}
                  
                  {selectedAccountInfo.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Số điện thoại</p>
                        <p className="font-medium">{selectedAccountInfo.phone}</p>
                      </div>
                    </div>
                  )}
                  
                  {selectedAccountInfo.shopid && (
                    <div className="flex items-center gap-3">
                      <Hash className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Shop ID</p>
                        <p className="font-mono text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                          {selectedAccountInfo.shopid}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Technical Information */}
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg space-y-3">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Thông tin kỹ thuật
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {selectedAccountInfo.ctime && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-500" />
                      <span className="text-gray-600 dark:text-gray-400">Ctime:</span>
                      <span className="font-mono">{selectedAccountInfo.ctime}</span>
                    </div>
                  )}
                  
                  {selectedAccountInfo.proxy && (
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-gray-500" />
                      <span className="text-gray-600 dark:text-gray-400">Proxy:</span>
                      <span className="font-mono">{selectedAccountInfo.proxy}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-600 dark:text-gray-400">Kiểm tra lúc:</span>
                    <span>{format(new Date(selectedAccountInfo.createdAt), "dd/MM/yyyy HH:mm")}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Cookie className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-600 dark:text-gray-400">Cookie ID:</span>
                    <span className="font-mono">{selectedAccountInfo.cookieId}</span>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <div className="flex justify-end">
                <Button
                  onClick={() => setSelectedAccountInfo(null)}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Đóng
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Tracking Check Detail Dialog */}
      <Dialog open={isTrackingDialogOpen} onOpenChange={setIsTrackingDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedTrackingInfo.length > 0 && (
            <div className="space-y-6">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <Eye className="h-5 w-5 text-blue-600" />
                  Chi tiết Tracking Check - {selectedTrackingInfo.length} đơn hàng
                </DialogTitle>
              </DialogHeader>

              {/* Summary Information */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="text-sm">
                      Tìm thấy {selectedTrackingInfo.length} đơn hàng
                    </Badge>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Cookie ID: {selectedTrackingInfo[0]?.cookieId}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Kiểm tra lúc: {format(new Date(selectedTrackingInfo[0]?.createdAt), "dd/MM/yyyy HH:mm")}
                  </div>
                </div>
              </div>

              {/* Multiple Orders Display */}
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {selectedTrackingInfo.map((order, index) => (
                  <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        Đơn hàng #{index + 1}
                      </h3>
                      <Badge variant={order.status ? "default" : "destructive"} className="text-xs">
                        {order.status ? "Thành công" : "Thất bại"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Order Information */}
                      <div className="space-y-3">
                        {order.orderId && (
                          <div className="flex items-center gap-2">
                            <Hash className="h-4 w-4 text-blue-600" />
                            <div>
                              <p className="text-xs text-gray-600 dark:text-gray-400">Order ID</p>
                              <p className="font-mono text-xs bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded text-blue-800 dark:text-blue-200">
                                {order.orderId}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {order.trackingNumber && (
                          <div className="flex items-center gap-2">
                            <Hash className="h-4 w-4 text-purple-600" />
                            <div>
                              <p className="text-xs text-gray-600 dark:text-gray-400">Tracking Number</p>
                              <p className="font-mono text-xs bg-purple-100 dark:bg-purple-900/30 px-2 py-1 rounded text-purple-800 dark:text-purple-200">
                                {order.trackingNumber}
                              </p>
                            </div>
                          </div>
                        )}

                        {order.orderPrice && (
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-green-600" />
                            <div>
                              <p className="text-xs text-gray-600 dark:text-gray-400">Giá đơn hàng</p>
                              <p className="font-mono text-xs bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded text-green-800 dark:text-green-200">
                                {order.orderPrice}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Shipping Information */}
                      <div className="space-y-3">
                        {order.shippingName && (
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-blue-600" />
                            <div>
                              <p className="text-xs text-gray-600 dark:text-gray-400">Người nhận</p>
                              <p className="text-xs bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded text-blue-800 dark:text-blue-200">
                                {order.shippingName}
                              </p>
                            </div>
                          </div>
                        )}

                        {order.shippingPhone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-green-600" />
                            <div>
                              <p className="text-xs text-gray-600 dark:text-gray-400">Số điện thoại</p>
                              <p className="font-mono text-xs bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded text-green-800 dark:text-green-200">
                                {order.shippingPhone}
                              </p>
                            </div>
                          </div>
                        )}

                        {order.orderName && (
                          <div className="flex items-start gap-2">
                            <ShoppingBag className="h-4 w-4 text-orange-600 mt-1" />
                            <div>
                              <p className="text-xs text-gray-600 dark:text-gray-400">Sản phẩm</p>
                              <p className="text-xs bg-orange-100 dark:bg-orange-900/30 px-2 py-1 rounded text-orange-800 dark:text-orange-200 leading-relaxed">
                                {order.orderName}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {order.shippingAddress && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-red-600 mt-1" />
                          <div>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Địa chỉ giao hàng</p>
                            <p className="text-xs bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded text-red-800 dark:text-red-200 leading-relaxed">
                              {order.shippingAddress}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Technical Information */}
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                  Thông tin kỹ thuật
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-600 dark:text-gray-400">Tổng số đơn hàng:</span>
                    <span className="font-mono">{selectedTrackingInfo.length}</span>
                  </div>
                  
                  {selectedTrackingInfo[0]?.proxy && (
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-gray-500" />
                      <span className="text-gray-600 dark:text-gray-400">Proxy:</span>
                      <span className="font-mono text-xs">{selectedTrackingInfo[0].proxy}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Close Button */}
              <div className="flex justify-end">
                <Button
                  onClick={() => setIsTrackingDialogOpen(false)}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Đóng
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Email Addition Detail Dialog */}
      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-green-600" />
              Chi tiết thêm Email
            </DialogTitle>
          </DialogHeader>
          
          {selectedEmailInfo && (
            <div className="space-y-6">
              {/* Status Banner */}
              <div className={`p-4 rounded-lg border ${
                selectedEmailInfo.status 
                  ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' 
                  : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
              }`}>
                <div className="flex items-center gap-2">
                  <Mail className={`h-4 w-4 ${
                    selectedEmailInfo.status ? 'text-green-600' : 'text-red-600'
                  }`} />
                  <span className={`font-medium ${
                    selectedEmailInfo.status ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
                  }`}>
                    {selectedEmailInfo.status ? 'Thêm email thành công' : 'Thêm email thất bại'}
                  </span>
                </div>
                {selectedEmailInfo.message && (
                  <p className={`text-sm mt-1 ${
                    selectedEmailInfo.status ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                  }`}>
                    {selectedEmailInfo.message}
                  </p>
                )}
              </div>

              {/* Email Details */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 dark:text-white border-b pb-2">
                  Thông tin email
                </h3>
                
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Email đã thêm</p>
                    <p className="font-medium">{selectedEmailInfo.email}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Cookie ID</p>
                    <p className="font-mono text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                      {selectedEmailInfo.cookieId}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Thời gian thực hiện</p>
                    <p className="font-medium">{formatVietnameseTime(selectedEmailInfo.createdAt)}</p>
                  </div>
                </div>

                {selectedEmailInfo.proxy && (
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Proxy sử dụng</p>
                      <p className="font-mono text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                        {selectedEmailInfo.proxy}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end">
                <Button 
                  onClick={() => setIsEmailDialogOpen(false)}
                  variant="outline"
                >
                  Đóng
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}