import { useState, useMemo } from "react";
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
  Truck,
  MapPin,
  Phone,
  ShoppingBag,
  Eye,
  X,
  Zap
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ShopeeCookie {
  id: string;
  cookieType: string;
  cookiePreview: string;
  shopeeRegion: string;
  createdAt: string;
}

interface RapidOrderDetail {
  order_id: string;
  tracking_number: string;
  description: string;
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  driver_phone?: string;
  driver_name?: string;
  item_id?: string;
  model_id?: string;
  shop_id?: string;
  name: string;
  image: string;
  item_price: number;
  order_price: number;
  final_total: number;
  order_time: string;
}

interface RapidCheckResult {
  cookieId: string;
  cookie?: string;
  status: boolean;
  message: string;
  orderCount?: number;
  orders?: RapidOrderDetail[];
  proxy?: string;
  driver_phone?: string;
  driver_name?: string;
}

interface RapidCheckHistory {
  id: number;
  cookieId: string;
  cookiePreview: string;
  status: boolean;
  message: string;
  orderCount?: number;
  // Order details fields
  orderId?: string;
  trackingNumber?: string;
  trackingInfo?: string;
  shippingName?: string;
  shippingPhone?: string;
  shippingAddress?: string;
  orderName?: string;
  orderPrice?: string;
  orderTime?: string;
  driverPhone?: string;
  driverName?: string;
  proxy?: string;
  createdAt: string;
}

