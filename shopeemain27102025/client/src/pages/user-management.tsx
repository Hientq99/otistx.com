import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { FixedHeader } from "@/components/fixed-header";
import { Users, UserPlus, Edit, Lock, Unlock, Shield, User, Search, Copy, History, ArrowUpDown, ArrowUp, ArrowDown, Filter, MoreVertical, Phone, Mail, Calendar, DollarSign, Menu, CreditCard, Smartphone, Package, Activity, Download, MessageSquare, Volume2, CheckCircle, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { User as UserType } from "@shared/schema";

interface UserFormData {
  username: string;
  email: string;
  password: string;
  fullName: string;
  phone: string;
  role: string;
}

export default function UserManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isBalanceDialogOpen, setIsBalanceDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [isTopupHistoryDialogOpen, setIsTopupHistoryDialogOpen] = useState(false);
  const [isActivityStatsDialogOpen, setIsActivityStatsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [activityStats, setActivityStats] = useState<any[]>([]);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<'none' | 'balance_asc' | 'balance_desc'>('none');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'success' | 'failed' | 'pending'>('all');
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [formData, setFormData] = useState<UserFormData>({
    username: "",
    email: "",
    password: "",
    fullName: "",
    phone: "",
    role: "user"
  });

  // Fetch users
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["/api/users"],
    enabled: user?.role === 'admin' || user?.role === 'superadmin'
  });

  // Fetch user history for selected user
  const { data: userHistory = [], isLoading: isLoadingHistory, error: historyError } = useQuery({
    queryKey: ['/api/users', selectedUser?.id, 'history'],
    queryFn: () => fetch(`/api/users/${selectedUser?.id}/history`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }).then(res => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return res.json();
    }),
    enabled: !!selectedUser?.id && isHistoryDialogOpen && (user?.role === 'admin' || user?.role === 'superadmin'),
  });

  // Fetch top-up history for selected user
  const { data: topupHistory = [], isLoading: isLoadingTopupHistory, error: topupHistoryError } = useQuery({
    queryKey: ['/api/users', selectedUser?.id, 'topup-history'],
    queryFn: () => fetch(`/api/users/${selectedUser?.id}/topup-history`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }).then(res => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return res.json();
    }),
    enabled: !!selectedUser?.id && isTopupHistoryDialogOpen && (user?.role === 'admin' || user?.role === 'superadmin'),
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: (userData: UserFormData) => apiRequest({
      url: "/api/users",
      method: "POST",
      body: userData
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsCreateDialogOpen(false);
      setFormData({
        username: "",
        email: "",
        password: "",
        fullName: "",
        phone: "",
        role: "user"
      });
      toast({
        title: "Thành công",
        description: "Tạo người dùng mới thành công"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể tạo người dùng",
        variant: "destructive"
      });
    }
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<UserFormData> }) => apiRequest({
      url: `/api/users/${id}`,
      method: "PUT",
      body: data
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsEditDialogOpen(false);
      setSelectedUser(null);
      toast({
        title: "Thành công",
        description: "Cập nhật người dùng thành công"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể cập nhật người dùng",
        variant: "destructive"
      });
    }
  });

  // Toggle account status mutation
  const toggleAccountStatusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: number; isActive: boolean }) => apiRequest({
      url: `/api/users/${userId}/toggle-status`,
      method: "PUT",
      body: { isActive: !isActive }
    }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Thành công",
        description: variables.isActive ? "Khóa tài khoản thành công" : "Mở khóa tài khoản thành công"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể thay đổi trạng thái tài khoản",
        variant: "destructive"
      });
    }
  });

  // Update balance mutation
  const updateBalanceMutation = useMutation({
    mutationFn: ({ userId, newBalance }: { userId: number; newBalance: number }) => apiRequest({
      url: `/api/users/${userId}/balance`,
      method: "PUT",
      body: { balance: newBalance }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsBalanceDialogOpen(false);
      setSelectedUser(null);
      setBalanceAmount("");
      toast({
        title: "Thành công",
        description: "Cập nhật số dư thành công"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể cập nhật số dư",
        variant: "destructive"
      });
    }
  });

  // Get activity stats mutation
  const activityStatsMutation = useMutation({
    mutationFn: (userIds: number[]) => apiRequest({
      url: "/api/users/activity-stats",
      method: "POST",
      body: { userIds }
    }),
    onSuccess: (data) => {
      setActivityStats(data);
      setIsActivityStatsDialogOpen(true);
      toast({
        title: "Thành công",
        description: `Đã tải thống kê cho ${data.length} người dùng`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể tải thống kê hoạt động",
        variant: "destructive"
      });
    }
  });

  const handleCreateUser = () => {
    createUserMutation.mutate(formData);
  };

  const handleEditUser = (user: UserType) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      email: user.email || "",
      password: "",
      fullName: user.fullName,
      phone: user.phone || "",
      role: user.role
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateUser = () => {
    if (!selectedUser) return;
    const updateData: Partial<UserFormData> = { ...formData };
    if (!updateData.password) {
      updateData.password = undefined;
    }
    updateUserMutation.mutate({ id: selectedUser.id, data: updateData });
  };

  const handleToggleAccountStatus = (user: UserType) => {
    const action = user.isActive ? "khóa" : "mở khóa";
    if (confirm(`Bạn có chắc chắn muốn ${action} tài khoản này?`)) {
      toggleAccountStatusMutation.mutate({ userId: user.id, isActive: user.isActive });
    }
  };

  const handleUpdateBalance = () => {
    if (selectedUser && balanceAmount) {
      const newBalance = parseFloat(balanceAmount);
      if (isNaN(newBalance)) {
        toast({
          title: "Lỗi",
          description: "Số dư phải là một số hợp lệ",
          variant: "destructive"
        });
        return;
      }
      updateBalanceMutation.mutate({ userId: selectedUser.id, newBalance });
    }
  };

  const openBalanceDialog = (user: UserType) => {
    setSelectedUser(user);
    setBalanceAmount(user.balance.toString());
    setIsBalanceDialogOpen(true);
  };

  // Check if current user can modify target user
  const canModifyUser = (targetUser: UserType) => {
    if (!user) return false;
    // Superadmin can modify anyone
    if (user.role === 'superadmin') return true;
    // Admin can only modify users with 'user' role, NOT admin or superadmin
    if (user.role === 'admin') {
      return targetUser.role === 'user';
    }
    return false;
  };

  // Check if current user can change roles
  const canChangeRole = (targetUser: UserType) => {
    if (!user) return false;
    // Only superadmin can change roles
    return user.role === 'superadmin';
  };

  // Copy text to clipboard
  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Đã sao chép!",
        description: `${type} đã được sao chép vào clipboard.`,
      });
    } catch (err) {
      toast({
        title: "Lỗi sao chép",
        description: "Không thể sao chép thông tin. Vui lòng thử lại.",
        variant: "destructive",
      });
    }
  };

  // Check if current user can view history (admin and superadmin only)
  const canViewHistory = () => {
    return user?.role === 'admin' || user?.role === 'superadmin';
  };

  // Handle view user history
  const handleViewHistory = (targetUser: UserType) => {
    if (!canViewHistory()) return;
    setSelectedUser(targetUser);
    setHistorySearchTerm(""); // Reset search when opening new user history
    setIsHistoryDialogOpen(true);
  };

  const handleViewTopupHistory = (targetUser: UserType) => {
    if (!canViewHistory()) return;
    setSelectedUser(targetUser);
    setIsTopupHistoryDialogOpen(true);
  };

  // Handle user selection for activity stats
  const toggleUserSelection = (userId: number) => {
    setSelectedUsers(prev => 
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAllUsers = () => {
    const currentPageUserIds = paginatedUsers.map((u: UserType) => u.id);
    if (selectedUsers.length === currentPageUserIds.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(currentPageUserIds);
    }
  };

  const handleGetActivityStats = () => {
    if (selectedUsers.length === 0) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn ít nhất một người dùng",
        variant: "destructive"
      });
      return;
    }
    activityStatsMutation.mutate(selectedUsers);
  };

  // Filtering, sorting and pagination logic
  const filteredAndSortedUsers = (users as UserType[])
    .filter(u => {
      // Role-based filtering
      const roleFilter = user?.role === 'superadmin' || u.role === 'user';
      
      // Status filtering
      const statusFilterResult = statusFilter === 'all' || 
        (statusFilter === 'active' && u.isActive) ||
        (statusFilter === 'inactive' && !u.isActive);
      
      // Search filtering
      const searchFilter = searchTerm === "" || 
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()));
      
      return roleFilter && statusFilterResult && searchFilter;
    })
    .sort((a, b) => {
      // Sorting logic
      if (sortBy === 'balance_asc') {
        return parseFloat(a.balance) - parseFloat(b.balance);
      } else if (sortBy === 'balance_desc') {
        return parseFloat(b.balance) - parseFloat(a.balance);
      }
      // No sorting (default order)
      return 0;
    });
  
  const totalUsers = filteredAndSortedUsers.length;
  const totalPages = Math.ceil(totalUsers / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedUsers = filteredAndSortedUsers.slice(startIndex, endIndex);

  // Reset page when search term changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1); // Reset to first page when searching
  };

  // Handle balance sorting
  const handleBalanceSort = () => {
    if (sortBy === 'none') {
      setSortBy('balance_desc'); // High to low first
    } else if (sortBy === 'balance_desc') {
      setSortBy('balance_asc'); // Low to high
    } else {
      setSortBy('none'); // No sorting
    }
    setPage(1); // Reset to first page when sorting
  };

  // Get sort icon based on current sort state
  const getSortIcon = () => {
    if (sortBy === 'balance_desc') return <ArrowDown className="h-4 w-4" />;
    if (sortBy === 'balance_asc') return <ArrowUp className="h-4 w-4" />;
    return <ArrowUpDown className="h-4 w-4" />;
  };

  // Get sort text based on current sort state
  const getSortText = () => {
    if (sortBy === 'balance_desc') return 'Số dư cao → thấp';
    if (sortBy === 'balance_asc') return 'Số dư thấp → cao';
    return 'Sắp xếp theo số dư';
  };

  // UserCard component for mobile display
  const UserCard = ({ user: userItem }: { user: UserType }) => {
    return (
      <Card className="mb-3" data-testid={`card-user-${userItem.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center space-x-3">
              <Checkbox
                checked={selectedUsers.includes(userItem.id)}
                onCheckedChange={() => toggleUserSelection(userItem.id)}
                className="mt-1"
              />
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                <User className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{userItem.fullName}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">@{userItem.username}</p>
              </div>
            </div>
            <Badge variant={userItem.isActive ? 'default' : 'secondary'}>
              {userItem.isActive ? 'Hoạt động' : 'Vô hiệu hóa'}
            </Badge>
          </div>

          <div className="space-y-2 mb-4">
            {userItem.email && (
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-300">{userItem.email}</span>
              </div>
            )}
            {userItem.phone && (
              <div className="flex items-center space-x-2">
                <Phone className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-300">{userItem.phone}</span>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Shield className="h-4 w-4 text-gray-400" />
              <Badge variant="outline">{
                userItem.role === 'superadmin' ? 'Super Admin' :
                userItem.role === 'admin' ? 'Admin' : 'Người dùng'
              }</Badge>
            </div>
            <div className="flex items-center space-x-2">
              <DollarSign className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-green-600">
                {parseFloat(userItem.balance).toLocaleString('vi-VN')} VND
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {new Date(userItem.createdAt).toLocaleDateString('vi-VN')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            {canModifyUser(userItem) && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEditUser(userItem)}
                  className="h-9 text-xs"
                  data-testid={`button-edit-${userItem.id}`}
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Sửa
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openBalanceDialog(userItem)}
                  className="h-9 text-xs"
                  data-testid={`button-balance-${userItem.id}`}
                >
                  <DollarSign className="h-3 w-3 mr-1" />
                  Số dư
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleAccountStatus(userItem)}
                  className="h-9 text-xs"
                  data-testid={`button-toggle-${userItem.id}`}
                >
                  {userItem.isActive ? <Lock className="h-3 w-3 mr-1" /> : <Unlock className="h-3 w-3 mr-1" />}
                  {userItem.isActive ? 'Khóa' : 'Mở'}
                </Button>
              </>
            )}
            {canViewHistory() && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewHistory(userItem)}
                  className="h-9 text-xs"
                  data-testid={`button-history-${userItem.id}`}
                >
                  <History className="h-3 w-3 mr-1" />
                  Sử dụng
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewTopupHistory(userItem)}
                  className="h-9 text-xs bg-green-50 hover:bg-green-100 border-green-200"
                  data-testid={`button-topup-history-${userItem.id}`}
                >
                  <History className="h-3 w-3 mr-1 text-green-600" />
                  Nạp tiền
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return (
      <div className="min-h-screen bg-background">
        <FixedHeader />
        <div className="pt-16 p-6">
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-lg font-semibold mb-2">Không có quyền truy cập</h2>
                <p className="text-muted-foreground">Bạn cần quyền admin để truy cập trang này.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <FixedHeader />
      <div className="pt-16 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <Users className="h-6 w-6 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quản lý người dùng</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Thêm, sửa, xóa người dùng trong hệ thống</p>
              </div>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full sm:w-auto" data-testid="button-add-user">
                    <UserPlus className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Thêm người dùng</span>
                    <span className="sm:hidden">Thêm user</span>
                  </Button>
                </DialogTrigger>
              <DialogContent className="sm:max-w-lg max-w-full w-full h-full sm:h-auto sm:w-auto rounded-none sm:rounded-lg flex flex-col">
                <DialogHeader>
                  <DialogTitle className="text-lg font-semibold">Tạo người dùng mới</DialogTitle>
                </DialogHeader>
                <ScrollArea className="flex-1 px-1">
                  <div className="space-y-6 py-4">
                    <div className="space-y-3">
                      <Label htmlFor="username" className="text-base font-medium">Tên đăng nhập *</Label>
                      <Input
                        id="username"
                        value={formData.username}
                        onChange={(e) => setFormData({...formData, username: e.target.value})}
                        placeholder="Nhập tên đăng nhập"
                        className="h-12 text-base"
                        data-testid="input-create-username"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="email" className="text-base font-medium">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        placeholder="Nhập địa chỉ email"
                        className="h-12 text-base"
                        data-testid="input-create-email"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="password" className="text-base font-medium">Mật khẩu *</Label>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                        placeholder="Nhập mật khẩu"
                        className="h-12 text-base"
                        data-testid="input-create-password"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="fullName" className="text-base font-medium">Họ tên *</Label>
                      <Input
                        id="fullName"
                        value={formData.fullName}
                        onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                        placeholder="Nhập họ và tên đầy đủ"
                        className="h-12 text-base"
                        data-testid="input-create-fullname"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="phone" className="text-base font-medium">Số điện thoại</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        placeholder="Nhập số điện thoại"
                        className="h-12 text-base"
                        data-testid="input-create-phone"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="role" className="text-base font-medium">Vai trò</Label>
                      {user?.role === 'superadmin' ? (
                        <Select value={formData.role} onValueChange={(value) => setFormData({...formData, role: value})}>
                          <SelectTrigger className="h-12" data-testid="select-create-role">
                            <SelectValue placeholder="Chọn vai trò" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">Người dùng</SelectItem>
                            <SelectItem value="admin">Quản trị viên</SelectItem>
                            <SelectItem value="superadmin">Super Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div>
                          <Input value="Người dùng" disabled className="bg-muted h-12" />
                          <p className="text-sm text-muted-foreground mt-2">Admin chỉ có thể tạo tài khoản với vai trò người dùng</p>
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>
                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                  <Button 
                    onClick={handleCreateUser} 
                    disabled={createUserMutation.isPending} 
                    className="flex-1 h-12 text-base"
                    data-testid="button-create-submit"
                  >
                    {createUserMutation.isPending ? "Đang tạo..." : "Tạo người dùng"}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsCreateDialogOpen(false)}
                    className="flex-1 h-12 text-base"
                    data-testid="button-create-cancel"
                  >
                    Hủy
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Activity Stats Button and Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
              <span className="text-sm text-muted-foreground">
                Hiển thị {startIndex + 1}-{Math.min(endIndex, totalUsers)} của {totalUsers} người dùng
              </span>
              {selectedUsers.length > 0 && (
                <Button
                  onClick={handleGetActivityStats}
                  disabled={activityStatsMutation.isPending}
                  className="w-full sm:w-auto h-9"
                  variant="default"
                  size="sm"
                >
                  <Activity className="h-4 w-4 mr-2" />
                  {activityStatsMutation.isPending 
                    ? "Đang tải..." 
                    : `Truy xuất hoạt động (${selectedUsers.length})`
                  }
                </Button>
              )}
              <Select value={limit.toString()} onValueChange={(value) => {
                setLimit(parseInt(value));
                setPage(1);
              }}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Trước
              </Button>
              <span className="text-sm px-3 py-1 bg-primary/10 rounded">
                {page}/{totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Tiếp
              </Button>
            </div>
          </div>

          {/* Search and Filter Section */}
          <Card>
            <CardContent className="pt-6">
              {/* Mobile Layout */}
              <div className="sm:hidden space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm kiếm theo username, họ tên, email..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9 h-12"
                    data-testid="input-search"
                  />
                </div>
                <div className="flex gap-3">
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" className="flex-1 h-12" data-testid="button-filter-mobile">
                        <Filter className="h-4 w-4 mr-2" />
                        Lọc & Sắp xếp
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="h-[80vh]">
                      <SheetHeader>
                        <SheetTitle>Lọc và sắp xếp</SheetTitle>
                      </SheetHeader>
                      <div className="py-6 space-y-6">
                        <div className="space-y-3">
                          <Label className="text-base font-medium">Trạng thái tài khoản</Label>
                          <Select value={statusFilter} onValueChange={(value: 'all' | 'active' | 'inactive') => {
                            setStatusFilter(value);
                            setPage(1);
                          }}>
                            <SelectTrigger className="w-full h-12">
                              <SelectValue placeholder="Chọn trạng thái" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Tất cả trạng thái</SelectItem>
                              <SelectItem value="active">Đang hoạt động</SelectItem>
                              <SelectItem value="inactive">Đã vô hiệu hóa</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Separator />
                        <div className="space-y-3">
                          <Label className="text-base font-medium">Sắp xếp theo số dư</Label>
                          <div className="grid grid-cols-1 gap-3">
                            <Button
                              variant={sortBy === 'none' ? 'default' : 'outline'}
                              onClick={() => {setSortBy('none'); setPage(1);}}
                              className="h-12 justify-start"
                            >
                              <ArrowUpDown className="h-4 w-4 mr-2" />
                              Mặc định
                            </Button>
                            <Button
                              variant={sortBy === 'balance_desc' ? 'default' : 'outline'}
                              onClick={() => {setSortBy('balance_desc'); setPage(1);}}
                              className="h-12 justify-start"
                            >
                              <ArrowDown className="h-4 w-4 mr-2" />
                              Số dư cao → thấp
                            </Button>
                            <Button
                              variant={sortBy === 'balance_asc' ? 'default' : 'outline'}
                              onClick={() => {setSortBy('balance_asc'); setPage(1);}}
                              className="h-12 justify-start"
                            >
                              <ArrowUp className="h-4 w-4 mr-2" />
                              Số dư thấp → cao
                            </Button>
                          </div>
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>
                <div className="text-sm text-muted-foreground text-center">
                  {totalUsers > 0 ? `Tìm thấy ${totalUsers} người dùng` : "Không tìm thấy người dùng nào"}
                </div>
              </div>

              {/* Desktop Layout */}
              <div className="hidden sm:flex items-center gap-4 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm kiếm theo username, họ tên, email..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-desktop"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(value: 'all' | 'active' | 'inactive') => {
                  setStatusFilter(value);
                  setPage(1);
                }}>
                  <SelectTrigger className="w-40" data-testid="select-status-filter">
                    <SelectValue placeholder="Trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="active">Hoạt động</SelectItem>
                    <SelectItem value="inactive">Vô hiệu hóa</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={handleBalanceSort}
                  className="flex items-center gap-2 whitespace-nowrap"
                  title="Click để chuyển đổi sắp xếp theo số dư"
                  data-testid="button-sort-balance"
                >
                  {getSortIcon()}
                  {getSortText()}
                </Button>
                <div className="text-sm text-muted-foreground">
                  {totalUsers > 0 ? `Tìm thấy ${totalUsers} người dùng` : "Không tìm thấy người dùng nào"}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Users List - Responsive */}
          <Card>
            <CardHeader className="hidden sm:block">
              <CardTitle>Danh sách người dùng</CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              {isLoading ? (
                <div className="text-center py-8">
                  <p>Đang tải danh sách người dùng...</p>
                </div>
              ) : (
                <>
                  {/* Mobile Card Layout */}
                  <div className="sm:hidden p-4">
                    {paginatedUsers.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">Không có người dùng nào để hiển thị</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {paginatedUsers.map((userItem: UserType) => (
                          <UserCard key={userItem.id} user={userItem} />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Desktop Table Layout */}
                  <div className="hidden sm:block">
                    <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedUsers.length === paginatedUsers.length && paginatedUsers.length > 0}
                          onCheckedChange={handleSelectAllUsers}
                        />
                      </TableHead>
                      <TableHead>Tên đăng nhập</TableHead>
                      <TableHead>Họ tên</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Vai trò</TableHead>
                      <TableHead>Số dư</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                      <TableHead>Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedUsers.map((user: UserType) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedUsers.includes(user.id)}
                            onCheckedChange={() => toggleUserSelection(user.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <button
                            onClick={() => copyToClipboard(user.username, "Tên đăng nhập")}
                            className="flex items-center gap-2 text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer group"
                            title="Click để sao chép tên đăng nhập"
                          >
                            <span>{user.username}</span>
                            <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        </TableCell>
                        <TableCell>{user.fullName}</TableCell>
                        <TableCell>{user.email || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === 'superadmin' ? 'destructive' : user.role === 'admin' ? 'default' : 'secondary'}>
                            {user.role === 'superadmin' ? (
                              <>
                                <Shield className="h-3 w-3 mr-1" />
                                Super Admin
                              </>
                            ) : user.role === 'admin' ? (
                              <>
                                <Shield className="h-3 w-3 mr-1" />
                                Admin
                              </>
                            ) : (
                              <>
                                <User className="h-3 w-3 mr-1" />
                                User
                              </>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{Number(user.balance).toLocaleString('vi-VN')} ₫</span>
                            {canModifyUser(user) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openBalanceDialog(user)}
                                className="h-6 w-6 p-0"
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.isActive ? 'default' : 'destructive'}>
                            {user.isActive ? 'Hoạt động' : 'Không hoạt động'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {canViewHistory() && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleViewHistory(user)}
                                  title="Xem lịch sử sử dụng"
                                >
                                  <History className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleViewTopupHistory(user)}
                                  title="Xem lịch sử nạp tiền"
                                  className="bg-green-50 hover:bg-green-100 border-green-200"
                                >
                                  <History className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {canModifyUser(user) && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditUser(user)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant={user.isActive ? "destructive" : "default"}
                                  onClick={() => handleToggleAccountStatus(user)}
                                  disabled={toggleAccountStatusMutation.isPending}
                                >
                                  {user.isActive ? (
                                    <Lock className="h-4 w-4" />
                                  ) : (
                                    <Unlock className="h-4 w-4" />
                                  )}
                                </Button>
                              </>
                            )}
                            {!canModifyUser(user) && !canViewHistory() && (
                              <span className="text-sm text-muted-foreground">Không có quyền</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Edit User Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-lg max-w-full w-full h-full sm:h-auto sm:w-auto rounded-none sm:rounded-lg flex flex-col">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold">Chỉnh sửa người dùng</DialogTitle>
              </DialogHeader>
              <ScrollArea className="flex-1 px-1">
                <div className="space-y-6 py-4">
                  <div className="space-y-3">
                    <Label htmlFor="edit-username" className="text-base font-medium">Tên đăng nhập *</Label>
                    <Input
                      id="edit-username"
                      value={formData.username}
                      onChange={(e) => setFormData({...formData, username: e.target.value})}
                      placeholder="Nhập tên đăng nhập"
                      className="h-12 text-base"
                      data-testid="input-edit-username"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="edit-email" className="text-base font-medium">Email</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      placeholder="Nhập địa chỉ email"
                      className="h-12 text-base"
                      data-testid="input-edit-email"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="edit-password" className="text-base font-medium">Mật khẩu mới</Label>
                    <Input
                      id="edit-password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      placeholder="Để trống nếu không thay đổi"
                      className="h-12 text-base"
                      data-testid="input-edit-password"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="edit-fullName" className="text-base font-medium">Họ tên *</Label>
                    <Input
                      id="edit-fullName"
                      value={formData.fullName}
                      onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                      placeholder="Nhập họ và tên đầy đủ"
                      className="h-12 text-base"
                      data-testid="input-edit-fullname"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="edit-phone" className="text-base font-medium">Số điện thoại</Label>
                    <Input
                      id="edit-phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      placeholder="Nhập số điện thoại"
                      className="h-12 text-base"
                      data-testid="input-edit-phone"
                    />
                  </div>
                  {canChangeRole(selectedUser!) && (
                    <div className="space-y-3">
                      <Label htmlFor="edit-role" className="text-base font-medium">Vai trò</Label>
                      <Select value={formData.role} onValueChange={(value) => setFormData({...formData, role: value})}>
                        <SelectTrigger className="h-12" data-testid="select-edit-role">
                          <SelectValue placeholder="Chọn vai trò" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">Người dùng</SelectItem>
                          <SelectItem value="admin">Quản trị viên</SelectItem>
                          <SelectItem value="superadmin">Super Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {!canChangeRole(selectedUser!) && (
                    <div className="space-y-3">
                      <Label htmlFor="edit-role" className="text-base font-medium">Vai trò</Label>
                      <Input
                        value={selectedUser?.role === 'superadmin' ? 'Super Admin' : selectedUser?.role === 'admin' ? 'Quản trị viên' : 'Người dùng'}
                        disabled
                        className="bg-gray-50 h-12"
                      />
                      <p className="text-sm text-muted-foreground">Bạn không có quyền thay đổi vai trò này</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                <Button 
                  onClick={handleUpdateUser} 
                  disabled={updateUserMutation.isPending} 
                  className="flex-1 h-12 text-base"
                  data-testid="button-edit-submit"
                >
                  {updateUserMutation.isPending ? "Đang cập nhật..." : "Cập nhật"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditDialogOpen(false)}
                  className="flex-1 h-12 text-base"
                  data-testid="button-edit-cancel"
                >
                  Hủy
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Balance Update Dialog */}
          <Dialog open={isBalanceDialogOpen} onOpenChange={setIsBalanceDialogOpen}>
            <DialogContent className="sm:max-w-md max-w-full w-full h-auto sm:h-auto sm:w-auto rounded-none sm:rounded-lg flex flex-col">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold">Cập nhật số dư</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="space-y-3">
                  <Label className="text-base font-medium">Người dùng</Label>
                  <Input
                    value={selectedUser?.fullName || ''}
                    disabled
                    className="bg-gray-50 h-12 text-base"
                  />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="balance" className="text-base font-medium">Số dư mới (VND)</Label>
                  <Input
                    id="balance"
                    type="number"
                    value={balanceAmount}
                    onChange={(e) => setBalanceAmount(e.target.value)}
                    placeholder="Nhập số dư mới"
                    className="h-12 text-base"
                    data-testid="input-balance-amount"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                <Button
                  onClick={handleUpdateBalance}
                  disabled={updateBalanceMutation.isPending || !balanceAmount}
                  className="flex-1 h-12 text-base"
                  data-testid="button-balance-submit"
                >
                  {updateBalanceMutation.isPending ? "Đang cập nhật..." : "Cập nhật số dư"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsBalanceDialogOpen(false)}
                  className="flex-1 h-12 text-base"
                  data-testid="button-balance-cancel"
                >
                  Hủy
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* User History Dialog */}
          <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
            <DialogContent className="max-w-full w-full h-full sm:max-w-4xl sm:max-h-[80vh] sm:h-auto sm:w-auto rounded-none sm:rounded-lg flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                  <History className="h-5 w-5" />
                  <span className="hidden sm:inline">Lịch sử sử dụng - {selectedUser?.fullName}</span>
                  <span className="sm:hidden">Lịch sử - {selectedUser?.fullName}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 flex flex-col min-h-0">
                {isLoadingHistory ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-muted-foreground">Đang tải lịch sử...</div>
                  </div>
                ) : historyError ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-red-500">Lỗi khi tải lịch sử: {historyError.message}</div>
                  </div>
                ) : userHistory.length === 0 ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-muted-foreground">Người dùng này chưa có lịch sử sử dụng</div>
                  </div>
                ) : (
                  <div className="flex flex-col h-full">
                    {/* History Filters - Responsive */}
                    <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                      <div className="space-y-4 sm:space-y-0 sm:flex sm:items-center sm:gap-4">
                        <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
                          <label className="text-sm font-medium">Tìm kiếm:</label>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                              placeholder="Số điện thoại, Session ID..."
                              value={historySearchTerm}
                              onChange={(e) => setHistorySearchTerm(e.target.value)}
                              className="pl-10 w-full sm:w-64 h-10"
                            />
                          </div>
                        </div>
                        <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
                          <label className="text-sm font-medium">Trạng thái:</label>
                          <Select value={historyStatusFilter} onValueChange={(value: 'all' | 'success' | 'failed' | 'pending') => {
                            setHistoryStatusFilter(value);
                          }}>
                            <SelectTrigger className="w-full sm:w-32 h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Tất cả</SelectItem>
                              <SelectItem value="success">Thành công</SelectItem>
                              <SelectItem value="failed">Thất bại</SelectItem>
                              <SelectItem value="pending">Chờ xử lý</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    
                    {/* Enhanced History Display - Card Layout */}
                    <ScrollArea className="h-[500px] px-4">
                      <div className="space-y-3 py-4">
                        {userHistory
                          .filter((item: any) => {
                            // Status filter
                            const statusMatch = (() => {
                              if (historyStatusFilter === 'all') return true;
                              
                              let itemStatus = item.status;
                              if (item.isRegistered !== undefined) {
                                itemStatus = item.isRegistered ? 'success' : 'failed';
                              }
                              
                              if (historyStatusFilter === 'success') {
                                return itemStatus === 'completed' || itemStatus === 'success' || item.isRegistered === true;
                              } else if (historyStatusFilter === 'failed') {
                                return itemStatus === 'failed' || item.isRegistered === false;
                              } else if (historyStatusFilter === 'pending') {
                                return itemStatus === 'pending' || itemStatus === 'waiting';
                              }
                              return true;
                            })();

                            // Search filter
                            const searchMatch = (() => {
                              if (!historySearchTerm) return true;
                              const searchLower = historySearchTerm.toLowerCase();
                              
                              return (
                                // Tìm theo số điện thoại
                                (item.phoneNumber && item.phoneNumber.toLowerCase().includes(searchLower)) ||
                                // Tìm theo session ID
                                (item.sessionId && item.sessionId.toLowerCase().includes(searchLower)) ||
                                // Tìm theo mô tả/reference
                                (item.description && item.description.toLowerCase().includes(searchLower)) ||
                                (item.reference && item.reference.toLowerCase().includes(searchLower)) ||
                                // Tìm theo dịch vụ
                                (item.service && item.service.toLowerCase().includes(searchLower)) ||
                                (item.type && item.type.toLowerCase().includes(searchLower))
                              );
                            })();

                            return statusMatch && searchMatch;
                          })
                          // Sort from newest to oldest
                          .sort((a: any, b: any) => {
                            const dateA = new Date(a.createdAt || a.timestamp || a.checkedAt || a.startTime);
                            const dateB = new Date(b.createdAt || b.timestamp || b.checkedAt || b.startTime);
                            return dateB.getTime() - dateA.getTime();
                          })
                          .map((item: any) => {
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
                            
                            const getStatusBadge = (status: string, isRegistered?: boolean) => {
                              if (isRegistered !== undefined) {
                                return isRegistered ? 'default' : 'destructive';
                              }
                              if (['completed', 'success', 'expired'].includes(status)) return 'default';
                              if (['failed', 'error', 'cancelled'].includes(status)) return 'destructive';
                              return 'secondary';
                            };
                            
                            const getStatusLabel = (status: string, isRegistered?: boolean) => {
                              if (isRegistered !== undefined) {
                                return isRegistered ? 'Đã đăng ký' : 'Chưa đăng ký';
                              }
                              switch (status) {
                                case 'completed': return 'Hoàn thành';
                                case 'success': return 'Thành công';
                                case 'failed': return 'Thất bại';
                                case 'pending': return 'Chờ xử lý';
                                case 'expired': return 'Hết hạn';
                                case 'cancelled': return 'Đã hủy';
                                default: return status || 'Hoàn thành';
                              }
                            };
                            
                            const IconComponent = getTransactionIcon(item.service || item.type || 'activity');
                            const itemDate = new Date(item.createdAt || item.timestamp || item.checkedAt || item.startTime);
                            
                            return (
                              <Card key={item.id} className="group shadow-sm border-gray-200 hover:shadow-md hover:border-gray-300 transition-all duration-200 bg-white">
                                <CardContent className="p-4">
                                  {/* Main Info - Responsive */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                                    <div className="flex items-start space-x-4">
                                      <div className="relative shrink-0">
                                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100 group-hover:bg-blue-100 transition-colors">
                                          <IconComponent className="w-5 h-5 text-blue-600" />
                                        </div>
                                        {/* Status indicator dot */}
                                        <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white shadow-sm ${
                                          getStatusBadge(item.status, item.isRegistered) === 'default' ? 'bg-green-500' :
                                          getStatusBadge(item.status, item.isRegistered) === 'destructive' ? 'bg-red-500' :
                                          'bg-yellow-500'
                                        }`}></div>
                                      </div>
                                      <div className="min-w-0 flex-1 space-y-2">
                                        <div>
                                          <p className="font-semibold text-gray-900 text-base">
                                            {item.phoneNumber ? `${item.phoneNumber}` : `${item.service || item.type || 'Giao dịch'}`}
                                          </p>
                                          <p className="text-sm text-gray-600 flex items-center gap-2">
                                            <span>{itemDate.toLocaleDateString('vi-VN')} {itemDate.toLocaleTimeString('vi-VN')}</span>
                                            <span className="text-gray-400">•</span>
                                            <span className="font-medium text-gray-700">
                                              {item.amount ? (
                                                <span className={item.amount > 0 ? "text-green-600" : "text-red-600"}>
                                                  {item.amount > 0 ? "+" : ""}{Math.abs(item.amount)?.toLocaleString('vi-VN')} VND
                                                </span>
                                              ) : item.cost ? (
                                                <span className="text-red-600">
                                                  -{Math.abs(item.cost)?.toLocaleString('vi-VN')} VND
                                                </span>
                                              ) : (
                                                <span className="text-gray-500">0 VND</span>
                                              )}
                                            </span>
                                          </p>
                                        </div>
                                        
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                                            (item.service || item.type) === 'otissim_v3' ? 'bg-blue-100 text-blue-800' :
                                            (item.service || item.type) === 'otissim_v2' ? 'bg-green-100 text-green-800' :
                                            (item.service || item.type) === 'otissim_v1' ? 'bg-purple-100 text-purple-800' :
                                            (item.service || item.type) === 'tiktok_rental' ? 'bg-pink-100 text-pink-800' :
                                            'bg-gray-100 text-gray-800'
                                          }`}>
                                            {(item.service || item.type || 'Không xác định').toUpperCase()}
                                          </span>
                                          {item.carrier && (
                                            <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">
                                              {item.carrier}
                                            </span>
                                          )}
                                        </div>
                                        
                                        {item.sessionId && (
                                          <div className="flex items-center space-x-2">
                                            <span className="text-xs text-gray-500">Session ID:</span>
                                            <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-md border">
                                              <span className="text-xs font-mono text-gray-600 truncate max-w-[120px] sm:max-w-[200px]">
                                                {item.sessionId}
                                              </span>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => copyToClipboard(item.sessionId, 'Session ID')}
                                                className="h-5 w-5 p-0 hover:bg-gray-200 shrink-0 rounded transition-colors"
                                                title="Sao chép Session ID"
                                              >
                                                <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                                              </Button>
                                            </div>
                                          </div>
                                        )}
                                        
                                        {(item.description || item.reference) && (
                                          <div className="text-sm text-gray-600">
                                            {item.description || item.reference}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Actions Section */}
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-end">
                                      {item.otpCode && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-gray-500 font-medium">Mã OTP:</span>
                                          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg px-3 py-1.5 shadow-sm">
                                            <span className="text-sm font-mono font-bold text-green-800 tracking-wider">
                                              {item.otpCode}
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                      <div className="flex items-center gap-3">
                                        <Badge variant={getStatusBadge(item.status, item.isRegistered)}>
                                          {getStatusLabel(item.status, item.isRegistered)}
                                        </Badge>
                                        {item.phoneNumber && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => copyToClipboard(item.phoneNumber, 'Số điện thoại')}
                                            className="shrink-0 hover:bg-gray-100 rounded-lg p-2.5 transition-colors group/copy"
                                            title="Sao chép số điện thoại"
                                          >
                                            <Copy className="w-4 h-4 text-gray-500 group-hover/copy:text-gray-700" />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Enhanced Content for V3 Sessions */}
                                  {item.service === 'otissim_v3' && item.smsContent && (
                                    <div className="mt-4 border-t border-gray-100 pt-4">
                                      <div className="group relative bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all duration-200">
                                        <div className="flex items-center gap-3 mb-4">
                                          <div className="p-2 bg-gray-100 rounded-lg">
                                            <MessageSquare className="w-5 h-5 text-gray-600" />
                                          </div>
                                          <div>
                                            <h4 className="font-semibold text-gray-900 text-sm">Nội dung tin nhắn</h4>
                                            <p className="text-xs text-gray-500">Thông tin chi tiết từ SMS</p>
                                          </div>
                                        </div>
                                        
                                        <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg p-4">
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                              <p className="text-sm text-gray-800 font-mono leading-relaxed whitespace-pre-wrap break-words bg-gradient-to-r from-gray-50 to-white p-3 rounded-md border border-gray-100">
                                                {item.smsContent}
                                              </p>
                                            </div>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => copyToClipboard(item.smsContent || '', 'Nội dung SMS')}
                                              className="shrink-0 hover:bg-gray-100 p-2 rounded-lg transition-colors"
                                              title="Sao chép nội dung SMS"
                                            >
                                              <Copy className="w-4 h-4 text-gray-500" />
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
              <div className="flex justify-end pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setIsHistoryDialogOpen(false)}
                >
                  Đóng
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Top-up History Dialog */}
          <Dialog open={isTopupHistoryDialogOpen} onOpenChange={setIsTopupHistoryDialogOpen}>
            <DialogContent className="max-w-full w-full h-full sm:max-w-4xl sm:max-h-[80vh] sm:h-auto sm:w-auto rounded-none sm:rounded-lg flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                  <History className="h-5 w-5 text-green-600" />
                  <span className="hidden sm:inline">Lịch sử nạp tiền - {selectedUser?.fullName}</span>
                  <span className="sm:hidden">Nạp tiền - {selectedUser?.fullName}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 flex flex-col min-h-0">
                {isLoadingTopupHistory ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-muted-foreground">Đang tải lịch sử nạp tiền...</div>
                  </div>
                ) : topupHistoryError ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-red-500">Lỗi khi tải lịch sử: {topupHistoryError.message}</div>
                  </div>
                ) : topupHistory.length === 0 ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-muted-foreground">Người dùng này chưa có lịch sử nạp tiền</div>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px] px-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Thời gian</TableHead>
                          <TableHead>Mã giao dịch</TableHead>
                          <TableHead>Số tiền</TableHead>
                          <TableHead>Trạng thái</TableHead>
                          <TableHead>Mô tả</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topupHistory.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-sm">
                              {new Date(item.createdAt).toLocaleString('vi-VN')}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {item.trackingCode}
                            </TableCell>
                            <TableCell>
                              <span className="text-green-600 font-medium">
                                +{item.amount?.toLocaleString('vi-VN')} VND
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={item.status === 'completed' ? 'default' : 
                                           item.status === 'failed' || item.status === 'cancelled' ? 'destructive' : 'secondary'}>
                                {item.status === 'completed' ? 'Thành công' :
                                 item.status === 'failed' ? 'Thất bại' :
                                 item.status === 'cancelled' ? 'Đã hủy' :
                                 item.status === 'expired' ? 'Hết hạn' : 'Chờ xử lý'}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {item.description || 'Nạp tiền qua QR code'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </div>
              <div className="flex justify-end pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setIsTopupHistoryDialogOpen(false)}
                  className="h-12 px-6"
                >
                  Đóng
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Activity Stats Dialog */}
          <Dialog open={isActivityStatsDialogOpen} onOpenChange={setIsActivityStatsDialogOpen}>
            <DialogContent className="max-w-full w-full h-full sm:max-w-6xl sm:max-h-[90vh] sm:h-auto sm:w-auto rounded-none sm:rounded-lg flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Activity className="h-5 w-5" />
                  Thống kê hoạt động ({activityStats.length} người dùng)
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 flex flex-col min-h-0">
                {activityStatsMutation.isPending ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-muted-foreground">Đang tải thống kê...</div>
                  </div>
                ) : activityStats.length === 0 ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-muted-foreground">Không có dữ liệu thống kê</div>
                  </div>
                ) : (
                  <ScrollArea className="h-[600px] px-4">
                    <div className="space-y-6 py-4">
                      {activityStats.map((userStat: any) => (
                        <Card key={userStat.userId} className="border-2">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="font-semibold text-lg">{userStat.fullName}</h3>
                                <p className="text-sm text-muted-foreground">@{userStat.username}</p>
                              </div>
                              <Badge variant="outline" className="text-sm">
                                User ID: {userStat.userId}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            {Object.keys(userStat.services).length === 0 ? (
                              <p className="text-muted-foreground text-center py-4">
                                Người dùng này chưa sử dụng dịch vụ nào
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Object.entries(userStat.services).map(([serviceName, stats]: [string, any]) => {
                                  const serviceLabels: any = {
                                    phone_check: { name: 'Kiểm tra SĐT', color: 'bg-blue-50 border-blue-200' },
                                    account_check: { name: 'Kiểm tra Cookie', color: 'bg-purple-50 border-purple-200' },
                                    tracking_check: { name: 'Tracking Check', color: 'bg-orange-50 border-orange-200' },
                                    email_addition: { name: 'Thêm Email', color: 'bg-pink-50 border-pink-200' },
                                    cookie_extraction: { name: 'Trích xuất Cookie', color: 'bg-indigo-50 border-indigo-200' },
                                    otissim_v1: { name: 'OtisSim V1', color: 'bg-purple-50 border-purple-200' },
                                    otissim_v2: { name: 'OtisSim V2', color: 'bg-green-50 border-green-200' },
                                    otissim_v3: { name: 'OtisSim V3', color: 'bg-blue-50 border-blue-200' },
                                    tiktok_rental: { name: 'TikTok Rental', color: 'bg-pink-50 border-pink-200' }
                                  };

                                  const serviceInfo = serviceLabels[serviceName] || { 
                                    name: serviceName, 
                                    color: 'bg-gray-50 border-gray-200' 
                                  };

                                  return (
                                    <div
                                      key={serviceName}
                                      className={`p-4 rounded-lg border-2 ${serviceInfo.color}`}
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-medium text-sm">{serviceInfo.name}</h4>
                                        <Badge variant="secondary" className="text-xs">
                                          {stats.total}
                                        </Badge>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-between text-sm">
                                          <span className="text-green-700 flex items-center gap-1">
                                            <CheckCircle className="h-3 w-3" />
                                            Thành công
                                          </span>
                                          <span className="font-semibold text-green-700">
                                            {stats.success}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                          <span className="text-red-700 flex items-center gap-1">
                                            <X className="h-3 w-3" />
                                            Thất bại
                                          </span>
                                          <span className="font-semibold text-red-700">
                                            {stats.failed}
                                          </span>
                                        </div>
                                        {stats.total > 0 && (
                                          <div className="mt-2 pt-2 border-t">
                                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                              <span>Tỷ lệ thành công</span>
                                              <span className="font-medium">
                                                {Math.round((stats.success / stats.total) * 100)}%
                                              </span>
                                            </div>
                                            <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5">
                                              <div 
                                                className="bg-green-600 h-1.5 rounded-full" 
                                                style={{ width: `${Math.round((stats.success / stats.total) * 100)}%` }}
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
              <div className="flex justify-end pt-4 border-t gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsActivityStatsDialogOpen(false);
                    setSelectedUsers([]);
                  }}
                  className="h-10 px-6"
                >
                  Đóng
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}