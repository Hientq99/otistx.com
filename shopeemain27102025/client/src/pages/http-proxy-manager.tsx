import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { FixedHeader } from "@/components/fixed-header";
import { Globe, Plus, Edit, Trash2, Upload, Copy, Eye, EyeOff, Zap, CheckCircle, XCircle, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface HttpProxy {
  id: number;
  ip: string;
  port: number;
  username: string;
  password: string;
  label?: string;
  isActive: boolean;
  lastUsed?: string;
  totalUsage: number;
  createdAt: string;
  updatedAt: string;
}

export default function HttpProxyManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Single proxy form state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [singleProxy, setSingleProxy] = useState({
    ip: "",
    port: "",
    username: "",
    password: "",
    label: ""
  });

  // Bulk import state
  const [proxiesText, setProxiesText] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);

  // Selection and check live state
  const [selectedProxies, setSelectedProxies] = useState<number[]>([]);
  const [checkLiveResults, setCheckLiveResults] = useState<any[]>([]);

  // Pagination and filtering state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Only allow admin/superadmin access
  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <FixedHeader />
        <div className="container mx-auto px-4 pt-24 pb-8">
          <div className="text-center py-12">
            <Globe className="w-16 h-16 mx-auto text-red-500 mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Không có quyền truy cập
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Chỉ admin có thể truy cập trang này
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Fetch HTTP proxies
  const { data: proxies = [], isLoading } = useQuery<HttpProxy[]>({
    queryKey: ["/api/http-proxies"],
  });

  // Create single proxy mutation
  const createProxyMutation = useMutation({
    mutationFn: (proxyData: any) => apiRequest({
      url: "/api/http-proxies",
      method: "POST",
      body: proxyData
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/http-proxies"] });
      setIsCreateDialogOpen(false);
      setSingleProxy({ ip: "", port: "", username: "", password: "", label: "" });
      toast({
        title: "Thành công",
        description: "Tạo HTTP proxy thành công"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể tạo proxy",
        variant: "destructive"
      });
    }
  });

  // Bulk import mutation
  const bulkImportMutation = useMutation({
    mutationFn: (proxiesText: string) => apiRequest({
      url: "/api/http-proxies/bulk",
      method: "POST",
      body: { proxiesText }
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/http-proxies"] });
      setProxiesText("");
      toast({
        title: "Thành công",
        description: `Đã tạo ${data.created} proxy. ${data.errors ? `Có ${data.errors.length} lỗi.` : ''}`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể import proxy",
        variant: "destructive"
      });
    }
  });

  // Update proxy mutation
  const updateProxyMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: any }) => apiRequest({
      url: `/api/http-proxies/${id}`,
      method: "PATCH",
      body: updates
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/http-proxies"] });
      toast({
        title: "Thành công",
        description: "Cập nhật proxy thành công"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể cập nhật proxy",
        variant: "destructive"
      });
    }
  });

  // Delete proxy mutation
  const deleteProxyMutation = useMutation({
    mutationFn: (id: number) => apiRequest({
      url: `/api/http-proxies/${id}`,
      method: "DELETE"
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/http-proxies"] });
      toast({
        title: "Thành công",
        description: "Xóa proxy thành công"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể xóa proxy",
        variant: "destructive"
      });
    }
  });

  // Check live proxy mutation
  const checkLiveMutation = useMutation({
    mutationFn: (proxyIds: number[]) => apiRequest({
      url: "/api/http-proxies/check-live",
      method: "POST",
      body: { proxyIds }
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/http-proxies"] });
      setCheckLiveResults(data.results);
      toast({
        title: "Kiểm tra hoàn tất",
        description: `Đã kiểm tra ${data.totalChecked} proxy. Live: ${data.liveCount}, Chết: ${data.deadCount}, Tắt: ${data.disabledCount}`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể kiểm tra proxy",
        variant: "destructive"
      });
    }
  });

  // Bulk delete proxy mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (proxyIds: number[]) => apiRequest({
      url: "/api/http-proxies/bulk-delete",
      method: "POST",
      body: { proxyIds }
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/http-proxies"] });
      setSelectedProxies([]); // Clear selection after deletion
      toast({
        title: "Xóa thành công",
        description: `Đã xóa ${data.deletedCount} proxy thành công`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể xóa proxy",
        variant: "destructive"
      });
    }
  });

  const handleCreateSingleProxy = () => {
    if (!singleProxy.ip || !singleProxy.port || !singleProxy.username || !singleProxy.password) {
      toast({
        title: "Lỗi",
        description: "Vui lòng điền đầy đủ thông tin",
        variant: "destructive"
      });
      return;
    }
    createProxyMutation.mutate(singleProxy);
  };

  const handleBulkImport = () => {
    if (!proxiesText.trim()) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập danh sách proxy",
        variant: "destructive"
      });
      return;
    }
    bulkImportMutation.mutate(proxiesText);
  };

  const handleToggleActive = (proxy: HttpProxy) => {
    updateProxyMutation.mutate({
      id: proxy.id,
      updates: { isActive: !proxy.isActive }
    });
  };

  const handleDeleteProxy = (id: number) => {
    if (confirm("Bạn có chắc chắn muốn xóa proxy này?")) {
      deleteProxyMutation.mutate(id);
    }
  };

  const copyProxyFormat = (proxy: HttpProxy) => {
    const format = `${proxy.ip}:${proxy.port}:${proxy.username}:${proxy.password}`;
    navigator.clipboard.writeText(format);
    toast({
      title: "Đã sao chép",
      description: "Thông tin proxy đã được sao chép"
    });
  };

  const formatLastUsed = (dateString?: string) => {
    if (!dateString) return "Chưa sử dụng";
    return new Date(dateString).toLocaleDateString('vi-VN');
  };

  // Selection helper functions
  const handleSelectProxy = (proxyId: number, checked: boolean) => {
    if (checked) {
      setSelectedProxies(prev => [...prev, proxyId]);
    } else {
      setSelectedProxies(prev => prev.filter(id => id !== proxyId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProxies(proxies.map(p => p.id));
    } else {
      setSelectedProxies([]);
    }
  };

  const handleCheckLive = () => {
    if (selectedProxies.length === 0) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn ít nhất một proxy để kiểm tra",
        variant: "destructive"
      });
      return;
    }
    checkLiveMutation.mutate(selectedProxies);
  };

  const handleBulkDelete = () => {
    if (selectedProxies.length === 0) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn ít nhất một proxy để xóa",
        variant: "destructive"
      });
      return;
    }
    
    if (confirm(`Bạn có chắc chắn muốn xóa ${selectedProxies.length} proxy đã chọn?`)) {
      bulkDeleteMutation.mutate(selectedProxies);
    }
  };

  // Get check result for proxy
  const getCheckResult = (proxyId: number) => {
    return checkLiveResults.find(result => result.id === proxyId);
  };

  // Filter and pagination logic
  const filteredProxies = proxies.filter(proxy => {
    if (statusFilter === 'active') return proxy.isActive;
    if (statusFilter === 'inactive') return !proxy.isActive;
    return true;
  });

  const totalPages = Math.ceil(filteredProxies.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedProxies = filteredProxies.slice(startIndex, startIndex + itemsPerPage);

  // Pagination handlers
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedProxies([]); // Clear selection when changing pages
  };

  const handleItemsPerPageChange = (items: number) => {
    setItemsPerPage(items);
    setCurrentPage(1);
    setSelectedProxies([]);
  };

  const handleFilterChange = (filter: 'all' | 'active' | 'inactive') => {
    setStatusFilter(filter);
    setCurrentPage(1);
    setSelectedProxies([]);
  };

  // Check all proxies functionality
  const handleCheckAllProxies = () => {
    const allProxyIds = filteredProxies.map(p => p.id);
    if (allProxyIds.length === 0) {
      toast({
        title: "Lỗi",
        description: "Không có proxy nào để kiểm tra",
        variant: "destructive"
      });
      return;
    }
    checkLiveMutation.mutate(allProxyIds);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <FixedHeader />
      
      <div className="container mx-auto px-4 pt-24 pb-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
              <Globe className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Quản lý HTTP Proxy
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Quản lý danh sách proxy HTTP cho hệ thống
              </p>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">{proxies.length}</div>
              <div className="text-sm text-gray-600">Tổng proxy</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">
                {proxies.filter(p => p.isActive).length}
              </div>
              <div className="text-sm text-gray-600">Đang hoạt động</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-purple-600">
                {proxies.filter(p => p.lastUsed).length}
              </div>
              <div className="text-sm text-gray-600">Đã sử dụng</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-600">
                {proxies.reduce((sum, p) => sum + p.totalUsage, 0)}
              </div>
              <div className="text-sm text-gray-600">Tổng lượt sử dụng</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="manage" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="manage">Quản lý Proxy</TabsTrigger>
            <TabsTrigger value="single">Thêm Đơn Lẻ</TabsTrigger>
            <TabsTrigger value="bulk">Import Hàng Loạt</TabsTrigger>
          </TabsList>

          {/* Manage Tab */}
          <TabsContent value="manage">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Danh sách HTTP Proxy</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPasswords(!showPasswords)}
                  >
                    {showPasswords ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                    {showPasswords ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  </Button>
                  <Button
                    onClick={handleCheckAllProxies}
                    disabled={checkLiveMutation.isPending || filteredProxies.length === 0}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    {checkLiveMutation.isPending ? "Đang kiểm tra..." : "Kiểm tra tất cả"}
                  </Button>
                  {selectedProxies.length > 0 && (
                    <>
                      <Button
                        onClick={handleCheckLive}
                        disabled={checkLiveMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Zap className="w-4 h-4 mr-2" />
                        {checkLiveMutation.isPending ? "Đang kiểm tra..." : `Kiểm tra Live (${selectedProxies.length})`}
                      </Button>
                      <Button
                        onClick={handleBulkDelete}
                        disabled={bulkDeleteMutation.isPending}
                        variant="destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {bulkDeleteMutation.isPending ? "Đang xóa..." : `Xóa (${selectedProxies.length})`}
                      </Button>
                    </>
                  )}
                </div>
              </CardHeader>
              
              {/* Filter and pagination controls */}
              <div className="px-6 pb-4 border-b">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium">Lọc:</span>
                    <div className="flex gap-1">
                      <Button
                        variant={statusFilter === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleFilterChange('all')}
                      >
                        Tất cả ({proxies.length})
                      </Button>
                      <Button
                        variant={statusFilter === 'active' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleFilterChange('active')}
                      >
                        Hoạt động ({proxies.filter(p => p.isActive).length})
                      </Button>
                      <Button
                        variant={statusFilter === 'inactive' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleFilterChange('inactive')}
                      >
                        Tạm dừng ({proxies.filter(p => !p.isActive).length})
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Hiển thị:</span>
                    <div className="flex gap-1">
                      {[10, 20, 50].map(count => (
                        <Button
                          key={count}
                          variant={itemsPerPage === count ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleItemsPerPageChange(count)}
                        >
                          {count}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">Đang tải danh sách proxy...</p>
                  </div>
                ) : filteredProxies.length === 0 ? (
                  <div className="text-center py-8">
                    <Globe className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500 mb-4">
                      {statusFilter === 'all' ? 'Chưa có proxy nào' : `Không có proxy ${statusFilter === 'active' ? 'hoạt động' : 'tạm dừng'}`}
                    </p>
                    <p className="text-sm text-gray-400">
                      {statusFilter === 'all' 
                        ? 'Thêm proxy bằng cách sử dụng các tab "Thêm Đơn Lẻ" hoặc "Import Hàng Loạt"'
                        : 'Thử thay đổi bộ lọc để xem proxy khác'
                      }
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
                                checked={selectedProxies.length === paginatedProxies.length && paginatedProxies.length > 0}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedProxies(prev => [
                                      ...prev.filter(id => !paginatedProxies.find(p => p.id === id)),
                                      ...paginatedProxies.map(p => p.id)
                                    ]);
                                  } else {
                                    setSelectedProxies(prev => prev.filter(id => !paginatedProxies.find(p => p.id === id)));
                                  }
                                }}
                              />
                            </TableHead>
                            <TableHead>IP:Port</TableHead>
                            <TableHead>Xác thực</TableHead>
                            <TableHead>Label</TableHead>
                            <TableHead>Trạng thái</TableHead>
                            <TableHead>Live Status</TableHead>
                            <TableHead>Lần cuối</TableHead>
                            <TableHead>Sử dụng</TableHead>
                            <TableHead>Thao tác</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedProxies.map((proxy) => {
                            const checkResult = getCheckResult(proxy.id);
                            return (
                              <TableRow key={proxy.id}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedProxies.includes(proxy.id)}
                                    onCheckedChange={(checked) => handleSelectProxy(proxy.id, checked as boolean)}
                                  />
                                </TableCell>
                                <TableCell className="font-mono">
                                  {proxy.ip}:{proxy.port}
                                </TableCell>
                                <TableCell className="font-mono">
                                  {proxy.username}:{showPasswords ? proxy.password : '***'}
                                </TableCell>
                                <TableCell>{proxy.label || '-'}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={proxy.isActive}
                                      onCheckedChange={() => handleToggleActive(proxy)}
                                    />
                                    <Badge variant={proxy.isActive ? "default" : "secondary"}>
                                      {proxy.isActive ? "Hoạt động" : "Tạm dừng"}
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {checkResult ? (
                                    <div className="flex items-center gap-2">
                                      {checkResult.live ? (
                                        <CheckCircle className="w-4 h-4 text-green-600" />
                                      ) : (
                                        <XCircle className="w-4 h-4 text-red-600" />
                                      )}
                                      <Badge variant={checkResult.live ? "default" : "destructive"}>
                                        {checkResult.live ? "Live" : "Dead"}
                                      </Badge>
                                      {checkResult.wasDisabled && (
                                        <Badge variant="outline" className="text-orange-600">
                                          Đã tắt
                                        </Badge>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">Chưa kiểm tra</span>
                                  )}
                                </TableCell>
                                <TableCell>{formatLastUsed(proxy.lastUsed)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{proxy.totalUsage}</Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => copyProxyFormat(proxy)}
                                    >
                                      <Copy className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteProxy(proxy.id)}
                                      className="text-red-600 hover:text-red-800"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-2 py-4 border-t">
                        <div className="text-sm text-gray-500">
                          Hiển thị {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredProxies.length)} của {filteredProxies.length} proxy
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="w-4 h-4" />
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
                                  variant={currentPage === pageNum ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => handlePageChange(pageNum)}
                                >
                                  {pageNum}
                                </Button>
                              );
                            })}
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                          >
                            Tiếp
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Single Add Tab */}
          <TabsContent value="single">
            <Card>
              <CardHeader>
                <CardTitle>Thêm Proxy Đơn Lẻ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="ip">IP Address</Label>
                    <Input
                      id="ip"
                      value={singleProxy.ip}
                      onChange={(e) => setSingleProxy({ ...singleProxy, ip: e.target.value })}
                      placeholder="192.168.1.1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="port">Port</Label>
                    <Input
                      id="port"
                      type="number"
                      value={singleProxy.port}
                      onChange={(e) => setSingleProxy({ ...singleProxy, port: e.target.value })}
                      placeholder="8080"
                    />
                  </div>
                  <div>
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={singleProxy.username}
                      onChange={(e) => setSingleProxy({ ...singleProxy, username: e.target.value })}
                      placeholder="user123"
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={singleProxy.password}
                      onChange={(e) => setSingleProxy({ ...singleProxy, password: e.target.value })}
                      placeholder="password123"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="label">Label (Tùy chọn)</Label>
                  <Input
                    id="label"
                    value={singleProxy.label}
                    onChange={(e) => setSingleProxy({ ...singleProxy, label: e.target.value })}
                    placeholder="Proxy for testing"
                  />
                </div>
                <Button
                  onClick={handleCreateSingleProxy}
                  disabled={createProxyMutation.isPending}
                  className="w-full"
                >
                  {createProxyMutation.isPending ? "Đang tạo..." : "Tạo Proxy"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bulk Import Tab */}
          <TabsContent value="bulk">
            <Card>
              <CardHeader>
                <CardTitle>Import Proxy Hàng Loạt</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="proxies">Danh sách Proxy</Label>
                  <p className="text-sm text-gray-600 mb-2">
                    Định dạng: ip:port:username:password (mỗi proxy một dòng)
                  </p>
                  <Textarea
                    id="proxies"
                    value={proxiesText}
                    onChange={(e) => setProxiesText(e.target.value)}
                    placeholder={`192.168.1.1:8080:user1:pass1\n192.168.1.2:8080:user2:pass2\n192.168.1.3:8080:user3:pass3`}
                    rows={10}
                    className="font-mono"
                  />
                </div>
                
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                    Hướng dẫn định dạng
                  </h4>
                  <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                    <li>• Mỗi proxy một dòng</li>
                    <li>• Định dạng: ip:port:username:password</li>
                    <li>• Ví dụ: 192.168.1.1:8080:myuser:mypass</li>
                    <li>• Hệ thống sẽ bỏ qua các dòng không đúng định dạng</li>
                  </ul>
                </div>

                <Button
                  onClick={handleBulkImport}
                  disabled={bulkImportMutation.isPending}
                  className="w-full"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {bulkImportMutation.isPending ? "Đang import..." : "Import Proxy"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}