export default function CookieRapidCheck() {
  const { toast } = useToast();
  
  // Click to copy function
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Đã sao chép!",
        description: `${label} đã được sao chép vào clipboard`,
      });
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể sao chép. Hãy thử chọn và copy thủ công.",
        variant: "destructive",
      });
    }
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

  const queryClient = useQueryClient();
  
  const [selectedCookies, setSelectedCookies] = useState<string[]>([]);
  const [proxyInput, setProxyInput] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<RapidCheckResult[]>([]);
  const [selectedResults, setSelectedResults] = useState<string[]>([]);
  
  // Bulk rapid check states
  const [bulkCookieText, setBulkCookieText] = useState("");
  const [isBulkChecking, setIsBulkChecking] = useState(false);
  const [bulkRapidResults, setBulkRapidResults] = useState<RapidCheckResult[]>([]);
  const [selectedBulkResults, setSelectedBulkResults] = useState<string[]>([]);
  
  // History pagination and filtering
  const [historyPage, setHistoryPage] = useState(1);
  const [historyItemsPerPage, setHistoryItemsPerPage] = useState(10);
  const [historySearch, setHistorySearch] = useState("");
  const [selectedHistory, setSelectedHistory] = useState<number[]>([]);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  
  // Date filtering for history
  const [dateFilterType, setDateFilterType] = useState("all"); // "all", "today", "yesterday", "week", "month", "custom"
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all", "success", "failed"

  // Get service pricing for Cookie_hỏa tốc
  const { data: pricingData } = useQuery<{ price: number }>({
    queryKey: ['/api/cookie-rapid-price'],
  });
  
  const cookieRapidPrice = pricingData?.price || 500;

  // Format time from Shopee to Vietnamese time
  const formatVietnameseTime = (timeString: string) => {
    if (!timeString || timeString === "Không có") return "-";
    
    try {
      // Check if it's a number (epoch timestamp)
      const timestamp = parseInt(timeString);
      if (!isNaN(timestamp) && timestamp > 0) {
        // Epoch timestamp - convert to Date (multiply by 1000 for milliseconds)
        const date = new Date(timestamp * 1000);
        
        // Convert to Vietnam time (UTC+7)
        const vietnamTime = date.toLocaleString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          hour12: false, // 24h format
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        return vietnamTime;
      }
      
      // Handle other formats as fallback
      let date: Date;
      
      // Check if it's already a timestamp or ISO string
      if (timeString.includes('T') || timeString.includes('-')) {
        date = new Date(timeString);
      } else {
        // If it's a Vietnamese format like "15/12/2024 10:30"
        const parts = timeString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{1,2}):(\d{2})/);
        if (parts) {
          const [, day, month, year, hour, minute] = parts;
          date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
        } else {
          // Try parsing directly
          date = new Date(timeString);
        }
      }
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return timeString; // Return original if can't parse
      }
      
      // Format to Vietnamese locale
      return date.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Ho_Chi_Minh',
        hour12: false
      });
    } catch (error) {
      return timeString; // Return original if error
    }
  };

  // Fetch user's cookies (only SPC_ST type)
  const { data: cookies = [], isLoading: cookiesLoading } = useQuery<ShopeeCookie[]>({
    queryKey: ["/api/shopee-cookies"],
    select: (data) => data.filter(cookie => cookie.cookieType === 'SPC_ST')
  });

  // Fetch rapid check history
  const { data: rapidHistory = [], isLoading: historyLoading } = useQuery<RapidCheckHistory[]>({
    queryKey: ["/api/cookie-rapid-checks"],
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

  // Filter rapid history with comprehensive filtering
  const getFilteredHistory = () => {
    return rapidHistory.filter(item => {
      const matchesSearch = !historySearch || 
        item.cookiePreview.toLowerCase().includes(historySearch.toLowerCase()) ||
        item.orderId?.toLowerCase().includes(historySearch.toLowerCase()) ||
        item.trackingNumber?.toLowerCase().includes(historySearch.toLowerCase()) ||
        item.orderName?.toLowerCase().includes(historySearch.toLowerCase()) ||
        item.driverPhone?.toLowerCase().includes(historySearch.toLowerCase()) ||
        item.driverName?.toLowerCase().includes(historySearch.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || 
        (statusFilter === "success" && item.status) ||
        (statusFilter === "failed" && !item.status);

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
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Sort newest first
  };

  const filteredHistoryData = getFilteredHistory();
  const totalHistoryPagesCount = Math.ceil(filteredHistoryData.length / historyItemsPerPage);
  const paginatedHistoryData = filteredHistoryData.slice(
    (historyPage - 1) * historyItemsPerPage,
    historyPage * historyItemsPerPage
  );

  // Rapid check mutation
  const rapidCheckMutation = useMutation({
    mutationFn: async (data: { cookieIds: string[] }) => {
      // Process cookies one by one since our API handles single checks
      const results = [];
      
      for (const cookieId of data.cookieIds) {
        try {
          const result = await apiRequest({
            url: "/api/cookie-rapid-checks",
            method: "POST",
            body: { cookieId }
          });
          results.push({
            cookieId,
            status: !result.message?.includes("chưa có số shipper"),
            message: result.message,
            driver_phone: result.driverPhone,
            driver_name: result.driverName,
            charged: result.charged,
            amount_charged: result.amount_charged,
            orders: result.orders || [],
            orderCount: result.orderCount || 0
          });
        } catch (error: any) {
          results.push({
            cookieId,
            status: false,
            message: error.message || "Lỗi khi kiểm tra",
            driver_phone: null,
            driver_name: null,
            charged: false,
            amount_charged: 0,
            orders: [],
            orderCount: 0
          });
        }
      }
      
      return results;
    },
    onSuccess: (results) => {
      setCheckResults(results);
      setIsChecking(false);
      queryClient.invalidateQueries({ queryKey: ["/api/cookie-rapid-checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
      toast({
        title: "Hoàn thành kiểm tra hỏa tốc!",
        description: `Đã kiểm tra ${results.length} cookie`,
      });
    },
    onError: (error: Error) => {
      setIsChecking(false);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể thực hiện kiểm tra hỏa tốc",
        variant: "destructive",
      });
    }
  });

  const handleCookieSelection = (cookieId: string) => {
    setSelectedCookies(prev => 
      prev.includes(cookieId) 
        ? prev.filter(id => id !== cookieId)
        : [...prev, cookieId]
    );
  };

  // History selection handlers
  const toggleHistorySelection = (id: number) => {
    setSelectedHistory(prev => 
      prev.includes(id) 
        ? prev.filter(itemId => itemId !== id)
        : [...prev, id]
    );
  };

  const handleSelectAllHistory = () => {
    const currentPageItems = paginatedHistoryData.map((item: RapidCheckHistory) => item.id);
    if (selectedHistory.length === currentPageItems.length) {
      setSelectedHistory([]);
    } else {
      setSelectedHistory(currentPageItems);
    }
  };

  // Bulk rapid check functions
  const parseBulkCookieText = (text: string) => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const entries: { cookie: string; proxy?: string }[] = [];
    
    for (const line of lines) {
      if (line.includes('|')) {
        const parts = line.split('|');
        const cookie = parts[0]?.trim();
        const proxy = parts[1]?.trim();
        if (cookie && cookie.length > 10) { // Basic validation for cookie length
          entries.push({ cookie, proxy: proxy || undefined });
        }
      } else {
        // Just cookie without proxy
        const cookie = line.trim();
        if (cookie && cookie.length > 10) { // Basic validation for cookie length
          entries.push({ cookie });
        }
      }
    }
    
    return entries;
  };

  const handleBulkRapidCheck = async () => {
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
        description: "Không có cookie hợp lệ nào được tìm thấy",
        variant: "destructive",
      });
      return;
    }

    setIsBulkChecking(true);
    setBulkRapidResults([]);

    try {
      // Process entries one by one using our single check API
      const results = [];
      
      for (const entry of entries) {
        try {
          // For bulk entries, pass the cookie string directly
          const result = await apiRequest({
            url: "/api/cookie-rapid-checks",
            method: "POST", 
            body: { cookie: entry.cookie } // Use cookie parameter for bulk
          });
          
          results.push({
            cookieId: entry.cookie,
            cookie: entry.cookie,
            status: !result.message?.includes("chưa có số shipper"),
            message: result.message,
            driver_phone: result.driverPhone,
            driver_name: result.driverName,
            charged: result.charged,
            amount_charged: result.amount_charged,
            proxy: entry.proxy
          });
        } catch (error: any) {
          results.push({
            cookieId: entry.cookie,
            cookie: entry.cookie,
            status: false,
            message: error.message || "Lỗi khi kiểm tra",
            driver_phone: null,
            driver_name: null,
            charged: false,
            amount_charged: 0,
            proxy: entry.proxy
          });
        }
      }

      setBulkRapidResults(results);
      queryClient.invalidateQueries({ queryKey: ["/api/cookie-rapid-checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
      
      toast({
        title: "Hoàn thành kiểm tra bulk hỏa tốc!",
        description: `Đã kiểm tra ${results.length} cookie`,
      });
    } catch (error: any) {
      console.error('Bulk rapid check error:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể thực hiện kiểm tra bulk hỏa tốc",
        variant: "destructive",
      });
    } finally {
      setIsBulkChecking(false);
    }
  };

  // CSV-safe string escaping
  const escapeCsvValue = (value: string | undefined | null): string => {
    if (!value) return '';
    
    // Convert to string and sanitize
    let sanitized = String(value);
    
    // Prevent CSV formula injection
    if (sanitized.match(/^[=+\-@]/)) {
      sanitized = "'" + sanitized;
    }
    
    // Escape quotes and wrap in quotes
    sanitized = sanitized.replace(/"/g, '""');
    return `"${sanitized}"`;
  };

  // Get full cookie preview by ID with fallback to history data
  const getFullCookiePreview = async (cookieId: string, historyItem?: RapidCheckHistory): Promise<string> => {
    // First try to find in current cookies array
    const foundCookie = cookies.find(cookie => cookie.id === cookieId);
    if (foundCookie?.cookiePreview) {
      return foundCookie.cookiePreview;
    }
    
    // If this is from history and has cookiePreview (which now contains full cookie), use it
    if (historyItem?.cookiePreview) {
      return historyItem.cookiePreview;
    }
    
    // Last resort: return cookie ID
    return cookieId;
  };

  // Export to Excel function with UTF-8 BOM
  const exportToExcel = async (data: RapidCheckHistory[], filename: string) => {
    // Get all full cookie previews first (now cookiePreview contains full value)
    const cookieValuesMap = new Map<string, string>();
    for (const item of data) {
      if (!cookieValuesMap.has(item.cookieId)) {
        const fullValue = await getFullCookiePreview(item.cookieId, item);
        cookieValuesMap.set(item.cookieId, fullValue);
      }
    }
    
    const worksheet = data.map(item => {
      const fullCookiePreview = cookieValuesMap.get(item.cookieId) || item.cookiePreview || item.cookieId;
      
      return {
        'Cookie Value': fullCookiePreview || item.cookiePreview || item.cookieId,
        'Cookie ID': item.cookieId,
        'Trạng thái': item.status ? 'Thành công' : 'Thất bại',
        'Order ID': item.orderId || '-',
        'Tracking Number': item.trackingNumber || '-',
        'Tên sản phẩm': item.orderName || '-',
        'Giá tiền': item.orderPrice ? 
          new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
          }).format(parseFloat(item.orderPrice)) : '-',
        'Người nhận': item.shippingName || '-',
        'SĐT nhận': item.shippingPhone || '-',
        'Địa chỉ giao hàng': item.shippingAddress || '-',
        'SĐT shipper': item.driverPhone || '-',
        'Tên shipper': item.driverName || '-',
        'Thời gian đặt': formatVietnameseTime(item.orderTime || ''),
        'Proxy': item.proxy || '-',
        'Thời gian kiểm tra': formatVietnameseTime(item.createdAt)
      };
    });

    // Convert to CSV with UTF-8 BOM and proper escaping
    const csvContent = [
      Object.keys(worksheet[0]).map(header => escapeCsvValue(header)).join(','),
      ...worksheet.map(row => Object.values(row).map(field => escapeCsvValue(String(field))).join(','))
    ].join('\n');

    // Add UTF-8 BOM
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    toast({
      title: "Xuất Excel thành công!",
      description: `Đã xuất ${data.length} bản ghi`,
    });
  };

  const handleSelectAllCookies = () => {
    if (selectedCookies.length === (cookies as ShopeeCookie[]).length) {
      setSelectedCookies([]);
    } else {
      setSelectedCookies((cookies as ShopeeCookie[]).map(cookie => cookie.id));
    }
  };

  const handleStartCheck = () => {
    if (selectedCookies.length === 0) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn ít nhất một cookie để kiểm tra",
        variant: "destructive",
      });
      return;
    }

    setIsChecking(true);
    setCheckResults([]);
    
    rapidCheckMutation.mutate({
      cookieIds: selectedCookies
    });
  };

  const handleResultSelection = (cookieId: string) => {
    setSelectedResults(prev => 
      prev.includes(cookieId) 
        ? prev.filter(id => id !== cookieId)
        : [...prev, cookieId]
    );
  };

  const showOrderDetail = (result: RapidCheckResult) => {
    const firstOrder = result.orders?.[0];
    setSelectedOrderDetail({
      cookieId: result.cookieId,
      status: result.status,
      orderData: firstOrder,
      proxy: result.proxy,
      driverPhone: result.driver_phone,
      driverName: result.driver_name
    });
    setIsDetailDialogOpen(true);
  };

  const showHistoryDetail = (item: RapidCheckHistory) => {
    setSelectedOrderDetail({
      cookieId: item.cookieId,
      status: item.status,
      historyData: item,
      driverPhone: item.driverPhone,
      driverName: item.driverName
    });
    setIsDetailDialogOpen(true);
  };

  const handleSelectAllResults = () => {
    if (selectedResults.length === checkResults.length) {
      setSelectedResults([]);
    } else {
      setSelectedResults(checkResults.map(result => result.cookieId));
    }
  };

  // Export regular rapid results to Excel
  const exportResultsToExcel = async () => {
    const dataToExport = selectedResults.length > 0 
      ? checkResults.filter(result => selectedResults.includes(result.cookieId))
      : checkResults;
    
    if (dataToExport.length === 0) {
      toast({
        title: "Thông báo",
        description: "Không có dữ liệu để xuất",
        variant: "destructive",
      });
      return;
    }

    // Get all full cookie values first - use stored cookie or result data
    const cookieValuesMap = new Map<string, string>();
    for (const result of dataToExport) {
      if (!cookieValuesMap.has(result.cookieId)) {
        // For rapid check results, use the cookie value from result or lookup
        const fullCookie = cookies.find(cookie => cookie.id === result.cookieId);
        const fullValue = fullCookie?.cookiePreview || result.cookie || result.cookieId;
        cookieValuesMap.set(result.cookieId, fullValue);
      }
    }

    const csvContent = [
      [
        "Cookie Value",
        "Cookie ID", 
        "Trạng thái", 
        "Order ID", 
        "Tracking Number", 
        "Tên sản phẩm", 
        "Giá đơn hàng", 
        "Tên người nhận", 
        "SĐT người nhận", 
        "Địa chỉ giao hàng",
        "SĐT shipper",
        "Tên shipper",
        "Thời gian đặt", 
        "Mô tả tracking", 
        "Proxy"
      ].map(header => escapeCsvValue(header)).join(","),
      ...dataToExport.map(result => {
        const firstOrder = result.orders?.[0];
        const fullCookieValue = cookieValuesMap.get(result.cookieId) || result.cookie || result.cookieId;
        return [
          escapeCsvValue(fullCookieValue),
          escapeCsvValue(result.cookieId),
          escapeCsvValue(result.status ? "Thành công" : "Thất bại"),
          escapeCsvValue(firstOrder?.order_id || ""),
          escapeCsvValue(firstOrder?.tracking_number || ""),
          escapeCsvValue(firstOrder?.name || ""),
          escapeCsvValue(firstOrder?.order_price ? (firstOrder.order_price / 100000).toLocaleString('vi-VN') + " VND" : ""),
          escapeCsvValue(firstOrder?.shipping_name || ""),
          escapeCsvValue(firstOrder?.shipping_phone || ""),
          escapeCsvValue(firstOrder?.shipping_address || ""),
          escapeCsvValue(result.driver_phone || ""),
          escapeCsvValue(result.driver_name || ""),
          escapeCsvValue(formatVietnameseTime(firstOrder?.order_time || "")),
          escapeCsvValue(firstOrder?.description || ""),
          escapeCsvValue(result.proxy || "")
        ].join(",");
      })
    ].join("\n");

    // Add BOM for proper UTF-8 encoding in Excel
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `cookie_rapid_check_results_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    toast({
      title: "Thành công!",
      description: `Đã xuất ${dataToExport.length} bản ghi với thông tin đơn hàng chi tiết`,
    });
  };

  // Bulk rapid selection handlers
  const handleSelectAllBulkResults = () => {
    if (selectedBulkResults.length === bulkRapidResults.length) {
      setSelectedBulkResults([]);
    } else {
      setSelectedBulkResults(bulkRapidResults.map(result => result.cookieId));
    }
  };

  const toggleBulkResultSelection = (cookieId: string) => {
    setSelectedBulkResults(prev => 
      prev.includes(cookieId) 
        ? prev.filter(id => id !== cookieId)
        : [...prev, cookieId]
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <FixedHeader />
      
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Zap className="h-8 w-8 text-white" />
          </div>
          <h1 data-testid="page-title" className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Check Cookie Hỏa Tốc
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Kiểm tra thông tin đơn hàng và shipper với tốc độ cao - Giá dịch vụ: {cookieRapidPrice.toLocaleString()}₫
          </p>
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            API: Shopee Order & Checkout List
          </Badge>
        </div>

        <Tabs defaultValue="single" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="single" data-testid="tab-single">Kiểm tra đơn lẻ</TabsTrigger>
            <TabsTrigger value="bulk" data-testid="tab-bulk">Kiểm tra hàng loạt</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">Lịch sử</TabsTrigger>
          </TabsList>

          {/* Single Check Tab */}
          <TabsContent value="single" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Cookie Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2" data-testid="cookie-selection-title">
                    <Package className="h-5 w-5" />
                    Chọn Cookie để kiểm tra ({cookies.length} cookie)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {cookiesLoading ? (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                      <p className="text-sm text-gray-500 mt-2">Đang tải cookie...</p>
                    </div>
                  ) : cookies.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Chưa có cookie SPC_ST nào</p>
                      <p className="text-sm">Vui lòng thêm cookie trước khi kiểm tra</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSelectAllCookies}
                          data-testid="select-all-cookies"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          {selectedCookies.length === cookies.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                        </Button>
                        <span className="text-sm text-gray-500">
                          Đã chọn: {selectedCookies.length}/{cookies.length}
                        </span>
                      </div>
                      
                      <ScrollArea className="h-64">
                        <div className="space-y-2">
                          {cookies.map((cookie) => (
                            <div
                              key={cookie.id}
                              className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              <Checkbox
                                checked={selectedCookies.includes(cookie.id)}
                                onCheckedChange={() => handleCookieSelection(cookie.id)}
                                data-testid={`cookie-checkbox-${cookie.id}`}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {cookie.cookiePreview.substring(0, 30)}...
                                </p>
                                <p className="text-xs text-gray-500">
                                  ID: {cookie.id} | {cookie.shopeeRegion || 'VN'}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>

                      <div className="space-y-3">
                        <div>
                          <Label htmlFor="proxy-input">Proxy (tùy chọn)</Label>
                          <Textarea
                            id="proxy-input"
                            placeholder="Nhập proxy theo định dạng: ip:port:username:password (mỗi proxy 1 dòng)"
                            value={proxyInput}
                            onChange={(e) => setProxyInput(e.target.value)}
                            rows={3}
                            data-testid="proxy-input"
                          />
                        </div>

                        <Button
                          onClick={handleStartCheck}
                          disabled={selectedCookies.length === 0 || isChecking}
                          className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
                          data-testid="start-check-button"
                        >
                          {isChecking ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              Đang kiểm tra hỏa tốc...
                            </>
                          ) : (
                            <>
                              <Zap className="h-4 w-4 mr-2" />
                              Bắt đầu kiểm tra hỏa tốc ({selectedCookies.length} cookie)
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Check Results */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2" data-testid="results-title">
                    <CheckCircle className="h-5 w-5" />
                    Kết quả kiểm tra ({checkResults.length})
                  </CardTitle>
                  {checkResults.length > 0 && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAllResults}
                        data-testid="select-all-results"
                      >
                        {selectedResults.length === checkResults.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => await exportResultsToExcel()}
                        data-testid="export-results-button"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Xuất Excel
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {checkResults.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Chưa có kết quả kiểm tra</p>
                      <p className="text-sm">Chọn cookie và bấm kiểm tra để xem kết quả</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-96">
                      <div className="space-y-3">
                        {checkResults.map((result, index) => (
                          <div
                            key={`${result.cookieId}-${index}`}
                            className="border rounded-lg p-4"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={selectedResults.includes(result.cookieId)}
                                  onCheckedChange={() => handleResultSelection(result.cookieId)}
                                  data-testid={`result-checkbox-${result.cookieId}`}
                                />
                                <div>
                                  <Badge 
                                    variant={result.status ? "default" : "destructive"}
                                    data-testid={`result-status-${result.cookieId}`}
                                  >
                                    {result.status ? "Thành công" : "Thất bại"}
                                  </Badge>
                                  <p className="text-sm text-gray-600 mt-1">
                                    Cookie: {result.cookie || cookies.find(c => c.id === result.cookieId)?.cookiePreview || result.cookieId}
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => showOrderDetail(result)}
                                data-testid={`view-detail-${result.cookieId}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>

                            <div className="space-y-2 text-sm">
                              <p><strong>Thông báo:</strong> {result.message}</p>
                              {result.driver_phone ? (
                                <div className="space-y-1">
                                  <p className="text-green-600 font-medium" data-testid={`driver-info-${result.cookieId}`}>
                                    ✓ Có thông tin shipper - Đã trừ {cookieRapidPrice.toLocaleString()}₫
                                  </p>
                                  <p><strong>SĐT Shipper:</strong> {result.driver_phone}</p>
                                  {result.driver_name && (
                                    <p><strong>Tên Shipper:</strong> {result.driver_name}</p>
                                  )}
                                  
                                  {/* Show full order details when shipper info is available */}
                                  {result.driver_phone && result.orders && result.orders.length > 0 && (
                                    <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200">
                                      <h5 className="font-semibold text-green-800 dark:text-green-200 mb-2">Thông tin đơn hàng chi tiết:</h5>
                                      {result.orders.map((order, idx) => (
                                        <div key={idx} className="space-y-1 text-xs">
                                          <p><strong>Mã đơn:</strong> {order.order_id}</p>
                                          <p><strong>Mã vận đơn:</strong> {order.tracking_number}</p>
                                          <p><strong>Sản phẩm:</strong> {order.name}</p>
                                          <p><strong>Giá:</strong> {(order.order_price / 100000).toLocaleString('vi-VN')} VND</p>
                                          <p><strong>Người nhận:</strong> {order.shipping_name}</p>
                                          <p><strong>SĐT nhận:</strong> {order.shipping_phone}</p>
                                          <p><strong>Địa chỉ:</strong> {order.shipping_address}</p>
                                          <p><strong>Thời gian đặt:</strong> {formatVietnameseTime(order.order_time)}</p>
                                          {order.description && (
                                            <p><strong>Ghi chú:</strong> {order.description}</p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-red-600 font-medium" data-testid={`no-driver-info-${result.cookieId}`}>
                                  ✗ Chưa có số shipper - Không trừ tiền
                                </p>
                              )}
                              {result.orderCount !== undefined && (
                                <p><strong>Số đơn hàng:</strong> {result.orderCount}</p>
                              )}
                              {result.proxy && (
                                <p><strong>Proxy:</strong> {result.proxy}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Bulk Check Tab */}
          <TabsContent value="bulk" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" data-testid="bulk-check-title">
                  <Globe className="h-5 w-5" />
                  Kiểm tra hàng loạt Cookie Hỏa Tốc
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="bulk-cookies">Danh sách Cookie</Label>
                  <Textarea
                    id="bulk-cookies"
                    placeholder={`Nhập danh sách cookie (mỗi cookie 1 dòng):\ncookie1\ncookie2|proxy\ncookie3`}
                    value={bulkCookieText}
                    onChange={(e) => setBulkCookieText(e.target.value)}
                    rows={8}
                    data-testid="bulk-cookies-input"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Định dạng: cookie hoặc cookie|proxy (mỗi dòng một cookie)
                  </p>
                </div>

                <Button
                  onClick={handleBulkRapidCheck}
                  disabled={!bulkCookieText.trim() || isBulkChecking}
                  className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
                  data-testid="bulk-check-button"
                >
                  {isBulkChecking ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Đang kiểm tra hàng loạt...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Kiểm tra hàng loạt hỏa tốc
                    </>
                  )}
                </Button>

                {/* Bulk Results */}
                {bulkRapidResults.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold" data-testid="bulk-results-title">
                        Kết quả hàng loạt ({bulkRapidResults.length})
                      </h3>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSelectAllBulkResults}
                          data-testid="select-all-bulk-results"
                        >
                          {selectedBulkResults.length === bulkRapidResults.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                        </Button>
                      </div>
                    </div>

                    <ScrollArea className="h-96">
                      <div className="space-y-3">
                        {bulkRapidResults.map((result, index) => (
                          <div
                            key={`bulk-${result.cookieId}-${index}`}
                            className="border rounded-lg p-4"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={selectedBulkResults.includes(result.cookieId)}
                                  onCheckedChange={() => toggleBulkResultSelection(result.cookieId)}
                                  data-testid={`bulk-result-checkbox-${result.cookieId}`}
                                />
                                <div>
                                  <Badge 
                                    variant={result.status ? "default" : "destructive"}
                                    data-testid={`bulk-result-status-${result.cookieId}`}
                                  >
                                    {result.status ? "Thành công" : "Thất bại"}
                                  </Badge>
                                  <p className="text-sm text-gray-600 mt-1">
                                    Cookie: {result.cookie || cookies.find(c => c.id === result.cookieId)?.cookiePreview || result.cookieId}
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => showOrderDetail(result)}
                                data-testid={`bulk-view-detail-${result.cookieId}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>

                            <div className="space-y-2 text-sm">
                              <p><strong>Thông báo:</strong> {result.message}</p>
                              {result.driver_phone ? (
                                <div className="space-y-1">
                                  <p className="text-green-600 font-medium" data-testid={`bulk-driver-info-${result.cookieId}`}>
                                    ✓ Có thông tin shipper - Đã trừ {cookieRapidPrice.toLocaleString()}₫
                                  </p>
                                  <p><strong>SĐT Shipper:</strong> {result.driver_phone}</p>
                                  {result.driver_name && (
                                    <p><strong>Tên Shipper:</strong> {result.driver_name}</p>
                                  )}
                                  
                                  {/* Show full order details when shipper info is available */}
                                  {result.driver_phone && result.orders && result.orders.length > 0 && (
                                    <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200">
                                      <h5 className="font-semibold text-green-800 dark:text-green-200 mb-2">Thông tin đơn hàng chi tiết:</h5>
                                      {result.orders.map((order, idx) => (
                                        <div key={idx} className="space-y-1 text-xs">
                                          <p><strong>Mã đơn:</strong> {order.order_id}</p>
                                          <p><strong>Mã vận đơn:</strong> {order.tracking_number}</p>
                                          <p><strong>Sản phẩm:</strong> {order.name}</p>
                                          <p><strong>Giá:</strong> {(order.order_price / 100000).toLocaleString('vi-VN')} VND</p>
                                          <p><strong>Người nhận:</strong> {order.shipping_name}</p>
                                          <p><strong>SĐT nhận:</strong> {order.shipping_phone}</p>
                                          <p><strong>Địa chỉ:</strong> {order.shipping_address}</p>
                                          <p><strong>Thời gian đặt:</strong> {formatVietnameseTime(order.order_time)}</p>
                                          {order.description && (
                                            <p><strong>Ghi chú:</strong> {order.description}</p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-red-600 font-medium" data-testid={`bulk-no-driver-info-${result.cookieId}`}>
                                  ✗ Chưa có số shipper - Không trừ tiền
                                </p>
                              )}
                              {result.orderCount !== undefined && (
                                <p><strong>Số đơn hàng:</strong> {result.orderCount}</p>
                              )}
                              {result.proxy && (
                                <p><strong>Proxy:</strong> {result.proxy}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" data-testid="history-title">
                  <History className="h-5 w-5" />
                  Lịch sử kiểm tra Cookie Hỏa Tốc ({filteredHistoryData.length})
                </CardTitle>
                {filteredHistoryData.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllHistory}
                      data-testid="select-all-history"
                    >
                      {selectedHistory.length === paginatedHistoryData.length ? 'Bỏ chọn trang này' : 'Chọn trang này'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const dataToExport = selectedHistory.length > 0 
                          ? filteredHistoryData.filter(item => selectedHistory.includes(item.id))
                          : filteredHistoryData;
                        await exportToExcel(dataToExport, `cookie_rapid_check_history_${new Date().toISOString().split('T')[0]}`);
                      }}
                      data-testid="export-history-button"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Xuất Excel {selectedHistory.length > 0 ? `(${selectedHistory.length})` : '(Tất cả)'}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div>
                    <Label htmlFor="history-search">Tìm kiếm</Label>
                    <Input
                      id="history-search"
                      placeholder="Cookie, Order ID, Tên sản phẩm..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      data-testid="history-search-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="status-filter">Trạng thái</Label>
                    <select
                      id="status-filter"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      data-testid="status-filter-select"
                    >
                      <option value="all">Tất cả</option>
                      <option value="success">Thành công</option>
                      <option value="failed">Thất bại</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="date-filter">Thời gian</Label>
                    <select
                      id="date-filter"
                      value={dateFilterType}
                      onChange={(e) => setDateFilterType(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      data-testid="date-filter-select"
                    >
                      <option value="all">Tất cả</option>
                      <option value="today">Hôm nay</option>
                      <option value="yesterday">Hôm qua</option>
                      <option value="week">Tuần này</option>
                      <option value="month">Tháng này</option>
                      <option value="custom">Tùy chọn</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="items-per-page">Hiển thị</Label>
                    <select
                      id="items-per-page"
                      value={historyItemsPerPage}
                      onChange={(e) => setHistoryItemsPerPage(parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      data-testid="items-per-page-select"
                    >
                      <option value={10}>10 mục/trang</option>
                      <option value={25}>25 mục/trang</option>
                      <option value={50}>50 mục/trang</option>
                      <option value={100}>100 mục/trang</option>
                    </select>
                  </div>
                </div>

                {/* Custom date range */}
                {dateFilterType === "custom" && (
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <Label htmlFor="start-date">Từ ngày</Label>
                      <Input
                        id="start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        data-testid="start-date-input"
                      />
                    </div>
                    <div>
                      <Label htmlFor="end-date">Đến ngày</Label>
                      <Input
                        id="end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        data-testid="end-date-input"
                      />
                    </div>
                  </div>
                )}

                {historyLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="text-sm text-gray-500 mt-2">Đang tải lịch sử...</p>
                  </div>
                ) : filteredHistoryData.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Không có lịch sử kiểm tra Cookie Hỏa Tốc</p>
                    <p className="text-sm">Thực hiện kiểm tra đầu tiên để xem lịch sử</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* History Table */}
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">
                              <Checkbox
                                checked={selectedHistory.length === paginatedHistoryData.length && paginatedHistoryData.length > 0}
                                onCheckedChange={handleSelectAllHistory}
                                data-testid="select-all-history-checkbox"
                              />
                            </TableHead>
                            <TableHead>Cookie</TableHead>
                            <TableHead>Trạng thái</TableHead>
                            <TableHead>Thông tin Shipper</TableHead>
                            <TableHead>Đơn hàng</TableHead>
                            <TableHead>Thời gian</TableHead>
                            <TableHead className="w-16">Chi tiết</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedHistoryData.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedHistory.includes(item.id)}
                                  onCheckedChange={() => toggleHistorySelection(item.id)}
                                  data-testid={`history-checkbox-${item.id}`}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="max-w-32 truncate text-sm font-mono">
                                  {item.cookiePreview}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant={item.status ? "default" : "destructive"}
                                  data-testid={`history-status-${item.id}`}
                                >
                                  {item.status ? "Thành công" : "Thất bại"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {item.driverPhone ? (
                                  <div className="text-sm" data-testid={`history-driver-info-${item.id}`}>
                                    <div className="text-green-600 font-medium">✓ Có shipper</div>
                                    <div>SĐT: {item.driverPhone}</div>
                                    {item.driverName && <div>Tên: {item.driverName}</div>}
                                  </div>
                                ) : (
                                  <div className="text-sm text-red-600" data-testid={`history-no-driver-${item.id}`}>
                                    ✗ Chưa có shipper
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {item.orderId && (
                                    <div>ID: {item.orderId.substring(0, 10)}...</div>
                                  )}
                                  {item.orderName && (
                                    <div className="max-w-32 truncate">{item.orderName}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {formatVietnameseTime(item.createdAt)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => showHistoryDetail(item)}
                                  data-testid={`history-view-detail-${item.id}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {totalHistoryPagesCount > 1 && (
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-500">
                          Hiển thị {((historyPage - 1) * historyItemsPerPage) + 1} - {Math.min(historyPage * historyItemsPerPage, filteredHistoryData.length)} của {filteredHistoryData.length} mục
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setHistoryPage(Math.max(1, historyPage - 1))}
                            disabled={historyPage === 1}
                            data-testid="previous-page-button"
                          >
                            Trước
                          </Button>
                          <span className="px-3 py-1 text-sm">
                            Trang {historyPage} / {totalHistoryPagesCount}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setHistoryPage(Math.min(totalHistoryPagesCount, historyPage + 1))}
                            disabled={historyPage === totalHistoryPagesCount}
                            data-testid="next-page-button"
                          >
                            Sau
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Order Detail Dialog */}
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="order-detail-dialog">
            <DialogHeader>
              <DialogTitle>Chi tiết kiểm tra Cookie Hỏa Tốc</DialogTitle>
            </DialogHeader>
            
            {selectedOrderDetail && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div 
                    className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                    onClick={() => copyToClipboard(selectedOrderDetail.cookieId, "Cookie ID")}
                    title="Click để sao chép"
                  >
                    <Copy className="h-3 w-3 text-gray-400" />
                    <span><strong>Cookie ID:</strong> {selectedOrderDetail.cookieId}</span>
                  </div>
                  <div>
                    <strong>Trạng thái:</strong>{" "}
                    <Badge variant={selectedOrderDetail.status ? "default" : "destructive"}>
                      {selectedOrderDetail.status ? "Thành công" : "Thất bại"}
                    </Badge>
                  </div>
                </div>

                {/* Driver Information */}
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    Thông tin Shipper
                  </h4>
                  {selectedOrderDetail.driverPhone || selectedOrderDetail.orderData?.driver_phone ? (
                    <div className="space-y-2">
                      <div className="text-green-600 font-medium">✓ Có thông tin shipper - Đã trừ {cookieRapidPrice.toLocaleString()} VND</div>
                      <div 
                        className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                        onClick={() => copyToClipboard(selectedOrderDetail.driverPhone || selectedOrderDetail.orderData?.driver_phone || '', "SĐT Shipper")}
                        title="Click để sao chép"
                      >
                        <Copy className="h-3 w-3 text-gray-400" />
                        <span><strong>SĐT Shipper:</strong> {selectedOrderDetail.driverPhone || selectedOrderDetail.orderData?.driver_phone}</span>
                      </div>
                      {(selectedOrderDetail.driverName || selectedOrderDetail.orderData?.driver_name) && (
                        <div 
                          className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                          onClick={() => copyToClipboard(selectedOrderDetail.driverName || selectedOrderDetail.orderData?.driver_name || '', "Tên Shipper")}
                          title="Click để sao chép"
                        >
                          <Copy className="h-3 w-3 text-gray-400" />
                          <span><strong>Tên Shipper:</strong> {selectedOrderDetail.driverName || selectedOrderDetail.orderData?.driver_name}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-red-600 font-medium">✗ Chưa có số shipper - Không trừ tiền</div>
                  )}
                </div>

                {/* Order Information */}
                {(selectedOrderDetail.driverPhone || selectedOrderDetail.orderData?.driver_phone) && (selectedOrderDetail.orderData || selectedOrderDetail.historyData) && (
                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Thông tin đơn hàng
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {selectedOrderDetail.orderData && (
                        <>
                          <div 
                            className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard(selectedOrderDetail.orderData.order_id, "Order ID")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>Order ID:</strong> {selectedOrderDetail.orderData.order_id}</span>
                          </div>
                          <div 
                            className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard(selectedOrderDetail.orderData.tracking_number, "Tracking")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>Tracking:</strong> {selectedOrderDetail.orderData.tracking_number}</span>
                          </div>
                          <div 
                            className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard(selectedOrderDetail.orderData.name, "Tên sản phẩm")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>Tên sản phẩm:</strong> {selectedOrderDetail.orderData.name}</span>
                          </div>
                          <div 
                            className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard((selectedOrderDetail.orderData.order_price / 100000).toLocaleString('vi-VN') + ' VND', "Giá")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>Giá:</strong> {(selectedOrderDetail.orderData.order_price / 100000).toLocaleString('vi-VN')} VND</span>
                          </div>
                          <div 
                            className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard(selectedOrderDetail.orderData.shipping_name, "Người nhận")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>Người nhận:</strong> {selectedOrderDetail.orderData.shipping_name}</span>
                          </div>
                          <div 
                            className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard(selectedOrderDetail.orderData.shipping_phone, "SĐT nhận")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>SĐT nhận:</strong> {selectedOrderDetail.orderData.shipping_phone}</span>
                          </div>
                          <div 
                            className="col-span-2 cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard(selectedOrderDetail.orderData.shipping_address, "Địa chỉ")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>Địa chỉ:</strong> {selectedOrderDetail.orderData.shipping_address}</span>
                          </div>
                          <div 
                            className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard(formatVietnameseTime(selectedOrderDetail.orderData.order_time), "Thời gian đặt")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>Thời gian đặt:</strong> {formatVietnameseTime(selectedOrderDetail.orderData.order_time)}</span>
                          </div>
                        </>
                      )}
                      {selectedOrderDetail.historyData && (
                        <>
                          <div 
                            className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard(selectedOrderDetail.historyData.orderId || '-', "Order ID")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>Order ID:</strong> {selectedOrderDetail.historyData.orderId || '-'}</span>
                          </div>
                          <div 
                            className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard(selectedOrderDetail.historyData.trackingNumber || '-', "Tracking")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>Tracking:</strong> {selectedOrderDetail.historyData.trackingNumber || '-'}</span>
                          </div>
                          <div 
                            className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard(selectedOrderDetail.historyData.orderName || '-', "Tên sản phẩm")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>Tên sản phẩm:</strong> {selectedOrderDetail.historyData.orderName || '-'}</span>
                          </div>
                          <div 
                            className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard(selectedOrderDetail.historyData.orderPrice || '-', "Giá")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>Giá:</strong> {selectedOrderDetail.historyData.orderPrice || '-'}</span>
                          </div>
                          <div 
                            className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard(selectedOrderDetail.historyData.shippingName || '-', "Người nhận")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>Người nhận:</strong> {selectedOrderDetail.historyData.shippingName || '-'}</span>
                          </div>
                          <div 
                            className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard(selectedOrderDetail.historyData.shippingPhone || '-', "SĐT nhận")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>SĐT nhận:</strong> {selectedOrderDetail.historyData.shippingPhone || '-'}</span>
                          </div>
                          <div 
                            className="col-span-2 cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard(selectedOrderDetail.historyData.shippingAddress || '-', "Địa chỉ")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>Địa chỉ:</strong> {selectedOrderDetail.historyData.shippingAddress || '-'}</span>
                          </div>
                          <div 
                            className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                            onClick={() => copyToClipboard(formatVietnameseTime(selectedOrderDetail.historyData.orderTime || ''), "Thời gian đặt")}
                            title="Click để sao chép"
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                            <span><strong>Thời gian đặt:</strong> {formatVietnameseTime(selectedOrderDetail.historyData.orderTime || '')}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {selectedOrderDetail.proxy && (
                  <div 
                    className="text-sm cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center gap-2"
                    onClick={() => copyToClipboard(selectedOrderDetail.proxy, "Proxy")}
                    title="Click để sao chép"
                  >
                    <Copy className="h-3 w-3 text-gray-400" />
                    <span><strong>Proxy:</strong> {selectedOrderDetail.proxy}</span>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}