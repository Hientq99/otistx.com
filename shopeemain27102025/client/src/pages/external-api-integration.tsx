import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { FixedHeader } from '@/components/fixed-header';
import { notifyOtpSuccess } from '@/lib/notifications';
import confetti from 'canvas-confetti';
import { 
  Phone, 
  Key, 
  Clock, 
  Copy, 
  RefreshCw, 
  Loader2,
  CreditCard,
  BarChart3,
  History,
  Check,
  DollarSign,
  CheckCircle,
  XCircle,
  Search,
  Calendar,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Zap,
  Smartphone,
  Monitor,
  Menu,
  X,
  TrendingUp,
  Activity,
  Users,
  Server,
  Settings,
  Bell
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

// Provider Types
type ProviderType = 'viotp' | 'chaycodes3' | '365otp' | 'funotp' | 'ironsim' | 'bossotp';

const PROVIDERS = [
  { value: 'viotp' as ProviderType, label: 'Viotp', description: 'Nhà cung cấp OTP Viotp', icon: '🔥' },
  { value: 'chaycodes3' as ProviderType, label: 'Chaycodes3', description: 'Nhà cung cấp OTP Chaycodes3', icon: '⚡' },
  { value: '365otp' as ProviderType, label: '365OTP', description: 'Nhà cung cấp OTP 365OTP', icon: '🚀' },
  { value: 'funotp' as ProviderType, label: 'FunOTP', description: 'Nhà cung cấp OTP FunOTP', icon: '🎯' },
  { value: 'ironsim' as ProviderType, label: 'IronSim', description: 'Nhà cung cấp OTP IronSim', icon: '🔨' },
  { value: 'bossotp' as ProviderType, label: 'BossOTP', description: 'Nhà cung cấp OTP BossOTP', icon: '👑' }
];

// Carrier definitions for each provider
const CARRIER_OPTIONS = {
  viotp: [
    { value: 'random', label: 'Random (Tự động chọn)', networks: ['MOBIFONE', 'VINAPHONE', 'VIETTEL', 'VIETNAMOBILE', 'ITELECOM'] },
    { value: 'MOBIFONE', label: 'MobiFone', networks: ['MOBIFONE'] },
    { value: 'VINAPHONE', label: 'VinaPhone', networks: ['VINAPHONE'] },
    { value: 'VIETTEL', label: 'Viettel', networks: ['VIETTEL'] },
    { value: 'VIETNAMOBILE', label: 'Vietnamobile', networks: ['VIETNAMOBILE'] },
    { value: 'ITELECOM', label: 'iTelecom', networks: ['ITELECOM'] }
  ],
  chaycodes3: [
    { value: 'random', label: 'Random (Tự động chọn)', carriers: ['Viettel', 'Mobi', 'Vina', 'VNMB', 'ITelecom'] },
    { value: 'Viettel', label: 'Viettel', carriers: ['Viettel'] },
    { value: 'Mobi', label: 'MobiFone', carriers: ['Mobi'] },
    { value: 'Vina', label: 'VinaPhone', carriers: ['Vina'] },
    { value: 'VNMB', label: 'Vietnamobile', carriers: ['VNMB'] },
    { value: 'ITelecom', label: 'iTelecom', carriers: ['ITelecom'] }
  ],
  '365otp': [
    { value: 'random', label: 'Random (Tự động chọn)', carriers: ['Viettel', 'Mobi', 'Vina', 'VNMB', 'ITelecom'] },
    { value: 'Viettel', label: 'Viettel', carriers: ['Viettel'] },
    { value: 'Mobi', label: 'MobiFone', carriers: ['Mobi'] },
    { value: 'Vina', label: 'VinaPhone', carriers: ['Vina'] },
    { value: 'VNMB', label: 'Vietnamobile', carriers: ['VNMB'] },
    { value: 'ITelecom', label: 'iTelecom', carriers: ['ITelecom'] }
  ],
  funotp: [
    { value: 'random', label: 'Random (Tự động chọn)', operators: ['mobifone', 'vinaphone', 'viettel', 'vietnamobile'] },
    { value: 'mobifone', label: 'MobiFone', operators: ['mobifone'] },
    { value: 'vinaphone', label: 'VinaPhone', operators: ['vinaphone'] },
    { value: 'viettel', label: 'Viettel', operators: ['viettel'] },
    { value: 'vietnamobile', label: 'Vietnamobile', operators: ['vietnamobile'] }
  ],
  ironsim: [
    { value: 'random', label: 'Random (Tự động chọn)', networks: ['1', '2', '3', '4', '6'] },
    { value: '1', label: 'MobiFone', networks: ['1'] },
    { value: '2', label: 'VinaPhone', networks: ['2'] },
    { value: '3', label: 'Viettel', networks: ['3'] },
    { value: '4', label: 'Vietnamobile', networks: ['4'] },
    { value: '6', label: 'Itelecom', networks: ['6'] }
  ],
  bossotp: [
    { value: 'random', label: 'Random (Tự động chọn)', networks: ['VIETTEL', 'VINAPHONE', 'MOBIFONE'] },
    { value: 'VIETTEL', label: 'Viettel', networks: ['VIETTEL'] },
    { value: 'VINAPHONE', label: 'VinaPhone', networks: ['VINAPHONE'] },
    { value: 'MOBIFONE', label: 'MobiFone', networks: ['MOBIFONE'] }
  ]
};

// External API Key interface
interface ExternalApiKey {
  id: number;
  provider: ProviderType;
  keyName: string;
  apiKey: string;
  isActive: boolean;
  balance?: number;
  lastUsed?: string;
  createdAt: string;
  updatedAt: string;
}

// External API Rental interface  
interface ExternalApiRental {
  id: number;
  userId: number;
  sessionId: string;
  provider: ProviderType;
  providerRequestId?: string;
  phoneNumber?: string;
  otpCode?: string;
  status: 'requested' | 'requesting' | 'allocated' | 'waiting_otp' | 'otp_received' | 'completed' | 'expired' | 'cancelled' | 'error';
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  otpReceivedAt?: string;
  expiresAt?: string;
  carrier?: string;
  retryCount?: number;
  maxRetries?: number;
}

// Form validation schema
const apiKeySchema = z.object({
  provider: z.enum(['viotp', 'chaycodes3', '365otp', 'funotp', 'ironsim', 'bossotp']),
  keyName: z.string().min(1, 'Tên key không được để trống'),
  keyValue: z.string().min(1, 'API key không được để trống')
});

type ApiKeyFormData = z.infer<typeof apiKeySchema>;

export default function ExternalApiIntegrationPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Controlled tab state with URL hash sync
  const [currentTab, setCurrentTab] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.hash.slice(1) || 'api-keys';
    }
    return 'api-keys';
  });
  
  // Force refresh counter for aggressive cache busting
  const forceRefreshTimer = useRef<NodeJS.Timeout>();
  
  // State management with stable keys and proper typing
  const [revealedApiKeys, setRevealedApiKeys] = useState<Record<string, boolean>>({});
  const [editingKey, setEditingKey] = useState<ExternalApiKey | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<{ [key: number]: ProviderType }>({});
  const [selectedCarrier, setSelectedCarrier] = useState<{ [key: number]: string }>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Phone search state
  const [phoneSearchTerm, setPhoneSearchTerm] = useState('');
  
  // Auto-hide revealed keys after 5 seconds for security
  const autoHideTimeouts = useRef<{ [keyId: string]: NodeJS.Timeout }>({});
  
  const toggleApiKeyVisibility = (keyId: number) => {
    const keyIdStr = String(keyId);
    setRevealedApiKeys(prev => {
      const isCurrentlyRevealed = prev[keyIdStr];
      const newState = { ...prev, [keyIdStr]: !isCurrentlyRevealed };
      
      // Clear existing timeout
      if (autoHideTimeouts.current[keyIdStr]) {
        clearTimeout(autoHideTimeouts.current[keyIdStr]);
        delete autoHideTimeouts.current[keyIdStr];
      }
      
      // Set auto-hide timeout when revealing
      if (!isCurrentlyRevealed) {
        autoHideTimeouts.current[keyIdStr] = setTimeout(() => {
          setRevealedApiKeys(prev => ({ ...prev, [keyIdStr]: false }));
          delete autoHideTimeouts.current[keyIdStr];
        }, 5000);
      }
      
      return newState;
    });
  };
  
  // Hash change event listener for URL sync
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash && ['dashboard', 'api-keys', 'history'].includes(hash)) {
        setCurrentTab(hash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Tab navigation with URL sync
  const navigateToTab = (tab: string) => {
    setCurrentTab(tab);
    window.location.hash = tab;
  };

  // OTP checking timeouts
  const otpCheckTimeouts = useRef<{ [sessionId: string]: NodeJS.Timeout }>({});

  // **OPTIMIZED CACHE MANAGEMENT - Removed aggressive polling for better performance**
  useEffect(() => {
    // Cache busting logic removed to improve performance
    // Data will refresh through natural query intervals
    return () => {
      if (forceRefreshTimer.current) {
        clearInterval(forceRefreshTimer.current);
      }
    };
  }, []);

  // Get current user info for cache isolation
  const { data: currentUser } = useQuery<{ id: number; username: string; }>({ 
    queryKey: ["/api/auth/me"],
    staleTime: 0,
    gcTime: 0
  });
  const userId = currentUser?.id;

  const { data: balance = 0 } = useQuery<number>({
    queryKey: ['/api/user/balance'],
    staleTime: 10000, // Cache for 10 seconds
    gcTime: 30000, // Keep in cache for 30 seconds
    refetchInterval: 60000 // Check balance every 60 seconds (EXTREME EGRESS REDUCTION)
  });

  // Get external API keys (optimized caching)
  const { data: apiKeys = [], isLoading: isLoadingKeys } = useQuery<ExternalApiKey[]>({
    queryKey: ['/api/external-api-keys', userId],
    enabled: !!userId,
    staleTime: 30000, // Cache for 30 seconds (API keys don't change frequently)
    gcTime: 60000 // Keep in cache for 1 minute
  });

  // **CONDITIONAL POLLING - Only poll when there's pending data**
  const { data: rentals = [], isLoading: isLoadingRentals, error, refetch } = useQuery<ExternalApiRental[]>({
    queryKey: ['/api/external-api-rentals', userId], // Stable key without refreshCounter
    enabled: !!userId,
    // SMART POLLING: Chỉ poll khi có rentals đang "allocated" (chờ OTP), ngược lại tắt polling
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasAllocatedRentals = data?.some((r: ExternalApiRental) => r.status === 'allocated');
      return hasAllocatedRentals ? 1000 : false; // 1s live speed nếu có pending, tắt nếu không
    },
    staleTime: 15000, // 15 second stale time
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
    refetchIntervalInBackground: true
  });

  // **AGGRESSIVE OTP CHECK MUTATION WITH IMMEDIATE CACHE INVALIDATION**
  const checkOtpMutation = useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string }) => {
      return apiRequest({
        url: `/api/external-api-rentals/${sessionId}/get-otp`,
        method: 'POST'
      });
    },
    onSuccess: (data: any, variables: { sessionId: string }) => {
      // STOP polling immediately if OTP received
      if (data.otpCode || data.status === 'otp_received') {
        if (otpCheckTimeouts.current[variables.sessionId]) {
          clearInterval(otpCheckTimeouts.current[variables.sessionId]);
          delete otpCheckTimeouts.current[variables.sessionId];
        }
        
        // Sound + Browser notification for OTP success
        if (data.otpCode) {
          const rental = rentals.find((r: any) => r.sessionId === variables.sessionId);
          notifyOtpSuccess(data.otpCode, rental?.phoneNumber);
          
          // Confetti celebration!
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
      }
      
      // STOP polling if session expired or failed
      if (data.expired || data.status === 'failed') {
        if (otpCheckTimeouts.current[variables.sessionId]) {
          clearInterval(otpCheckTimeouts.current[variables.sessionId]);
          delete otpCheckTimeouts.current[variables.sessionId];
        }
      }
      
      // Update cache directly for instant UI update
      queryClient.setQueryData(['/api/external-api-rentals', userId], (oldData: ExternalApiRental[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map(rental => 
          rental.sessionId === variables.sessionId 
            ? { ...rental, ...data, updatedAt: new Date().toISOString() } 
            : rental
        );
      });
      
      // Invalidate cache for fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/external-api-rentals'] });
    },
    onError: (error: any, variables: { sessionId: string }) => {
      // Invalidate cache on error
      queryClient.invalidateQueries({ queryKey: ['/api/external-api-rentals'] });
      
      // Stop polling expired sessions
      if (error.response?.status === 400 || error.message?.includes('expired')) {
        if (otpCheckTimeouts.current[variables.sessionId]) {
          clearInterval(otpCheckTimeouts.current[variables.sessionId]);
          delete otpCheckTimeouts.current[variables.sessionId];
        }
      }
    }
  });

  // **SMART OTP POLLING - Only poll sessions that actually need it**
  useEffect(() => {
    // OTP polling effect triggered
    
    if (!rentals?.length) {
      // No rentals, clearing all intervals
      Object.values(otpCheckTimeouts.current).forEach(intervalId => clearInterval(intervalId as any));
      otpCheckTimeouts.current = {};
      return;
    }
    
    // Find ONLY sessions that actually need OTP checking
    const otpCheckSessions = rentals.filter(rental => {
      // STOP polling if session has OTP already
      if (rental.otpCode) {
        return false;
      }
      
      // STOP polling if session is finished/expired/cancelled
      const finishedStatuses = ['completed', 'expired', 'cancelled', 'failed', 'otp_received'];
      if (finishedStatuses.includes(rental.status)) {
        return false;
      }
      
      // STOP polling if session is too old (30 minutes)
      const sessionAge = Date.now() - new Date(rental.createdAt || rental.updatedAt).getTime();
      if (sessionAge > 30 * 60 * 1000) { // 30 minutes
        return false;
      }
      
      // ONLY poll if session is actively waiting for OTP
      const needsOtp = rental.phoneNumber && 
                      rental.providerRequestId &&
                      (rental.status === 'allocated' || rental.status === 'waiting_otp');
      
      return needsOtp;
    });
    
    // Found sessions that need OTP checking
    
    // Stop polling for sessions that no longer need it
    Object.keys(otpCheckTimeouts.current).forEach(sessionId => {
      const stillNeedsPolling = otpCheckSessions.some(s => s.sessionId === sessionId);
      if (!stillNeedsPolling) {
        // Stopping polling for session
        clearInterval(otpCheckTimeouts.current[sessionId] as any);
        delete otpCheckTimeouts.current[sessionId];
      }
    });
    
    // Start polling for new sessions that need it
    otpCheckSessions.forEach(rental => {
      if (!otpCheckTimeouts.current[rental.sessionId]) {
        // Starting polling for session
        
        // Start interval every 2 seconds (no immediate check to avoid spam)
        const intervalId = setInterval(() => {
          // Checking session OTP
          checkOtpMutation.mutate({ sessionId: rental.sessionId });
        }, 2000);
        
        otpCheckTimeouts.current[rental.sessionId] = intervalId;
      }
    });
    
    return () => {
      Object.values(otpCheckTimeouts.current).forEach(intervalId => clearInterval(intervalId as any));
      otpCheckTimeouts.current = {};
    };
  }, [
    // Only depend on the specific data that matters for OTP polling
    rentals?.map(r => `${r.sessionId}:${r.status}:${!!r.otpCode}`).join(',')
  ]);

  // **FILTERED DATA WITH REAL-TIME UPDATES - LIMIT 10 LATEST**
  const activeRentals = (rentals as ExternalApiRental[])
    .filter((rental: ExternalApiRental) => {
      const isActive = rental.status !== 'completed' && rental.status !== 'expired' && rental.status !== 'cancelled' && rental.status !== 'error';
      const hasRequiredData = rental.phoneNumber && rental.providerRequestId;
      return isActive && hasRequiredData;
    })
    .sort((a: ExternalApiRental, b: ExternalApiRental) => {
      const timeA = new Date(a.createdAt || a.updatedAt).getTime();
      const timeB = new Date(b.createdAt || b.updatedAt).getTime();
      return timeB - timeA; // Most recent first
    })
    .slice(0, 10); // Limit to 10 latest items

  // **ONLY SHOW SESSIONS WITH ACTUAL OTP CODES**
  const successfulRentals = (rentals as ExternalApiRental[])
    .filter((rental: ExternalApiRental) => {
      const hasOtp = !!rental.otpCode;
      const isValidStatus = (rental.status === 'otp_received' || rental.status === 'completed');
      return hasOtp && isValidStatus; // ONLY sessions with real OTP
    })
    .sort((a: ExternalApiRental, b: ExternalApiRental) => {
      const timeA = new Date(a.otpReceivedAt || a.updatedAt).getTime();
      const timeB = new Date(b.otpReceivedAt || b.updatedAt).getTime();
      return timeB - timeA;
    })
    .slice(0, 1); // Only show latest success

  // Rent number mutation with aggressive cache invalidation
  const rentNumberMutation = useMutation({
    mutationFn: async ({ provider, carrier }: { provider: ProviderType; carrier?: string }) => {
      return apiRequest({
        url: '/api/external-api-rentals',
        method: 'POST',
        body: { provider, carrier }
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Thành công",
        description: `Đã bắt đầu thuê số từ ${data.provider}`,
      });
      
      // AGGRESSIVE cache invalidation
      queryClient.invalidateQueries({ queryKey: ['/api/external-api-rentals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/balance'] });
      // Refresh removed for better performance
      // lastUpdateTime removed for better performance
      
      // Force multiple refetches with delays
      setTimeout(() => {
        refetch();
        // Refresh removed for better performance
      }, 1000);
      
      setTimeout(() => {
        refetch();
        // Refresh removed for better performance
      }, 3000);
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể thuê số",
        variant: "destructive"
      });
      
      // Invalidate on error too
      queryClient.invalidateQueries({ queryKey: ['/api/external-api-rentals'] });
      // Refresh removed for better performance
    }
  });

  // Copy to clipboard helper
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Đã sao chép",
        description: `${label} đã được sao chép vào clipboard`,
      });
    } catch (err) {
      toast({
        title: "Lỗi",
        description: "Không thể sao chép vào clipboard",
        variant: "destructive"
      });
    }
  };

  // Add API key form
  const addForm = useForm<ApiKeyFormData>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: {
      provider: 'viotp',
      keyName: '',
      keyValue: ''
    }
  });

  // Edit API key form
  const editForm = useForm<ApiKeyFormData>({
    resolver: zodResolver(apiKeySchema)
  });

  // Add API key mutation
  const addApiKeyMutation = useMutation({
    mutationFn: async (data: ApiKeyFormData) => {
      return apiRequest({
        url: '/api/external-api-keys',
        method: 'POST',
        body: data
      });
    },
    onSuccess: () => {
      toast({
        title: "Thành công",
        description: "API key đã được thêm thành công",
      });
      addForm.reset();
      setIsAddDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/external-api-keys'] });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể thêm API key",
        variant: "destructive"
      });
    }
  });

  // Update API key mutation
  const updateApiKeyMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ApiKeyFormData> }) => {
      return apiRequest({
        url: `/api/external-api-keys/${id}`,
        method: 'PUT',
        body: data
      });
    },
    onSuccess: () => {
      toast({
        title: "Thành công",
        description: "API key đã được cập nhật thành công",
      });
      editForm.reset();
      setIsEditDialogOpen(false);
      setEditingKey(null);
      queryClient.invalidateQueries({ queryKey: ['/api/external-api-keys'] });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể cập nhật API key",
        variant: "destructive"
      });
    }
  });

  // Delete API key mutation
  const deleteApiKeyMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest({
        url: `/api/external-api-keys/${id}`,
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      toast({
        title: "Thành công",
        description: "API key đã được xóa thành công",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/external-api-keys'] });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể xóa API key",
        variant: "destructive"
      });
    }
  });

  // Handle edit API key
  const handleEditKey = (key: ExternalApiKey) => {
    setEditingKey(key);
    editForm.reset({
      provider: key.provider,
      keyName: key.keyName,
      keyValue: (key as any).keyValue
    });
    setIsEditDialogOpen(true);
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  // Format time ago
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds} giây trước`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} phút trước`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} giờ trước`;
    return `${Math.floor(diffInSeconds / 86400)} ngày trước`;
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'requested':
      case 'requesting':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'allocated':
      case 'waiting_otp':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'otp_received':
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'expired':
      case 'cancelled':
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  // Get status text in Vietnamese
  const getStatusText = (status: string) => {
    switch (status) {
      case 'requested': return 'Đang yêu cầu';
      case 'requesting': return 'Đang xử lý';
      case 'allocated': return 'Đã cấp số';
      case 'waiting_otp': return 'Chờ OTP';
      case 'otp_received': return 'Đã nhận OTP';
      case 'completed': return 'Hoàn thành';
      case 'expired': return 'Hết hạn';
      case 'cancelled': return 'Đã hủy';
      case 'error': return 'Lỗi';
      default: return status;
    }
  };

  // Filter rentals by both search terms
  const filteredRentals = rentals.filter(rental => {
    const matchesGeneralSearch = 
      rental.phoneNumber?.includes(searchTerm) ||
      rental.otpCode?.includes(searchTerm) ||
      rental.provider.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rental.sessionId.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesPhoneSearch = phoneSearchTerm === '' || 
      rental.phoneNumber?.includes(phoneSearchTerm);
      
    return matchesGeneralSearch && matchesPhoneSearch;
  });

  // Pagination logic
  const totalItems = filteredRentals.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRentals = filteredRentals.slice(startIndex, endIndex);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, phoneSearchTerm, itemsPerPage]);

  // Pagination component
  const PaginationControls = () => (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">Hiển thị:</span>
        <Select value={String(itemsPerPage)} onValueChange={(value) => setItemsPerPage(Number(value))}>
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          trên tổng số {totalItems} kết quả
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          disabled={currentPage === 1}
          data-testid="button-prev-page"
        >
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
                onClick={() => setCurrentPage(pageNum)}
                className="w-8 h-8 p-0"
                data-testid={`button-page-${pageNum}`}
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
          data-testid="button-next-page"
        >
          Tiếp
        </Button>
      </div>
    </div>
  );

  // Get provider icon
  const getProviderIcon = (provider: ProviderType) => {
    const providerData = PROVIDERS.find(p => p.value === provider);
    return providerData?.icon || '📱';
  };

  // Calculate statistics
  const stats = {
    totalRentals: rentals.length,
    activeRentals: activeRentals.length,
    successfulRentals: rentals.filter(r => r.status === 'completed' || r.status === 'otp_received').length,
    failedRentals: rentals.filter(r => r.status === 'error' || r.status === 'expired').length
  };

  return (
    <div className="min-h-screen bg-gray-50/30 dark:bg-gray-950">
      <FixedHeader />
      
      {/* Modern Page Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between py-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <Server className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="ml-4">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    API Integration
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Quản lý thuê số từ các nhà cung cấp bên ngoài
                  </p>
                </div>
              </div>
              
              {/* Quick Stats Badges */}
              <div className="flex items-center space-x-4 mt-4">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {stats.activeRentals} đang hoạt động
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <DollarSign className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatCurrency(balance)}
                  </span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {apiKeys.filter(k => k.isActive).length} API keys
                </Badge>
              </div>
            </div>
            
            {/* Header Actions */}
            <div className="mt-4 lg:mt-0 flex items-center space-x-3">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    // Call new refresh endpoint
                    const response = await apiRequest({
                      url: '/api/external-api-keys/refresh-all-balances',
                      method: 'POST'
                    });
                    
                    // Refresh cache to show updated data
                    await queryClient.invalidateQueries({ queryKey: ['/api/external-api-keys'] });
                    
                    toast({
                      title: "Cập nhật thành công",
                      description: response.message || "Đã làm mới số dư tất cả API keys",
                    });
                  } catch (error: any) {
                    toast({
                      title: "Lỗi cập nhật",
                      description: error.message || "Không thể cập nhật số dư API keys",
                      variant: "destructive"
                    });
                  }
                }}
                data-testid="button-refresh-balances"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Cập nhật số dư
              </Button>
              <Button
                onClick={() => setIsAddDialogOpen(true)}
                data-testid="button-add-api-key-header"
              >
                <Plus className="w-4 h-4 mr-2" />
                Thêm API Key
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content with Tabs */}
      <Tabs value={currentTab} onValueChange={navigateToTab} className="w-full">
        {/* Tabs Navigation */}
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:grid-cols-none lg:flex">
              <TabsTrigger value="dashboard" className="flex items-center gap-2">
                <Monitor className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="api-keys" className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                <span className="hidden sm:inline">API Keys</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="w-4 h-4" />
                <span className="hidden sm:inline">Lịch sử</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* Tab Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Mobile Navigation Sheet */}
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="lg:hidden fixed top-20 left-4 z-50">
                <Menu className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80">
              <div className="py-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold">Quick Stats</h3>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Số dư:</span>
                      <span className="font-medium">{formatCurrency(balance)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Đang hoạt động:</span>
                      <span className="font-medium">{stats.activeRentals}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Thành công:</span>
                      <span className="font-medium">{stats.successfulRentals}</span>
                    </div>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Dashboard Tab Content */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Quick Rent Section - Priority on Mobile */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Thuê số nhanh
                </CardTitle>
                <CardDescription>
                  Chọn nhà cung cấp và nhà mạng để thuê số điện thoại
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {PROVIDERS.map((provider, index) => {
                    const availableKeys = apiKeys.filter(key => key.provider === provider.value && key.isActive);
                    const hasActiveKeys = availableKeys.length > 0;
                    const totalBalance = availableKeys.reduce((sum, key) => sum + (key.balance || 0), 0);
                    
                    return (
                      <Card key={provider.value} className={`transition-all hover:shadow-md ${!hasActiveKeys ? 'opacity-60' : ''}`}>
                        <CardContent className="p-4">
                          <div className="flex items-center space-x-3 mb-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800 rounded-lg flex items-center justify-center">
                              <span className="text-2xl">{provider.icon}</span>
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-gray-900 dark:text-white">{provider.label}</h3>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {availableKeys.length} key{availableKeys.length !== 1 ? 's' : ''} • {formatCurrency(totalBalance)}
                              </p>
                            </div>
                          </div>

                          {hasActiveKeys ? (
                            <div className="space-y-3">
                              <div>
                                <Label htmlFor={`carrier-${index}`} className="text-xs text-gray-600 dark:text-gray-400">
                                  Nhà mạng
                                </Label>
                                <Select
                                  value={selectedCarrier[index] || 'random'}
                                  onValueChange={(value) => setSelectedCarrier(prev => ({ ...prev, [index]: value }))}
                                >
                                  <SelectTrigger className="h-9 mt-1">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CARRIER_OPTIONS[provider.value].map((carrier) => (
                                      <SelectItem key={carrier.value} value={carrier.value}>
                                        {carrier.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <Button
                                data-testid={`button-rent-${provider.value}`}
                                className="w-full"
                                onClick={() => rentNumberMutation.mutate({ 
                                  provider: provider.value, 
                                  carrier: selectedCarrier[index] === 'random' ? undefined : selectedCarrier[index] 
                                })}
                                disabled={rentNumberMutation.isPending || balance < 100}
                              >
                                {rentNumberMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Phone className="h-4 w-4 mr-2" />
                                )}
                                Thuê số
                              </Button>
                            </div>
                          ) : (
                            <div className="text-center py-3">
                              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                                Chưa có API key hoạt động
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setIsAddDialogOpen(true);
                                  addForm.setValue('provider', provider.value);
                                }}
                                data-testid={`button-add-key-${provider.value}`}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Thêm API Key
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Active Rentals - High Priority */}
            {activeRentals.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-green-500" />
                        Đang thuê số ({activeRentals.length})
                      </CardTitle>
                      <CardDescription>
                        Theo dõi các phiên thuê số đang hoạt động
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetch()}
                      disabled={isLoadingRentals}
                      data-testid="button-refresh-active-rentals"
                    >
                      {isLoadingRentals ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Mobile: Cards Layout */}
                  <div className="block lg:hidden space-y-3 p-4">
                    {activeRentals.map((rental) => (
                      <Card key={rental.sessionId} className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">{getProviderIcon(rental.provider)}</span>
                            <div>
                              <p className="font-medium text-sm capitalize">{rental.provider}</p>
                              {rental.carrier && (
                                <p className="text-xs text-gray-500">{rental.carrier}</p>
                              )}
                            </div>
                          </div>
                          <Badge className={getStatusColor(rental.status)}>
                            {getStatusText(rental.status)}
                          </Badge>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Số điện thoại:</span>
                            <div className="flex items-center space-x-1">
                              <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                {rental.phoneNumber || 'N/A'}
                              </code>
                              {rental.phoneNumber && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(rental.phoneNumber!, 'Số điện thoại')}
                                  data-testid={`button-copy-phone-${rental.sessionId}`}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">OTP:</span>
                            <div className="flex items-center space-x-1">
                              <code className={`text-xs px-2 py-1 rounded ${
                                rental.otpCode 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                                {rental.otpCode || 'Chờ OTP...'}
                              </code>
                              {rental.otpCode && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(rental.otpCode!, 'Mã OTP')}
                                  data-testid={`button-copy-otp-${rental.sessionId}`}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Thời gian:</span>
                            <span className="text-xs text-gray-700">{formatTimeAgo(rental.createdAt)}</span>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  {/* Desktop: Table Layout */}
                  <div className="hidden lg:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Provider</TableHead>
                          <TableHead>Số điện thoại</TableHead>
                          <TableHead>OTP</TableHead>
                          <TableHead>Trạng thái</TableHead>
                          <TableHead>Thời gian</TableHead>
                          <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeRentals.map((rental) => (
                          <TableRow key={rental.sessionId}>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <span className="text-lg">{getProviderIcon(rental.provider)}</span>
                                <div>
                                  <p className="font-medium capitalize">{rental.provider}</p>
                                  {rental.carrier && (
                                    <p className="text-xs text-gray-500">{rental.carrier}</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <code className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">
                                  {rental.phoneNumber || 'N/A'}
                                </code>
                                {rental.phoneNumber && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard(rental.phoneNumber!, 'Số điện thoại')}
                                    data-testid={`button-copy-phone-${rental.sessionId}`}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <code className={`px-2 py-1 rounded text-sm font-mono ${
                                  rental.otpCode 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {rental.otpCode || 'Chờ OTP...'}
                                </code>
                                {rental.otpCode && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard(rental.otpCode!, 'Mã OTP')}
                                    data-testid={`button-copy-otp-${rental.sessionId}`}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={getStatusColor(rental.status)}>
                                {getStatusText(rental.status)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm">{formatTimeAgo(rental.createdAt)}</p>
                                {rental.otpReceivedAt && (
                                  <p className="text-xs text-gray-500">
                                    OTP: {formatTimeAgo(rental.otpReceivedAt)}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(rental.sessionId, 'Session ID')}
                                data-testid={`button-copy-session-${rental.sessionId}`}
                              >
                                <Copy className="h-3 w-3" />
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

            {/* Statistics Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Tổng thuê</p>
                      <p className="text-2xl font-bold">{stats.totalRentals}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Activity className="h-5 w-5 text-yellow-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Đang hoạt động</p>
                      <p className="text-2xl font-bold text-yellow-600">{stats.activeRentals}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Thành công</p>
                      <p className="text-2xl font-bold text-green-600">{stats.successfulRentals}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="h-5 w-5 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Số dư</p>
                      <p className="text-2xl font-bold text-purple-600">{formatCurrency(balance)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* API Keys Tab Content */}
          <TabsContent value="api-keys" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">API Keys</h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Quản lý API keys cho các nhà cung cấp OTP
                </p>
              </div>
              <Button
                onClick={() => setIsAddDialogOpen(true)}
                data-testid="button-add-api-key-main"
              >
                <Plus className="w-4 h-4 mr-2" />
                Thêm API Key
              </Button>
            </div>

            {/* API Keys Grid */}
            {isLoadingKeys ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-gray-500">Đang tải API keys...</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {PROVIDERS.map((provider) => {
                  const providerKeys = apiKeys.filter(key => key.provider === provider.value);
                  const activeKeys = providerKeys.filter(key => key.isActive);
                  const totalBalance = activeKeys.reduce((sum, key) => sum + (key.balance || 0), 0);

                return (
                  <Card key={provider.value}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800 rounded-lg flex items-center justify-center">
                            <span className="text-2xl">{provider.icon}</span>
                          </div>
                          <div>
                            <CardTitle className="text-lg">{provider.label}</CardTitle>
                            <CardDescription>
                              {activeKeys.length} active keys • {formatCurrency(totalBalance)} total
                            </CardDescription>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setIsAddDialogOpen(true);
                            addForm.setValue('provider', provider.value);
                          }}
                          data-testid={`button-add-key-${provider.value}`}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Key
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {providerKeys.length > 0 ? (
                        <div className="space-y-4">
                          {providerKeys.map((key) => (
                            <div key={key.id} className="flex items-center justify-between p-4 border rounded-lg">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium">{key.keyName}</span>
                                  <Badge variant={key.isActive ? "default" : "secondary"}>
                                    {key.isActive ? "Active" : "Inactive"}
                                  </Badge>
                                </div>
                                
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm text-gray-600">Key:</span>
                                  <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                                    {revealedApiKeys[String(key.id)] 
                                      ? (key as any).keyValue 
                                      : '••••••••••••••••••••••••••••••••••••••••••••••••••••'
                                    }
                                  </code>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleApiKeyVisibility(key.id)}
                                    data-testid={`button-toggle-key-${key.id}`}
                                  >
                                    {revealedApiKeys[String(key.id)] ? (
                                      <EyeOff className="h-3 w-3" />
                                    ) : (
                                      <Eye className="h-3 w-3" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard((key as any).keyValue, 'API Key')}
                                    data-testid={`button-copy-key-${key.id}`}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>

                                <div className="flex items-center space-x-4 text-sm text-gray-600">
                                  <span>Balance: <span className="font-medium text-green-600">{formatCurrency(key.balance || 0)}</span></span>
                                  {key.lastUsed && (
                                    <span>Last used: {formatTimeAgo(key.lastUsed)}</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditingKey(key);
                                    setIsEditDialogOpen(true);
                                  }}
                                  data-testid={`button-edit-key-${key.id}`}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => deleteApiKeyMutation.mutate(key.id)}
                                  disabled={deleteApiKeyMutation.isPending}
                                  data-testid={`button-delete-key-${key.id}`}
                                >
                                  {deleteApiKeyMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Key className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-500 mb-4">No API keys configured for {provider.label}</p>
                          <Button
                            onClick={() => {
                              setIsAddDialogOpen(true);
                              addForm.setValue('provider', provider.value);
                            }}
                            data-testid={`button-add-first-key-${provider.value}`}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add First Key
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
                })}
              </div>
            )}
          </TabsContent>

          {/* History Tab Content */}
          <TabsContent value="history" className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Lịch sử thuê số</h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Xem tất cả các phiên thuê số đã thực hiện
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Tìm kiếm theo số điện thoại..."
                    value={phoneSearchTerm}
                    onChange={(e) => setPhoneSearchTerm(e.target.value)}
                    className="pl-10 w-full sm:w-60"
                    data-testid="input-search-phone"
                  />
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Tìm kiếm OTP, session ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full sm:w-60"
                    data-testid="input-search-general"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => refetch()}
                  disabled={isLoadingRentals}
                  data-testid="button-refresh-history"
                >
                  {isLoadingRentals ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* History Content */}
            {isLoadingRentals ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-4">
                        <Skeleton className="w-12 h-12 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                        <Skeleton className="h-6 w-20" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredRentals.length > 0 ? (
              <div className="space-y-4">
                {/* Mobile: Cards Layout */}
                <div className="block lg:hidden space-y-3">
                  {paginatedRentals.map((rental) => (
                    <Card key={rental.sessionId}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">{getProviderIcon(rental.provider)}</span>
                            <div>
                              <p className="font-medium text-sm capitalize">{rental.provider}</p>
                              {rental.carrier && (
                                <p className="text-xs text-gray-500">{rental.carrier}</p>
                              )}
                            </div>
                          </div>
                          <Badge className={getStatusColor(rental.status)}>
                            {getStatusText(rental.status)}
                          </Badge>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Số điện thoại:</span>
                            <div className="flex items-center space-x-1">
                              <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                {rental.phoneNumber || 'N/A'}
                              </code>
                              {rental.phoneNumber && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(rental.phoneNumber!, 'Số điện thoại')}
                                  data-testid={`button-copy-phone-history-${rental.sessionId}`}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">OTP:</span>
                            <div className="flex items-center space-x-1">
                              <code className={`text-xs px-2 py-1 rounded ${
                                rental.otpCode 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                                {rental.otpCode || 'N/A'}
                              </code>
                              {rental.otpCode && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(rental.otpCode!, 'Mã OTP')}
                                  data-testid={`button-copy-otp-history-${rental.sessionId}`}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Thời gian:</span>
                            <span className="text-xs text-gray-700">{formatTimeAgo(rental.createdAt)}</span>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Session ID:</span>
                            <div className="flex items-center space-x-1">
                              <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                {rental.sessionId.slice(0, 12)}...
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(rental.sessionId, 'Session ID')}
                                data-testid={`button-copy-session-history-${rental.sessionId}`}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Desktop: Table Layout */}
                <div className="hidden lg:block">
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Provider</TableHead>
                            <TableHead>Số điện thoại</TableHead>
                            <TableHead>OTP</TableHead>
                            <TableHead>Trạng thái</TableHead>
                            <TableHead>Thời gian</TableHead>
                            <TableHead>Session ID</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedRentals.map((rental) => (
                            <TableRow key={rental.sessionId}>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <span className="text-lg">{getProviderIcon(rental.provider)}</span>
                                  <div>
                                    <p className="font-medium capitalize">{rental.provider}</p>
                                    {rental.carrier && (
                                      <p className="text-xs text-gray-500">{rental.carrier}</p>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <code className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">
                                    {rental.phoneNumber || 'N/A'}
                                  </code>
                                  {rental.phoneNumber && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => copyToClipboard(rental.phoneNumber!, 'Số điện thoại')}
                                      data-testid={`button-copy-phone-table-${rental.sessionId}`}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <code className={`px-2 py-1 rounded text-sm font-mono ${
                                    rental.otpCode 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-gray-100 text-gray-500'
                                  }`}>
                                    {rental.otpCode || 'N/A'}
                                  </code>
                                  {rental.otpCode && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => copyToClipboard(rental.otpCode!, 'Mã OTP')}
                                      data-testid={`button-copy-otp-table-${rental.sessionId}`}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={getStatusColor(rental.status)}>
                                  {getStatusText(rental.status)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="text-sm">{formatTimeAgo(rental.createdAt)}</p>
                                  {rental.otpReceivedAt && (
                                    <p className="text-xs text-gray-500">
                                      OTP: {formatTimeAgo(rental.otpReceivedAt)}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                  {rental.sessionId.slice(0, 12)}...
                                </code>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(rental.sessionId, 'Session ID')}
                                  data-testid={`button-copy-session-table-${rental.sessionId}`}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
                
                {/* Pagination Controls */}
                <PaginationControls />
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">
                    {searchTerm || phoneSearchTerm ? 'Không tìm thấy kết quả nào' : 'Chưa có lịch sử thuê số nào'}
                  </p>
                  {(searchTerm || phoneSearchTerm) && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearchTerm('');
                        setPhoneSearchTerm('');
                      }}
                      data-testid="button-clear-search"
                    >
                      Xóa bộ lọc
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </div>
      </Tabs>

      {/* Add API Key Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm API Key</DialogTitle>
            <DialogDescription>
              Thêm API key mới cho nhà cung cấp OTP
            </DialogDescription>
          </DialogHeader>
          <Form {...addForm}>
            <form onSubmit={addForm.handleSubmit((data) => addApiKeyMutation.mutate(data))} className="space-y-4">
              <FormField
                control={addForm.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nhà cung cấp</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-provider">
                          <SelectValue placeholder="Chọn nhà cung cấp" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PROVIDERS.map((provider) => (
                          <SelectItem key={provider.value} value={provider.value}>
                            <div className="flex items-center space-x-2">
                              <span>{provider.icon}</span>
                              <span>{provider.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={addForm.control}
                name="keyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên key</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="VD: API Key chính"
                        {...field}
                        data-testid="input-key-name"
                      />
                    </FormControl>
                    <FormDescription>
                      Tên để phân biệt các API key
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={addForm.control}
                name="keyValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Nhập API key"
                        {...field}
                        data-testid="input-api-key"
                      />
                    </FormControl>
                    <FormDescription>
                      API key được cung cấp bởi nhà cung cấp
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsAddDialogOpen(false)}
                  data-testid="button-cancel-add"
                >
                  Hủy
                </Button>
                <Button 
                  type="submit" 
                  disabled={addApiKeyMutation.isPending}
                  data-testid="button-submit-add"
                >
                  {addApiKeyMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Đang thêm...
                    </>
                  ) : (
                    'Thêm'
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit API Key Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa API Key</DialogTitle>
            <DialogDescription>
              Cập nhật thông tin API key
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((data) => updateApiKeyMutation.mutate({ id: editingKey?.id!, data }))} className="space-y-4">
              <FormField
                control={editForm.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nhà cung cấp</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled>
                      <FormControl>
                        <SelectTrigger data-testid="select-provider-edit">
                          <SelectValue placeholder="Chọn nhà cung cấp" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PROVIDERS.map((provider) => (
                          <SelectItem key={provider.value} value={provider.value}>
                            <div className="flex items-center space-x-2">
                              <span>{provider.icon}</span>
                              <span>{provider.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="keyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên key</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="VD: API Key chính"
                        {...field}
                        data-testid="input-key-name-edit"
                      />
                    </FormControl>
                    <FormDescription>
                      Tên để phân biệt các API key
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="keyValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Nhập API key"
                        {...field}
                        data-testid="input-api-key-edit"
                      />
                    </FormControl>
                    <FormDescription>
                      API key được cung cấp bởi nhà cung cấp
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setEditingKey(null);
                    editForm.reset();
                  }}
                  data-testid="button-cancel-edit"
                >
                  Hủy
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateApiKeyMutation.isPending}
                  data-testid="button-submit-edit"
                >
                  {updateApiKeyMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Đang cập nhật...
                    </>
                  ) : (
                    'Cập nhật'
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

