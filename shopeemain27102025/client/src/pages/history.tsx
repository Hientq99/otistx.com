import { useState } from "react";
import { FixedHeader } from "@/components/fixed-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { 
  History as HistoryIcon, 
  CreditCard, 
  Smartphone, 
  Shield, 
  Package, 
  Mail,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Activity,
  Copy,
  Phone
} from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { copyToClipboard } from "@/components/phone-rental/utils";

interface Transaction {
  id: number;
  type: string;
  amount: string;
  description: string;
  status: string;
  createdAt: string;
  reference?: string;
  adminNote?: string;
  balanceAfter?: string;
}

const getTransactionIcon = (type: string) => {
  switch (type) {
    case "top_up": return CreditCard;
    case "phone_check": return Smartphone;
    case "phone_rental": return Smartphone;
    case "tracking_check": return Package;
    case "account_check": return Shield;
    case "email_addition": return Mail;
    case "cookie_extraction": return Download;
    case "otissim_v1": return Smartphone;
    case "otissim_v2": return Smartphone;
    case "otissim_v3": return Smartphone;
    case "tiktok_rental": return Smartphone;
    case "refund": return CreditCard;
    case "admin_add": return CreditCard;
    case "admin_deduct": return CreditCard;
    default: return Activity;
  }
};

const getTransactionTypeLabel = (type: string) => {
  switch (type) {
    case "top_up": return "Nạp tiền";
    case "phone_check": return "Kiểm tra SĐT";
    case "phone_rental": return "Thuê số";
    case "tracking_check": return "Theo dõi đơn hàng";
    case "account_check": return "Kiểm tra tài khoản";
    case "email_addition": return "Thêm email";
    case "cookie_extraction": return "Lấy cookie";
    case "otissim_v1": return "OtisSim v1";
    case "otissim_v2": return "OtisSim v2";
    case "otissim_v3": return "OtisSim v3";
    case "tiktok_rental": return "TikTok rental";
    case "refund": return "Hoàn tiền";
    case "admin_add": return "Admin thêm";
    case "admin_deduct": return "Admin trừ";
    default: return type;
  }
};

const formatCurrency = (amount: string | number) => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Math.abs(numAmount));
};

const getAmountDisplay = (amount: string | number) => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  const isPositive = numAmount >= 0;
  
  return {
    value: formatCurrency(numAmount),
    isPositive,
    sign: isPositive ? '+' : '-'
  };
};

