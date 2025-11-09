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
  X
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ShopeeCookie {
  id: string;
  cookieType: string;
  cookiePreview: string;
  shopeeRegion: string;
  createdAt: string;
}

interface OrderDetail {
  order_id: string;
  tracking_number: string;
  description: string;
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
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

interface TrackingCheckResult {
  cookieId: string;
  cookie?: string;
  status: boolean;
  message: string;
  orderCount?: number;
  orders?: OrderDetail[];
  proxy?: string;
}

interface TrackingCheckHistory {
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
  proxy?: string;
  createdAt: string;
}

export default function TrackingCheck() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedCookies, setSelectedCookies] = useState<string[]>([]);
  const [proxyInput, setProxyInput] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<TrackingCheckResult[]>([]);
  const [selectedResults, setSelectedResults] = useState<string[]>([]);
  
  // Bulk tracking check states
  const [bulkCookieText, setBulkCookieText] = useState("");
  const [isBulkChecking, setIsBulkChecking] = useState(false);
  const [bulkTrackingResults, setBulkTrackingResults] = useState<TrackingCheckResult[]>([]);
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

  // Helper function to get cookie preview from cookie ID
  const getCookiePreview = (cookieId: string): string => {
    if (!cookies) return cookieId;
    const cookie = (cookies as ShopeeCookie[]).find(c => c.id === cookieId);
    return cookie?.cookiePreview || cookieId;
  };

  // Copy to clipboard helper function
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

  // Fetch tracking check history
  const { data: trackingHistory = [], isLoading: historyLoading } = useQuery<TrackingCheckHistory[]>({
    queryKey: ["/api/tracking-checks"],
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

  // Filter tracking history with comprehensive filtering
  const getFilteredHistory = () => {
    return trackingHistory.filter(item => {
      const matchesSearch = !historySearch || 
        item.cookiePreview.toLowerCase().includes(historySearch.toLowerCase()) ||
        item.orderId?.toLowerCase().includes(historySearch.toLowerCase()) ||
        item.trackingNumber?.toLowerCase().includes(historySearch.toLowerCase()) ||
        item.orderName?.toLowerCase().includes(historySearch.toLowerCase());
      
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

  // Tracking check mutation
  const trackingCheckMutation = useMutation({
    mutationFn: async (data: { cookieIds: string[], proxies?: string }) => {
      // Send cookieIds directly - backend will lookup full cookie values
      return await apiRequest({
        url: "/api/tracking-checks/bulk",
        method: "POST",
        body: { entries: data.cookieIds, proxies: data.proxies }
      });
    },
    onSuccess: (results) => {
      setCheckResults(results);
      setIsChecking(false);
      queryClient.invalidateQueries({ queryKey: ["/api/tracking-checks"] });
      toast({
        title: "Hoàn thành kiểm tra!",
        description: `Đã kiểm tra ${results.length} cookie`,
      });
    },
    onError: (error: Error) => {
      setIsChecking(false);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể thực hiện kiểm tra",
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
    const currentPageItems = paginatedHistoryData.map((item: TrackingCheckHistory) => item.id);
    if (selectedHistory.length === currentPageItems.length) {
      setSelectedHistory([]);
    } else {
      setSelectedHistory(currentPageItems);
    }
  };

  // Bulk tracking check functions
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

  const handleBulkTracking = async () => {
    if (!bulkCookieText.trim()) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập danh sách cookie",
        variant: "destructive",
      });
      return;
    }

    const entries = parseBulkCookieText(bulkCookieText);
    console.log('Parsed entries:', entries);
    console.log('Bulk cookie text:', bulkCookieText);
    
    if (entries.length === 0) {
      toast({
        title: "Lỗi", 
        description: "Không có cookie hợp lệ nào được tìm thấy",
        variant: "destructive",
      });
      return;
    }

    setIsBulkChecking(true);
    setBulkTrackingResults([]);

    try {
      // First test with debug endpoint
      const token = localStorage.getItem("token");
      console.log('Testing with /api/test-bulk first...');
      
      const testResponse = await fetch("/api/test-bulk", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ entries })
      });

      console.log('Test response status:', testResponse.status);
      const testResult = await testResponse.text();
      console.log('Test response:', testResult);
      
      // Now try the new bulk endpoint
      console.log('Now testing new /api/tracking-checks/bulk...');
      const actualResponse = await fetch("/api/tracking-checks/bulk", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ entries })
      });

      console.log('New endpoint response status:', actualResponse.status);
      console.log('New endpoint response headers:', Object.fromEntries(actualResponse.headers.entries()));
      
      if (!actualResponse.ok) {
        const errorText = await actualResponse.text();
        console.log('New endpoint error response:', errorText);
        throw new Error(`HTTP ${actualResponse.status}: ${errorText}`);
      }

      // Clone response để có thể đọc nhiều lần nếu cần
      const responseClone = actualResponse.clone();
      let response;
      try {
        response = await actualResponse.json();
        console.log('New endpoint success response:', response);
      } catch (parseError: any) {
        console.error('Failed to parse response as JSON:', parseError);
        try {
          const responseText = await responseClone.text();
          console.error('Response text:', responseText.substring(0, 500));
          throw new Error(`Server trả về dữ liệu không hợp lệ: ${responseText.substring(0, 100)}`);
        } catch (textError) {
          throw new Error(`Server trả về dữ liệu không hợp lệ. Vui lòng thử lại sau.`);
        }
      }

      setBulkTrackingResults(response);
      queryClient.invalidateQueries({ queryKey: ["/api/tracking-checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
      
      toast({
        title: "Hoàn thành kiểm tra bulk!",
        description: `Đã kiểm tra ${response.length} cookie`,
      });
    } catch (error: any) {
      console.error('Bulk tracking error:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể thực hiện kiểm tra bulk",
        variant: "destructive",
      });
    } finally {
      setIsBulkChecking(false);
    }
  };



  // Export to Excel function with UTF-8 BOM
  const exportToExcel = (data: TrackingCheckHistory[], filename: string) => {
    const worksheet = data.map(item => {
      // Find the full cookie preview from cookies array
      const fullCookie = cookies.find(cookie => cookie.id === item.cookieId);
      
      return {
        'Cookie Value': fullCookie?.cookiePreview || item.cookiePreview || '-',
        'Trạng thái': item.status ? 'Thành công' : 'Thất bại',
        'Order ID': item.orderId || '-',
        'Tracking Number': item.trackingNumber || '-',
        'Tên sản phẩm': item.orderName || '-',
        'Giá tiền': item.orderPrice ? 
          new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
          }).format(parseFloat(item.orderPrice) / 100000) : '-',
        'Người nhận': item.shippingName || '-',
        'SĐT nhận': item.shippingPhone || '-',
        'Địa chỉ giao hàng': item.shippingAddress || '-',
        'Thời gian đặt': formatVietnameseTime(item.orderTime || ''),
        'Proxy': item.proxy || '-',
        'Thời gian kiểm tra': formatVietnameseTime(item.createdAt)
      };
    });

    // Convert to CSV with UTF-8 BOM
    const csvContent = [
      Object.keys(worksheet[0]).join(','),
      ...worksheet.map(row => Object.values(row).map(field => `"${field}"`).join(','))
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
    
    trackingCheckMutation.mutate({
      cookieIds: selectedCookies,
      proxies: proxyInput.trim() || undefined
    });
  };

  const handleResultSelection = (cookieId: string) => {
    setSelectedResults(prev => 
      prev.includes(cookieId) 
        ? prev.filter(id => id !== cookieId)
        : [...prev, cookieId]
    );
  };

  const showOrderDetail = (result: TrackingCheckResult) => {
    const firstOrder = result.orders?.[0];
    setSelectedOrderDetail({
      cookieId: result.cookieId,
      status: result.status,
      orderData: firstOrder,
      proxy: result.proxy
    });
    setIsDetailDialogOpen(true);
  };

  const showHistoryDetail = (item: TrackingCheckHistory) => {
    setSelectedOrderDetail({
      cookieId: item.cookieId,
      status: item.status,
      historyData: item
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

  // Export regular tracking results to Excel
  const exportResultsToExcel = () => {
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
        "Thời gian đặt", 
        "Mô tả tracking", 
        "Proxy"
      ].join(","),
      ...dataToExport.map(result => {
        const firstOrder = result.orders?.[0];
        const fullCookie = cookies.find(cookie => cookie.id === result.cookieId);
        return [
          `"${fullCookie?.cookiePreview || ""}"`,
          result.cookieId,
          result.status ? "Thành công" : "Thất bại",
          firstOrder?.order_id || "",
          firstOrder?.tracking_number || "",
          `"${firstOrder?.name || ""}"`,
          firstOrder?.order_price ? (firstOrder.order_price / 100000).toLocaleString('vi-VN') + " VND" : "",
          `"${firstOrder?.shipping_name || ""}"`,
          firstOrder?.shipping_phone || "",
          `"${firstOrder?.shipping_address || ""}"`,
          formatVietnameseTime(firstOrder?.order_time || ""),
          `"${firstOrder?.description || ""}"`,
          result.proxy || ""
        ].join(",");
      })
    ].join("\n");

    // Add BOM for proper UTF-8 encoding in Excel
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tracking_check_results_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    toast({
      title: "Thành công!",
      description: `Đã xuất ${dataToExport.length} bản ghi với thông tin đơn hàng chi tiết`,
    });
  };

  // Bulk tracking selection handlers
  const handleSelectAllBulkResults = () => {
    if (selectedBulkResults.length === bulkTrackingResults.length) {
      setSelectedBulkResults([]);
    } else {
      setSelectedBulkResults(bulkTrackingResults.map(result => result.cookieId));
    }
  };

  const toggleBulkResultSelection = (cookieId: string) => {
    setSelectedBulkResults(prev => 
      prev.includes(cookieId) 
        ? prev.filter(id => id !== cookieId)
        : [...prev, cookieId]
    );
  };

  // Export bulk results to Excel
  const exportBulkResultsToExcel = () => {
    const dataToExport = selectedBulkResults.length > 0 
      ? bulkTrackingResults.filter(result => selectedBulkResults.includes(result.cookieId))
      : bulkTrackingResults;
    
    if (dataToExport.length === 0) {
      toast({
        title: "Thông báo",
        description: "Không có dữ liệu để xuất",
        variant: "destructive",
      });
      return;
    }

    const csvContent = [
      [
        "Cookie Value", 
        "Trạng thái", 
        "Order ID", 
        "Tracking Number", 
        "Tên sản phẩm", 
        "Giá đơn hàng", 
        "Tên người nhận", 
        "SĐT người nhận", 
        "Địa chỉ giao hàng", 
        "Thời gian đặt", 
        "Mô tả tracking", 
        "Proxy"
      ].join(","),
      ...dataToExport.map(result => {
        const firstOrder = result.orders?.[0];
        return [
          `"${result.cookie || ""}"`,
          result.status ? "Thành công" : "Thất bại",
          firstOrder?.order_id || "",
          firstOrder?.tracking_number || "",
          `"${firstOrder?.name || ""}"`,
          firstOrder?.order_price ? (firstOrder.order_price / 100000).toLocaleString('vi-VN') + " VND" : "",
          `"${firstOrder?.shipping_name || ""}"`,
          firstOrder?.shipping_phone || "",
          `"${firstOrder?.shipping_address || ""}"`,
          formatVietnameseTime(firstOrder?.order_time || ""),
          `"${firstOrder?.description || ""}"`,
          result.proxy || ""
        ].join(",");
      })
    ].join("\n");

    // Add BOM for proper UTF-8 encoding in Excel
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `bulk_tracking_check_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    toast({
      title: "Thành công!",
      description: `Đã xuất ${dataToExport.length} bản ghi kiểm tra form`,
    });
  };

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
                  <Package className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    Kiểm tra mã vận đơn
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    Theo dõi đơn hàng và thông tin vận chuyển từ tài khoản Shopee
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  100 VND
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Giá mỗi lần kiểm tra
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Tabs */}
          <Tabs defaultValue="check" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="check" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Kiểm tra đơn hàng
              </TabsTrigger>
              <TabsTrigger value="bulk" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Kiểm tra form
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Lịch sử kiểm tra
              </TabsTrigger>
            </TabsList>

            {/* Check Tab */}
            <TabsContent value="check" className="space-y-6">
              {/* Cookie Selection */}
              <Card className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-orange-200/50 dark:border-gray-700/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Chọn Cookie SPC_ST
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {cookiesLoading ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-700 h-12 rounded"></div>
                      ))}
                    </div>
                  ) : cookies.length === 0 ? (
                    <div className="text-center py-8">
                      <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 dark:text-gray-400">
                        Không có cookie SPC_ST nào. Vui lòng thêm cookie trước khi kiểm tra.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedCookies.length === cookies.length}
                            onCheckedChange={handleSelectAllCookies}
                          />
                          <span className="text-sm font-medium">
                            Chọn tất cả ({cookies.length} cookie)
                          </span>
                        </div>
                        <Badge variant="outline">
                          Đã chọn: {selectedCookies.length}
                        </Badge>
                      </div>
                      
                      <ScrollArea className="h-48 w-full rounded-md border p-4">
                        <div className="space-y-2">
                          {cookies.map((cookie) => (
                            <div
                              key={cookie.id}
                              className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              <Checkbox
                                checked={selectedCookies.includes(cookie.id)}
                                onCheckedChange={() => handleCookieSelection(cookie.id)}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-xs">
                                    {cookie.id}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    SPC_ST
                                  </Badge>
                                </div>
                                <p className="text-xs text-gray-500 mt-1 font-mono truncate">
                                  {cookie.cookiePreview.substring(0, 50)}...
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Proxy Input */}
              <Card className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-orange-200/50 dark:border-gray-700/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wifi className="h-5 w-5" />
                    Cấu hình Proxy (Tùy chọn)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Label htmlFor="proxy-input">
                      Danh sách Proxy (Mỗi dòng một proxy)
                    </Label>
                    <Textarea
                      id="proxy-input"
                      placeholder={`Ví dụ:
127.0.0.1:8080
192.168.1.1:3128:username:password
socks5://127.0.0.1:1080`}
                      value={proxyInput}
                      onChange={(e) => setProxyInput(e.target.value)}
                      rows={4}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Hỗ trợ định dạng: ip:port hoặc ip:port:user:pass. Nếu để trống sẽ tự động sử dụng proxy xoay từ hệ thống.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Start Check Button */}
              <div className="flex justify-center">
                <Button
                  onClick={handleStartCheck}
                  disabled={isChecking || selectedCookies.length === 0}
                  size="lg"
                  className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white px-8 py-3"
                >
                  {isChecking ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Đang kiểm tra...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Bắt đầu kiểm tra ({selectedCookies.length} cookie)
                    </>
                  )}
                </Button>
              </div>

              {/* Results Display */}
              {checkResults.length > 0 && (
                <Card className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-orange-200/50 dark:border-gray-700/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5" />
                        Kết quả kiểm tra
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={handleSelectAllResults}
                          variant="outline"
                          size="sm"
                        >
                          {selectedResults.length === checkResults.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                        </Button>
                        <Button
                          onClick={exportResultsToExcel}
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-1"
                        >
                          <Download className="h-4 w-4" />
                          Xuất Excel
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {checkResults.map((result, resultIndex) => {
                        if (!result.orders || result.orders.length === 0) {
                          return (
                            <div key={resultIndex} className="p-4 border border-red-200 rounded-lg bg-red-50">
                              <div className="text-red-600">Cookie không có đơn hàng</div>
                            </div>
                          );
                        }

                        return (
                          <div key={resultIndex} className="space-y-4">
                            <div className="flex items-center gap-2 pb-2 border-b">
                              <Badge 
                                variant="outline" 
                                className="cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors"
                                onClick={() => copyCookieToClipboard(result.cookieId)}
                              >
                                Cookie: {getCookiePreview(result.cookieId).substring(0, 15)}...
                              </Badge>
                              <Badge 
                                variant="outline" 
                                className="cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors"
                                onClick={() => copyToClipboard(result.proxy || 'System')}
                              >
                                Proxy: {result.proxy || 'System'}
                              </Badge>
                              <Badge variant="outline">Tổng: {result.orders.length} đơn hàng</Badge>
                            </div>
                            
                            {result.orders.map((order, orderIndex) => {
                              console.log(`🔧 RENDERING ORDER ${orderIndex}:`, order.order_id, order.tracking_number);
                              return (
                                <div 
                                  key={`${resultIndex}-${orderIndex}-${order.order_id}`}
                                  className={`p-4 border rounded-lg ${orderIndex % 2 === 0 ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}
                                >
                                  <div className="grid grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <div className="font-semibold">Order ID:</div>
                                    <div className="text-blue-600 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(order.order_id)}>{order.order_id}</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold">Tracking:</div>
                                    <div className="text-purple-600 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(order.tracking_number || "Chưa có mã vận đơn")}>{order.tracking_number || "Chưa có mã vận đơn"}</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold">Sản phẩm:</div>
                                    <div className="truncate cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(order.name || 'N/A')}>{order.name || 'N/A'}</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold">Giá:</div>
                                    <div className="text-green-600 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(`${(order.final_total / 100000).toLocaleString('vi-VN')} VND`)}>
                                      {(order.final_total / 100000).toLocaleString('vi-VN')} VND
                                    </div>
                                  </div>
                                  <div>
                                    <div className="font-semibold">Người nhận:</div>
                                    <div className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(order.shipping_name || 'N/A')}>{order.shipping_name || 'N/A'}</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold">SĐT:</div>
                                    <div className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(order.shipping_phone || 'N/A')}>{order.shipping_phone || 'N/A'}</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold">Địa chỉ:</div>
                                    <div className="truncate cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(order.shipping_address || 'N/A')}>{order.shipping_address || 'N/A'}</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold">Thời gian:</div>
                                    <div className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" onClick={() => copyToClipboard(formatVietnameseTime(order.order_time))}>{formatVietnameseTime(order.order_time)}</div>
                                  </div>
                                </div>
                                
                                {orderIndex === 0 && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => showOrderDetail(result)}
                                    >
                                      <Eye className="h-4 w-4 mr-1" />
                                      Chi tiết tất cả đơn hàng
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Bulk Tracking Check Tab */}
            <TabsContent value="bulk" className="space-y-6">
              <div className="space-y-6">
                {/* Bulk Input Form */}
                <Card className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-orange-200/50 dark:border-gray-700/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Nhập danh sách Cookie|Proxy
                    </CardTitle>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Danh sách Cookie (format: cookie|proxy hoặc chỉ cookie)
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <Textarea
                        placeholder={`SPC_ST=abc123...|1.2.3.4:8080:user:pass
SPC_ST=def456...|5.6.7.8:8080:user2:pass2
SPC_ST=ghi789...
(Nếu không có proxy thì sẽ dùng HTTP proxy từ database)`}
                        value={bulkCookieText}
                        onChange={(e) => setBulkCookieText(e.target.value)}
                        className="min-h-[200px] font-mono text-sm"
                      />
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Package className="h-4 w-4" />
                        Cookie thành công sẽ tự động thêm vào quản lý cookie
                      </div>
                      <Button
                        onClick={handleBulkTracking}
                        disabled={isBulkChecking || !bulkCookieText.trim()}
                        className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                      >
                        {isBulkChecking ? (
                          <>
                            <Truck className="mr-2 h-4 w-4 animate-pulse" />
                            Đang kiểm tra...
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            Bắt đầu kiểm tra ({bulkCookieText.split('\n').filter(line => line.trim()).length})
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Bulk Results */}
                {bulkTrackingResults.length > 0 && (
                  <Card className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-orange-200/50 dark:border-gray-700/50">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5" />
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
                              checked={selectedBulkResults.length === bulkTrackingResults.length}
                              className="mr-2"
                            />
                            Chọn tất cả ({selectedBulkResults.length})
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={exportBulkResultsToExcel}
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
                      <ScrollArea className="h-96">
                        <Table>
                          <TableHeader className="bg-gray-50 dark:bg-slate-900/50 sticky top-0">
                            <TableRow>
                              <TableHead className="w-12">
                                <Checkbox
                                  checked={selectedBulkResults.length === bulkTrackingResults.length}
                                  onCheckedChange={handleSelectAllBulkResults}
                                />
                              </TableHead>
                              <TableHead className="font-semibold">Cookie Value</TableHead>
                              <TableHead className="font-semibold">Trạng thái</TableHead>
                              <TableHead className="font-semibold">Order ID</TableHead>
                              <TableHead className="font-semibold">Tracking Number</TableHead>
                              <TableHead className="font-semibold">Tên sản phẩm</TableHead>
                              <TableHead className="font-semibold">Giá đơn hàng</TableHead>
                              <TableHead className="font-semibold">Tên người nhận</TableHead>
                              <TableHead className="font-semibold">SĐT người nhận</TableHead>
                              <TableHead className="font-semibold">Địa chỉ giao hàng</TableHead>
                              <TableHead className="font-semibold">Thời gian đặt</TableHead>
                              <TableHead className="font-semibold">Proxy</TableHead>
                              <TableHead className="font-semibold">Thao tác</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {bulkTrackingResults.flatMap((result, resultIndex) => {
                              if (!result.orders || result.orders.length === 0) {
                                return (
                                  <TableRow key={`${resultIndex}-error`} className="hover:bg-red-50 dark:hover:bg-red-900/10">
                                    <TableCell>
                                      <Checkbox
                                        checked={selectedBulkResults.includes(result.cookieId)}
                                        onCheckedChange={() => toggleBulkResultSelection(result.cookieId)}
                                      />
                                    </TableCell>
                                    <TableCell className="font-mono text-sm max-w-48 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                      const fullValue = result.cookie || getCookiePreview(result.cookieId);
                                      navigator.clipboard.writeText(fullValue);
                                      toast({
                                        title: "Đã copy!",
                                        description: "Cookie đã được copy vào clipboard",
                                      });
                                    }}>
                                      <span className="truncate" title={result.cookie || getCookiePreview(result.cookieId)}>
                                        {(result.cookie || getCookiePreview(result.cookieId)).substring(0, 15)}...
                                      </span>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="destructive">{result.message || "Không có đơn hàng"}</Badge>
                                    </TableCell>
                                    <TableCell colSpan={10} className="text-center text-gray-500">
                                      {result.message || "Cookie này không có đơn hàng nào"}
                                    </TableCell>
                                  </TableRow>
                                );
                              }

                              return result.orders.map((order, orderIndex) => (
                                <TableRow 
                                  key={`${resultIndex}-${orderIndex}-${order.order_id}`} 
                                  className={`hover:bg-gray-50 dark:hover:bg-slate-800/50 ${orderIndex % 2 === 0 ? 'bg-green-50/30 dark:bg-green-900/10' : 'bg-blue-50/30 dark:bg-blue-900/10'}`}
                                >
                                  <TableCell>
                                    {orderIndex === 0 && (
                                      <Checkbox
                                        checked={selectedBulkResults.includes(result.cookieId)}
                                        onCheckedChange={() => toggleBulkResultSelection(result.cookieId)}
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell className="font-mono text-sm max-w-48 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    if (orderIndex === 0) {
                                      const fullValue = result.cookie || getCookiePreview(result.cookieId);
                                      navigator.clipboard.writeText(fullValue);
                                      toast({
                                        title: "Đã copy!",
                                        description: "Cookie đã được copy vào clipboard",
                                      });
                                    }
                                  }}>
                                    {orderIndex === 0 && (
                                      <span className="truncate" title={result.cookie || getCookiePreview(result.cookieId)}>
                                        {(result.cookie || getCookiePreview(result.cookieId)).substring(0, 15)}...
                                      </span>
                                    )}
                                    {orderIndex > 0 && (
                                      <div className="text-xs text-gray-400 pl-2">
                                        ↳ Đơn hàng {orderIndex + 1}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    if (orderIndex === 0) {
                                      navigator.clipboard.writeText(result.status ? "Thành công" : "Thất bại");
                                      toast({
                                        title: "Đã copy!",
                                        description: "Trạng thái đã được copy vào clipboard",
                                      });
                                    }
                                  }}>
                                    {orderIndex === 0 && (
                                      <div className="space-y-1">
                                        <Badge variant={result.status ? "default" : "destructive"}>
                                          {result.status ? "Thành công" : "Thất bại"}
                                        </Badge>
                                        <Badge variant="outline" className="text-xs">
                                          {result.orders?.length || 0} đơn hàng
                                        </Badge>
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell className="font-mono text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    navigator.clipboard.writeText(order.order_id || "-");
                                    toast({
                                      title: "Đã copy!",
                                      description: "Order ID đã được copy vào clipboard",
                                    });
                                  }}>
                                    <span className="text-blue-600 dark:text-blue-400">
                                      {order.order_id || "-"}
                                    </span>
                                  </TableCell>
                                  <TableCell className="font-mono text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    navigator.clipboard.writeText(order.tracking_number || "Chưa có mã vận đơn");
                                    toast({
                                      title: "Đã copy!",
                                      description: "Tracking number đã được copy vào clipboard",
                                    });
                                  }}>
                                    <span className="text-purple-600 dark:text-purple-400">
                                      {order.tracking_number || "Chưa có mã vận đơn"}
                                    </span>
                                  </TableCell>
                                  <TableCell className="max-w-32 truncate cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    navigator.clipboard.writeText(order.name || "-");
                                    toast({
                                      title: "Đã copy!",
                                      description: "Tên sản phẩm đã được copy vào clipboard",
                                    });
                                  }}>
                                    <span className="text-gray-800 dark:text-gray-200">
                                      {order.name || "-"}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    const priceText = order.final_total ? (order.final_total / 100000).toLocaleString('vi-VN') + " VND" : "-";
                                    navigator.clipboard.writeText(priceText);
                                    toast({
                                      title: "Đã copy!",
                                      description: "Giá đơn hàng đã được copy vào clipboard",
                                    });
                                  }}>
                                    <span className="text-green-600 dark:text-green-400 font-medium">
                                      {order.final_total ? 
                                        (order.final_total / 100000).toLocaleString('vi-VN') + " VND" : "-"}
                                    </span>
                                  </TableCell>
                                  <TableCell className="font-medium cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    navigator.clipboard.writeText(order.shipping_name || "-");
                                    toast({
                                      title: "Đã copy!",
                                      description: "Tên người nhận đã được copy vào clipboard",
                                    });
                                  }}>
                                    <span className="text-gray-600 dark:text-gray-400">
                                      {order.shipping_name || "-"}
                                    </span>
                                  </TableCell>
                                  <TableCell className="font-mono text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    navigator.clipboard.writeText(order.shipping_phone || "-");
                                    toast({
                                      title: "Đã copy!",
                                      description: "SĐT người nhận đã được copy vào clipboard",
                                    });
                                  }}>
                                    <span className="text-gray-600 dark:text-gray-400">
                                      {order.shipping_phone || "-"}
                                    </span>
                                  </TableCell>
                                  <TableCell className="max-w-40 truncate cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    navigator.clipboard.writeText(order.shipping_address || "-");
                                    toast({
                                      title: "Đã copy!",
                                      description: "Địa chỉ giao hàng đã được copy vào clipboard",
                                    });
                                  }}>
                                    <span className="text-gray-600 dark:text-gray-400 text-sm">
                                      {order.shipping_address || "-"}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    navigator.clipboard.writeText(formatVietnameseTime(order.order_time || ""));
                                    toast({
                                      title: "Đã copy!",
                                      description: "Thời gian đặt hàng đã được copy vào clipboard",
                                    });
                                  }}>
                                    <span className="text-gray-600 dark:text-gray-400">
                                      {formatVietnameseTime(order.order_time || "")}
                                    </span>
                                  </TableCell>
                                  <TableCell className="font-mono text-xs max-w-20 truncate cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    if (orderIndex === 0) {
                                      navigator.clipboard.writeText(result.proxy || "-");
                                      toast({
                                        title: "Đã copy!",
                                        description: "Proxy đã được copy vào clipboard",
                                      });
                                    }
                                  }}>
                                    {orderIndex === 0 && (
                                      <span className="text-gray-500 dark:text-gray-500">
                                        {result.proxy || "-"}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {orderIndex === 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => showOrderDetail(result)}
                                        className="h-8 w-8 p-0 hover:bg-orange-100 dark:hover:bg-orange-900/20"
                                      >
                                        <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ));
                            })}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="space-y-6">
              <Card className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-orange-200/50 dark:border-gray-700/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <History className="h-5 w-5" />
                      Lịch sử kiểm tra đơn hàng
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAllHistory}
                        className="h-8"
                      >
                        <Checkbox 
                          checked={selectedHistory.length === paginatedHistoryData.length && paginatedHistoryData.length > 0}
                          className="mr-2"
                        />
                        Chọn tất cả ({selectedHistory.length})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const selectedData = filteredHistoryData.filter(item => 
                            selectedHistory.includes(item.id)
                          );
                          exportToExcel(selectedData, 'lich-su-tracking-check');
                        }}
                        disabled={selectedHistory.length === 0}
                        className="h-8"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Xuất Excel ({selectedHistory.length})
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-4">
                    <div className="flex-1">
                      <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Tìm kiếm theo cookie, order ID, tracking number..."
                          value={historySearch}
                          onChange={(e) => setHistorySearch(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-gray-400" />
                      <select
                        value={statusFilter}
                        onChange={(e) => {
                          setStatusFilter(e.target.value);
                          setHistoryPage(1);
                        }}
                        className="px-3 py-2 border rounded-md text-sm"
                      >
                        <option value="all">Tất cả trạng thái</option>
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
                <CardContent>
                  {historyLoading ? (
                    <div className="space-y-3">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-700 h-12 rounded"></div>
                      ))}
                    </div>
                  ) : paginatedHistoryData.length === 0 ? (
                    <div className="text-center py-8">
                      <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 dark:text-gray-400">
                        Chưa có lịch sử kiểm tra nào
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">
                                <Checkbox
                                  checked={selectedHistory.length === paginatedHistoryData.length && paginatedHistoryData.length > 0}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedHistory(paginatedHistoryData.map(item => item.id));
                                    } else {
                                      setSelectedHistory([]);
                                    }
                                  }}
                                />
                              </TableHead>
                              <TableHead>Cookie Value</TableHead>
                              <TableHead>Trạng thái</TableHead>
                              <TableHead>Order ID</TableHead>
                              <TableHead>Tracking Number</TableHead>
                              <TableHead>Tên sản phẩm</TableHead>
                              <TableHead>Giá tiền</TableHead>
                              <TableHead>SDT người nhận</TableHead>
                              <TableHead>Địa chỉ giao hàng</TableHead>
                              <TableHead>Thời gian đặt</TableHead>
                              <TableHead>Proxy</TableHead>
                              <TableHead>Thao tác</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedHistoryData.flatMap((item: TrackingCheckHistory) => {
                              // Parse multiple orders from database fields
                              const parseMultipleOrders = (item: TrackingCheckHistory) => {
                                if (!item.orderId) return [];
                                
                                const orderIds = item.orderId.split(',');
                                const trackingNumbers = (item.trackingNumber || '').split(',');
                                const orderNames = (item.orderName || '').split(' | ');
                                const orderPrices = (item.orderPrice || '').split(',');
                                const orderTimes = (item.orderTime || '').split(',');
                                const shippingPhones = (item.shippingPhone || '').split(',');
                                const shippingAddresses = (item.shippingAddress || '').split(' | ');
                                
                                return orderIds.map((orderId, index) => ({
                                  orderId: orderId.trim(),
                                  trackingNumber: trackingNumbers[index]?.trim() || '-',
                                  orderName: orderNames[index]?.trim() || '-',
                                  orderPrice: orderPrices[index]?.trim() || '',
                                  orderTime: orderTimes[index]?.trim() || '',
                                  shippingPhone: shippingPhones[index]?.trim() || '-',
                                  shippingAddress: shippingAddresses[index]?.trim() || '-'
                                }));
                              };

                              const orders = parseMultipleOrders(item);
                              
                              if (orders.length === 0) {
                                // Show single row for failed checks
                                return [(
                                  <TableRow key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <TableCell>
                                      <Checkbox
                                        checked={selectedHistory.includes(item.id)}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setSelectedHistory([...selectedHistory, item.id]);
                                          } else {
                                            setSelectedHistory(selectedHistory.filter(id => id !== item.id));
                                          }
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell className="max-w-[200px] cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                      copyCookieToClipboard(item.cookieId);
                                    }}>
                                      <div className="flex items-center gap-2">
                                        <Badge variant="destructive" className="px-2 py-1 text-xs">
                                          Thất bại
                                        </Badge>
                                      </div>
                                      <div className="text-xs font-mono mt-1 text-gray-600 dark:text-gray-400 truncate" title={getCookiePreview(item.cookieId)}>
                                        {getCookiePreview(item.cookieId).substring(0, 15)}...
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="destructive">Thất bại</Badge>
                                    </TableCell>
                                    <TableCell colSpan={9} className="text-red-600 dark:text-red-400">
                                      Kiểm tra thất bại
                                    </TableCell>
                                  </TableRow>
                                )];
                              }

                              // Show multiple rows for successful checks with orders
                              return orders.map((order, orderIndex) => (
                                <TableRow 
                                  key={`${item.id}-${orderIndex}`}
                                  className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                                    orderIndex % 2 === 0 
                                      ? 'bg-blue-50/30 dark:bg-blue-900/10' 
                                      : 'bg-gray-50/30 dark:bg-gray-800/10'
                                  }`}
                                >
                                  <TableCell>
                                    {orderIndex === 0 && (
                                      <Checkbox
                                        checked={selectedHistory.includes(item.id)}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setSelectedHistory([...selectedHistory, item.id]);
                                          } else {
                                            setSelectedHistory(selectedHistory.filter(id => id !== item.id));
                                          }
                                        }}
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell className="max-w-[200px] cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    if (orderIndex === 0) {
                                      copyCookieToClipboard(item.cookieId);
                                    }
                                  }}>
                                    {orderIndex === 0 ? (
                                      <div>
                                        <div className="flex items-center gap-2 mb-1">
                                          <Badge variant="default" className="px-2 py-1 text-xs">
                                            Thành công
                                          </Badge>
                                          <Badge variant="outline" className="text-xs">
                                            {orders.length} đơn hàng
                                          </Badge>
                                        </div>
                                        <div className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate" title={getCookiePreview(item.cookieId)}>
                                          {getCookiePreview(item.cookieId).substring(0, 15)}...
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center text-gray-500 dark:text-gray-400 text-sm ml-4">
                                        ↳ Đơn hàng {orderIndex + 1}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    if (orderIndex === 0) {
                                      navigator.clipboard.writeText("Thành công");
                                      toast({
                                        title: "Đã copy!",
                                        description: "Trạng thái đã được copy vào clipboard",
                                      });
                                    }
                                  }}>
                                    {orderIndex === 0 && (
                                      <Badge variant="default">Thành công</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    navigator.clipboard.writeText(order.orderId);
                                    toast({
                                      title: "Đã copy!",
                                      description: "Order ID đã được copy vào clipboard",
                                    });
                                  }}>
                                    <span className="font-mono text-blue-600 dark:text-blue-400 text-sm">
                                      {order.orderId}
                                    </span>
                                  </TableCell>
                                  <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    navigator.clipboard.writeText(order.trackingNumber);
                                    toast({
                                      title: "Đã copy!",
                                      description: "Tracking number đã được copy vào clipboard",
                                    });
                                  }}>
                                    <span className="font-mono text-purple-600 dark:text-purple-400 text-sm">
                                      {order.trackingNumber}
                                    </span>
                                  </TableCell>
                                  <TableCell className="max-w-[200px] cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    navigator.clipboard.writeText(order.orderName);
                                    toast({
                                      title: "Đã copy!",
                                      description: "Tên sản phẩm đã được copy vào clipboard",
                                    });
                                  }}>
                                    <div className="truncate" title={order.orderName}>
                                      {order.orderName}
                                    </div>
                                  </TableCell>
                                  <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    const priceText = order.orderPrice ? 
                                      new Intl.NumberFormat('vi-VN', {
                                        style: 'currency',
                                        currency: 'VND'
                                      }).format(parseFloat(order.orderPrice) / 100000) : 'N/A';
                                    navigator.clipboard.writeText(priceText);
                                    toast({
                                      title: "Đã copy!",
                                      description: "Giá đơn hàng đã được copy vào clipboard",
                                    });
                                  }}>
                                    <span className="font-medium text-green-600 dark:text-green-400">
                                      {order.orderPrice ? 
                                        new Intl.NumberFormat('vi-VN', {
                                          style: 'currency',
                                          currency: 'VND'
                                        }).format(parseFloat(order.orderPrice) / 100000) : 'N/A'}
                                    </span>
                                  </TableCell>
                                  <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    navigator.clipboard.writeText(order.shippingPhone || 'N/A');
                                    toast({
                                      title: "Đã copy!",
                                      description: "SĐT người nhận đã được copy vào clipboard",
                                    });
                                  }}>
                                    <span className="text-sm">
                                      {order.shippingPhone || 'N/A'}
                                    </span>
                                  </TableCell>
                                  <TableCell className="max-w-[200px] cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    navigator.clipboard.writeText(order.shippingAddress || 'N/A');
                                    toast({
                                      title: "Đã copy!",
                                      description: "Địa chỉ giao hàng đã được copy vào clipboard",
                                    });
                                  }}>
                                    <div className="truncate text-sm" title={order.shippingAddress}>
                                      {order.shippingAddress || 'N/A'}
                                    </div>
                                  </TableCell>
                                  <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    const timeText = order.orderTime ? formatVietnameseTime(order.orderTime) : 'N/A';
                                    navigator.clipboard.writeText(timeText);
                                    toast({
                                      title: "Đã copy!",
                                      description: "Thời gian đặt hàng đã được copy vào clipboard",
                                    });
                                  }}>
                                    <span className="text-sm">
                                      {order.orderTime ? formatVietnameseTime(order.orderTime) : 'N/A'}
                                    </span>
                                  </TableCell>
                                  <TableCell className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => {
                                    if (orderIndex === 0) {
                                      navigator.clipboard.writeText(item.proxy || 'System');
                                      toast({
                                        title: "Đã copy!",
                                        description: "Proxy đã được copy vào clipboard",
                                      });
                                    }
                                  }}>
                                    {orderIndex === 0 && (
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {item.proxy || 'System'}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {orderIndex === 0 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => showHistoryDetail(item)}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ));
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {/* History Pagination */}
                      {totalHistoryPagesCount > 1 && (
                        <div className="flex items-center justify-between mt-4">
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            Hiển thị {((historyPage - 1) * historyItemsPerPage) + 1}-{Math.min(historyPage * historyItemsPerPage, filteredHistoryData.length)} của {filteredHistoryData.length} bản ghi
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setHistoryPage(historyPage - 1)}
                              disabled={historyPage === 1}
                            >
                              Trước
                            </Button>
                            <span className="text-sm">
                              Trang {historyPage} / {totalHistoryPagesCount}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setHistoryPage(historyPage + 1)}
                              disabled={historyPage === totalHistoryPagesCount}
                            >
                              Sau
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
      </main>

      {/* Order Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-600" />
              Chi tiết đơn hàng
            </DialogTitle>
          </DialogHeader>
          
          {selectedOrderDetail && (
            <div className="space-y-6">
              {/* Cookie & Status Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div>
                  <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Cookie Value</Label>
                  <p 
                    className="font-mono text-sm text-orange-600 dark:text-orange-400 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-1 rounded" 
                    onClick={() => copyCookieToClipboard(selectedOrderDetail.cookieId)}
                    title="Click để copy full cookie"
                  >
                    {getCookiePreview(selectedOrderDetail.cookieId).substring(0, 15)}...
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Trạng thái</Label>
                  <Badge variant={selectedOrderDetail.status ? "default" : "destructive"} className="mt-1">
                    {selectedOrderDetail.status ? "✓ Thành công" : "✗ Thất bại"}
                  </Badge>
                </div>
              </div>

              {/* Order Information */}
              {selectedOrderDetail.orderData && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 border-b pb-2">
                    Thông tin đơn hàng
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Order ID</Label>
                        <p className="font-mono text-blue-600 dark:text-blue-400 font-medium">
                          {selectedOrderDetail.orderData.order_id}
                        </p>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Tracking Number</Label>
                        <p className="font-mono text-purple-600 dark:text-purple-400 font-medium">
                          {selectedOrderDetail.orderData.tracking_number || "Chưa có mã vận đơn"}
                        </p>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Tên sản phẩm</Label>
                        <p className="text-gray-800 dark:text-gray-200">{selectedOrderDetail.orderData.name}</p>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Giá đơn hàng</Label>
                        <p className="text-green-600 dark:text-green-400 font-semibold">
                          {new Intl.NumberFormat('vi-VN', {
                            style: 'currency',
                            currency: 'VND'
                          }).format(selectedOrderDetail.orderData.order_price / 100000)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Thời gian đặt hàng</Label>
                        <p className="text-gray-700 dark:text-gray-300">
                          {formatVietnameseTime(selectedOrderDetail.orderData.order_time)}
                        </p>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Mô tả tracking</Label>
                        <p className="text-gray-700 dark:text-gray-300">
                          {selectedOrderDetail.orderData.description || "Đơn hàng đang chờ xác nhận"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* History Data */}
              {selectedOrderDetail.historyData && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 border-b pb-2">
                    Thông tin đơn hàng từ lịch sử
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Order ID</Label>
                        <p className="font-mono text-blue-600 dark:text-blue-400 font-medium">
                          {selectedOrderDetail.historyData.orderId || "-"}
                        </p>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Tracking Number</Label>
                        <p className="font-mono text-purple-600 dark:text-purple-400 font-medium">
                          {selectedOrderDetail.historyData.trackingNumber || "Chưa có mã vận đơn"}
                        </p>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Tên sản phẩm</Label>
                        <p className="text-gray-800 dark:text-gray-200">
                          {selectedOrderDetail.historyData.orderName || "-"}
                        </p>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Giá đơn hàng</Label>
                        <p className="text-green-600 dark:text-green-400 font-semibold">
                          {selectedOrderDetail.historyData.orderPrice ? 
                            new Intl.NumberFormat('vi-VN', {
                              style: 'currency',
                              currency: 'VND'
                            }).format(parseFloat(selectedOrderDetail.historyData.orderPrice) / 100000) : "-"}
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Thời gian đặt hàng</Label>
                        <p className="text-gray-700 dark:text-gray-300">
                          {formatVietnameseTime(selectedOrderDetail.historyData.orderTime || "")}
                        </p>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Mô tả tracking</Label>
                        <p className="text-gray-700 dark:text-gray-300">
                          {selectedOrderDetail.historyData.trackingInfo || "Đơn hàng đang chờ xác nhận"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Shipping Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 border-b pb-2">
                  Thông tin giao hàng
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Tên người nhận</Label>
                      <p className="text-gray-800 dark:text-gray-200">
                        {selectedOrderDetail.orderData?.shipping_name || 
                         selectedOrderDetail.historyData?.shippingName || "-"}
                      </p>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Số điện thoại</Label>
                      <p className="font-mono text-gray-700 dark:text-gray-300">
                        {selectedOrderDetail.orderData?.shipping_phone || 
                         selectedOrderDetail.historyData?.shippingPhone || "-"}
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Địa chỉ giao hàng</Label>
                    <p className="text-gray-700 dark:text-gray-300">
                      {selectedOrderDetail.orderData?.shipping_address || 
                       selectedOrderDetail.historyData?.shippingAddress || "-"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Proxy Information */}
              {selectedOrderDetail.proxy && (
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Proxy sử dụng</Label>
                  <p className="font-mono text-xs text-gray-500 dark:text-gray-500">
                    {selectedOrderDetail.proxy}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    const data = selectedOrderDetail.orderData || selectedOrderDetail.historyData;
                    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
                  }}
                  className="flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  Sao chép JSON
                </Button>
                <Button onClick={() => setIsDetailDialogOpen(false)}>
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