export default function History() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const { data: transactions = [], isLoading: loadingTransactions } = useQuery({
    queryKey: ['/api/transactions'],
  });

  // Fetch phone rental history with session details
  const { data: phoneRentalHistory = [], isLoading: loadingPhoneRentals } = useQuery({
    queryKey: ['/api/phone-rental-history'],
  });

  const { toast } = useToast();

  // Copy to clipboard handler
  const handleCopyToClipboard = async (text: string, label: string) => {
    await copyToClipboard(text);
    toast({
      title: "Đã sao chép",
      description: `${label}: ${text}`,
    });
  };

  // Date filtering helper
  const getDateRange = (period: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (period) {
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
      case 'quarter':
        const quarterStart = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
        return { start: quarterStart, end: now };
      case 'all':
      default:
        return null;
    }
  };

  // Extract session IDs from phone rental history to avoid duplicates
  const phoneRentalSessionIds = new Set(
    (phoneRentalHistory as any[]).map((rental: any) => rental.sessionId).filter(Boolean)
  );

  // Combine all data sources
  const combinedData = [
    // Filter out transactions that are already represented in phone rental history
    ...(transactions as Transaction[])
      .filter((transaction: Transaction) => {
        // Check if this is a phone rental transaction
        if (transaction.type?.includes('otissim') || transaction.type?.includes('tiktok')) {
          // Extract session ID from reference
          let sessionId = null;
          if (transaction.reference?.includes('charge_')) {
            sessionId = transaction.reference.split('charge_')[1];
          }
          // Skip this transaction if we already have it in phone rental history
          return sessionId ? !phoneRentalSessionIds.has(sessionId) : true;
        }
        // Keep all non-phone-rental transactions
        return true;
      })
      .map((transaction: Transaction) => ({
        ...transaction,
        dataType: 'transaction' as const,
        sessionId: null,
        phoneNumber: null,
        originalStatus: transaction.status, // Keep original status for debugging
        // Most financial transactions are completed once they appear in history
        status: 'completed',
      })),
    // Phone rental history with session details
    ...(phoneRentalHistory as any[]).map((rental: any) => ({
        id: rental.id,
        type: rental.service || 'phone_rental',
        amount: `-${rental.cost}`,
        description: `Thuê số ${rental.phoneNumber} - ${rental.service} (${rental.carrier})`,
        status: ['completed', 'expired', 'success', 'refunded'].includes(rental.status) ? 'completed' : 
               ['failed', 'error', 'cancelled'].includes(rental.status) ? 'failed' : 'processing',
        createdAt: rental.startTime,
        reference: rental.sessionId,
        dataType: 'phone_rental' as const,
        sessionId: rental.sessionId,
        phoneNumber: rental.phoneNumber,
        otpCode: rental.otpCode,
        carrier: rental.carrier,
        service: rental.service,
        originalStatus: rental.status, // Keep original status for debugging
      }))
  ];

  const filteredTransactions = combinedData
    .filter((item: any) => {
      // Search filter
      const matchesSearch = !searchTerm || 
        item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sessionId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.phoneNumber?.includes(searchTerm) ||
        getTransactionTypeLabel(item.type).toLowerCase().includes(searchTerm.toLowerCase());
      
      // Type filter
      const matchesType = selectedType === "all" || item.type === selectedType;
      
      // Date filtering
      const dateRange = getDateRange(selectedPeriod);
      const matchesDate = !dateRange || 
        (new Date(item.createdAt) >= dateRange.start && new Date(item.createdAt) < dateRange.end);
      
      return matchesSearch && matchesType && matchesDate;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Sort newest first

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset page when filters change
  const resetPage = () => setCurrentPage(1);

  const exportToExcel = () => {
    const headers = ['Ngày', 'Loại giao dịch', 'Mô tả', 'Số tiền', 'Trạng thái', 'Mã tham chiếu'];
    const data = filteredTransactions.map(transaction => [
      format(new Date(transaction.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi }),
      getTransactionTypeLabel(transaction.type),
      transaction.description,
      transaction.amount,
      transaction.status,
      transaction.reference || ''
    ]);

    const csvContent = [
      '\uFEFF' + headers.join(','),
      ...data.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lich-su-giao-dich-${format(new Date(), 'dd-MM-yyyy')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <FixedHeader />
      
      <div className="pt-20 pb-12">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-3 mb-4">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl shadow-lg">
                  <HistoryIcon className="h-8 w-8" />
                </div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Lịch Sử Giao Dịch
                </h1>
              </div>
              <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                Theo dõi chi tiết tất cả các giao dịch tài chính và sử dụng dịch vụ
              </p>
            </div>



            {/* Filters and Controls */}
            <Card className="mb-8 border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-blue-600" />
                  Bộ lọc và tìm kiếm
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Tìm kiếm giao dịch..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        resetPage();
                      }}
                      className="pl-10 bg-white dark:bg-gray-700"
                    />
                  </div>
                  
                  <Select value={selectedPeriod} onValueChange={(value) => {
                    setSelectedPeriod(value);
                    resetPage();
                  }}>
                    <SelectTrigger className="bg-white dark:bg-gray-700">
                      <Calendar className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Thời gian" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="today">Hôm nay</SelectItem>
                      <SelectItem value="yesterday">Hôm qua</SelectItem>
                      <SelectItem value="week">7 ngày qua</SelectItem>
                      <SelectItem value="month">30 ngày qua</SelectItem>
                      <SelectItem value="quarter">90 ngày qua</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={selectedType} onValueChange={(value) => {
                    setSelectedType(value);
                    resetPage();
                  }}>
                    <SelectTrigger className="bg-white dark:bg-gray-700">
                      <SelectValue placeholder="Loại giao dịch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="top_up">Nạp tiền</SelectItem>
                      <SelectItem value="phone_check">Kiểm tra SĐT</SelectItem>
                      <SelectItem value="phone_rental">Thuê số</SelectItem>
                      <SelectItem value="tracking_check">Theo dõi đơn hàng</SelectItem>
                      <SelectItem value="account_check">Kiểm tra tài khoản</SelectItem>
                      <SelectItem value="email_addition">Thêm email</SelectItem>
                      <SelectItem value="cookie_extraction">Lấy cookie</SelectItem>
                      <SelectItem value="otissim_v1">OtisSim v1</SelectItem>
                      <SelectItem value="otissim_v2">OtisSim v2</SelectItem>
                      <SelectItem value="otissim_v3">OtisSim v3</SelectItem>
                      <SelectItem value="tiktok_rental">TikTok rental</SelectItem>
                      <SelectItem value="refund">Hoàn tiền</SelectItem>
                      <SelectItem value="admin_add">Admin thêm</SelectItem>
                      <SelectItem value="admin_deduct">Admin trừ</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={itemsPerPage.toString()} onValueChange={(value) => {
                    setItemsPerPage(Number(value));
                    resetPage();
                  }}>
                    <SelectTrigger className="bg-white dark:bg-gray-700">
                      <SelectValue placeholder="Số dòng" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 dòng</SelectItem>
                      <SelectItem value="20">20 dòng</SelectItem>
                      <SelectItem value="50">50 dòng</SelectItem>
                      <SelectItem value="100">100 dòng</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button 
                    onClick={exportToExcel}
                    variant="outline"
                    className="flex items-center gap-2 bg-white dark:bg-gray-700"
                  >
                    <Download className="h-4 w-4" />
                    Xuất Excel
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Transaction History */}
            <Card className="border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-600" />
                  Lịch sử giao dịch
                </CardTitle>
                <CardDescription>
                  Danh sách {filteredTransactions.length} giao dịch được tìm thấy
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingTransactions || loadingPhoneRentals ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : paginatedTransactions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Không tìm thấy giao dịch nào</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                              Thời gian
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                              Loại giao dịch
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                              Mô tả
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                              Session / SĐT
                            </th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                              Số tiền
                            </th>
                            <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                              Trạng thái
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedTransactions.map((item, index) => {
                            const IconComponent = getTransactionIcon(item.type);
                            const amountDisplay = getAmountDisplay(item.amount);
                            
                            return (
                              <tr 
                                key={item.id} 
                                className={`border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                                  index % 2 === 0 ? 'bg-gray-50/50 dark:bg-gray-800/50' : ''
                                }`}
                              >
                                <td className="py-4 px-4">
                                  <div className="text-sm">
                                    <div className="font-medium text-gray-900 dark:text-gray-100">
                                      {format(new Date(item.createdAt), 'dd/MM/yyyy', { locale: vi })}
                                    </div>
                                    <div className="text-gray-500 dark:text-gray-400">
                                      {format(new Date(item.createdAt), 'HH:mm', { locale: vi })}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-4 px-4">
                                  <div className="flex items-center gap-2">
                                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                      <IconComponent className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                      {getTransactionTypeLabel(item.type)}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-4 px-4">
                                  <div className="text-sm text-gray-900 dark:text-gray-100">
                                    {(item.dataType === 'transaction' ? item.adminNote : null) || item.description}
                                  </div>
                                  {item.reference && (
                                    <div className="flex items-center gap-2 mt-1">
                                      <div className="text-xs text-gray-500 dark:text-gray-400">
                                        ID: {item.reference}
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleCopyToClipboard(item.reference, 'Transaction ID')}
                                        className="h-4 w-4 p-0 hover:bg-gray-100"
                                        title="Copy Transaction ID"
                                      >
                                        <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                                      </Button>
                                    </div>
                                  )}
                                  
                                  {/* Always show transaction ID for copying */}
                                  <div className="flex items-center gap-2 mt-1">
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      Transaction ID: #{item.id}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleCopyToClipboard(item.id.toString(), 'Transaction ID')}
                                      className="h-4 w-4 p-0 hover:bg-gray-100"
                                      title="Copy Transaction ID"
                                    >
                                      <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                                    </Button>
                                  </div>

                                </td>
                                <td className="py-4 px-4">
                                  {item.dataType === 'phone_rental' && (item.sessionId || item.phoneNumber) ? (
                                    <div className="space-y-2">
                                      {item.sessionId && (
                                        <div className="flex items-center gap-2">
                                          <div className="text-xs text-gray-500">Session:</div>
                                          <div className="text-xs font-mono text-gray-600">{item.sessionId}</div>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleCopyToClipboard(item.sessionId, 'Session ID')}
                                            className="h-4 w-4 p-0 hover:bg-gray-100"
                                            title="Copy Session ID"
                                          >
                                            <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                                          </Button>
                                        </div>
                                      )}
                                      {item.phoneNumber && (
                                        <div className="flex items-center gap-2">
                                          <div className="text-xs text-gray-500">SĐT:</div>
                                          <div className="text-xs font-medium text-gray-800">{item.phoneNumber}</div>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleCopyToClipboard(item.phoneNumber, 'Số điện thoại')}
                                            className="h-4 w-4 p-0 hover:bg-gray-100"
                                            title="Copy Phone Number"
                                          >
                                            <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                                          </Button>
                                        </div>
                                      )}
                                      {item.otpCode && (
                                        <div className="flex items-center gap-2">
                                          <div className="text-xs text-gray-500">OTP:</div>
                                          <div className="text-xs font-mono bg-green-100 text-green-800 px-2 py-1 rounded">
                                            {item.otpCode}
                                          </div>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleCopyToClipboard(item.otpCode, 'OTP Code')}
                                            className="h-4 w-4 p-0 hover:bg-gray-100"
                                            title="Copy OTP Code"
                                          >
                                            <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-gray-400">-</div>
                                  )}
                                </td>
                                <td className="py-4 px-4 text-right">
                                  <div className={`text-sm font-semibold ${
                                    amountDisplay.isPositive 
                                      ? 'text-green-600 dark:text-green-400' 
                                      : 'text-red-600 dark:text-red-400'
                                  }`}>
                                    {amountDisplay.sign}{amountDisplay.value}
                                  </div>
                                </td>
                                <td className="py-4 px-4 text-center">
                                  <Badge 
                                    variant={item.status === 'completed' ? 'default' : item.status === 'failed' ? 'destructive' : 'secondary'}
                                    className={
                                      item.status === 'completed' 
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                                        : item.status === 'failed'
                                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                    }
                                  >
                                    {item.status === 'completed' ? 'Hoàn thành' : 
                                     item.status === 'failed' ? 'Thất bại' : 'Đang xử lý'}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Hiển thị {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} 
                          {' '}trong tổng {filteredTransactions.length} giao dịch
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="bg-white dark:bg-gray-700"
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Trước
                          </Button>
                          
                          <div className="flex gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                              return (
                                <Button
                                  key={pageNum}
                                  variant={currentPage === pageNum ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setCurrentPage(pageNum)}
                                  className={currentPage === pageNum ? 
                                    "bg-blue-600 text-white" : 
                                    "bg-white dark:bg-gray-700"
                                  }
                                >
                                  {pageNum}
                                </Button>
                              );
                            })}
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="bg-white dark:bg-gray-700"
                          >
                            Tiếp
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}