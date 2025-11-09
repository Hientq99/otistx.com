import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { FixedHeader } from "@/components/fixed-header";
import { Settings, Plus, Edit, Trash2, Shield, Key, Globe, Smartphone, Database, Clock, AlertTriangle, CheckCircle2, Link as LinkIcon, Menu, ChevronDown, ChevronRight, Eye, EyeOff, X, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface SystemConfig {
  id: number;
  configKey: string;
  configValue: string;
  configType: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ConfigFormData {
  configKey: string;
  configValue: string;
  configType: string;
  description: string;
  isActive: boolean;
}

interface CookiePairFormData {
  pairNumber: string;
  spcStValue: string;
  spcScSessionValue: string;
  description: string;
  isActive: boolean;
}

interface CookiePair {
  id: string;
  spcSt?: SystemConfig;
  spcScSession?: SystemConfig;
}

interface ProxyValidationResult {
  valid: boolean;
  message: string;
  proxyInfo?: {
    ip: string;
    location: string;
  };
}

interface DbCleanupStatus {
  running: boolean;
  nextCleanup: string;
}

const cookiePairSchema = z.object({
  pairNumber: z.string()
    .min(1, "Pair number is required")
    .refine((val) => !isNaN(Number(val)) && Number(val) >= 1, {
      message: "Pair number must be a positive integer (≥ 1)"
    }),
  spcStValue: z.string()
    .min(1, "SPC_ST cookie value is required")
    .transform(val => val.trim())
    .refine((val) => val.length >= 10, {
      message: "SPC_ST cookie must be at least 10 characters"
    }),
  spcScSessionValue: z.string()
    .min(1, "SPC_SC_SESSION cookie value is required")
    .transform(val => val.trim())
    .refine((val) => val.length >= 10, {
      message: "SPC_SC_SESSION cookie must be at least 10 characters"
    }),
  description: z.string().optional(),
  isActive: z.boolean().default(true)
});

type CookiePairFormValues = z.infer<typeof cookiePairSchema>;

const CONFIG_TYPES = [
  { value: "shopee_cookie", label: "Shopee Cookies", icon: Key, description: "Cookie pairs for Shopee services" },
  { value: "proxy_key", label: "Proxy Keys", icon: Globe, description: "Rotating proxy API keys" },
  { value: "sim_service_v1_key", label: "Sim v1 API", icon: Smartphone, description: "365otp.com API keys for v1 service" },
  { value: "sim_service_key", label: "Sim v2 (TOTP)", icon: Smartphone, description: "TOTP service keys" },
  { value: "api_key", label: "Sim v3 API", icon: Smartphone, description: "ChayCodeso3 API keys for v3 service" },
  { value: "username_check_cookie", label: "Username Check", icon: Shield, description: "Username validation cookies" },
  { value: "database_cleanup", label: "Database Cleanup", icon: Database, description: "Automated maintenance" }
];

const PROXY_PROVIDERS = [
  { value: "fproxy", label: "FProxy" },
  { value: "wwproxy", label: "WWProxy" }
];

export default function SystemConfigPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreatePairDialogOpen, setIsCreatePairDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<SystemConfig | null>(null);
  const [activeSection, setActiveSection] = useState("shopee_cookie");
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [formData, setFormData] = useState<ConfigFormData>({
    configKey: "",
    configValue: "",
    configType: "proxy_key",
    description: "",
    isActive: true
  });
  const [pairFormData, setPairFormData] = useState<CookiePairFormData>({
    pairNumber: "1",
    spcStValue: "",
    spcScSessionValue: "",
    description: "",
    isActive: true
  });
  const [selectedProxyProvider, setSelectedProxyProvider] = useState("fproxy");
  const [proxyValidationResult, setProxyValidationResult] = useState<ProxyValidationResult | null>(null);
  const [revealedValues, setRevealedValues] = useState<Set<number>>(new Set());

  const { data: allConfigs = [], isLoading: isLoadingConfigs, isError: isErrorConfigs, error: configsError } = useQuery<SystemConfig[]>({
    queryKey: ["/api/system-config"],
    enabled: user?.role === 'superadmin'
  });

  const { data: dbCleanupStatusQuery, isLoading: isLoadingDbStatus, isError: isErrorDbStatus, refetch: refetchDbCleanupStatus } = useQuery<DbCleanupStatus>({
    queryKey: ["/api/database-cleanup/status"],
    enabled: user?.role === 'superadmin'
  });

  if (!user || user.role !== 'superadmin') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <FixedHeader />
        <main className="pt-16">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <Card>
              <CardContent className="p-8 text-center">
                <Shield className="h-16 w-16 mx-auto text-red-500 mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Không có quyền truy cập
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Bạn không có quyền truy cập trang cấu hình hệ thống. Chỉ Super Admin mới có thể truy cập trang này.
                </p>
                <Button onClick={() => window.history.back()} data-testid="button-go-back">
                  Quay lại
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  const getConfigsByType = (type: string): SystemConfig[] => {
    return allConfigs.filter((config) => config.configType === type);
  };

  const groupShopeeCookiesIntoPairs = useMemo((): CookiePair[] => {
    const configs = allConfigs.filter((config) => config.configType === 'shopee_cookie');
    const pairs: Map<string, CookiePair> = new Map();

    configs.forEach((config) => {
      if (config.configKey.includes('x-api-key')) {
        return;
      }

      const match = config.configKey.match(/[_-](\d+)$/);
      const pairId = match ? match[1] : `unpaired-${config.id}`;

      if (!pairs.has(pairId)) {
        pairs.set(pairId, { id: pairId });
      }

      const pair = pairs.get(pairId)!;
      
      if (config.configKey.includes('SPC_ST')) {
        pair.spcSt = config;
      } else if (config.configKey.includes('SPC_SC_SESSION')) {
        pair.spcScSession = config;
      }
    });

    return Array.from(pairs.values()).sort((a, b) => {
      const aIsUnpaired = a.id.startsWith('unpaired-');
      const bIsUnpaired = b.id.startsWith('unpaired-');
      
      if (aIsUnpaired && !bIsUnpaired) return 1;
      if (!aIsUnpaired && bIsUnpaired) return -1;
      if (aIsUnpaired && bIsUnpaired) return a.id.localeCompare(b.id);
      
      return parseInt(a.id) - parseInt(b.id);
    });
  }, [allConfigs]);

  const createConfigMutation = useMutation({
    mutationFn: (configData: ConfigFormData) => apiRequest({
      url: "/api/system-config",
      method: "POST",
      body: configData
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-config"] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: "Thành công",
        description: "Tạo cấu hình hệ thống thành công"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể tạo cấu hình",
        variant: "destructive"
      });
    }
  });

  const updateConfigMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ConfigFormData> }) => apiRequest({
      url: `/api/system-config/${id}`,
      method: "PUT",
      body: data
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-config"] });
      setIsEditDialogOpen(false);
      setSelectedConfig(null);
      toast({
        title: "Thành công",
        description: "Cập nhật cấu hình thành công"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể cập nhật cấu hình",
        variant: "destructive"
      });
    }
  });

  const deleteConfigMutation = useMutation({
    mutationFn: (configId: number) => apiRequest({
      url: `/api/system-config/${configId}`,
      method: "DELETE"
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-config"] });
      toast({
        title: "Thành công",
        description: "Xóa cấu hình thành công"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể xóa cấu hình",
        variant: "destructive"
      });
    }
  });

  const validateProxyMutation = useMutation<ProxyValidationResult, Error, { apiKey: string; provider: string }>({
    mutationFn: ({ apiKey, provider }) => apiRequest({
      url: "/api/system-config/validate-proxy",
      method: "POST",
      body: { apiKey, provider }
    }),
    onSuccess: (data) => {
      setProxyValidationResult(data);
      if (data.valid) {
        toast({
          title: "Thành công",
          description: `Key proxy hợp lệ - IP: ${data.proxyInfo?.ip}, Vị trí: ${data.proxyInfo?.location}`
        });
      } else {
        toast({
          title: "Lỗi",
          description: data.message,
          variant: "destructive"
        });
      }
    },
    onError: (error) => {
      setProxyValidationResult({ valid: false, message: error.message || "Không thể kiểm tra key proxy" });
      toast({
        title: "Lỗi",
        description: error.message || "Không thể kiểm tra key proxy",
        variant: "destructive"
      });
    }
  });

  const manualDbCleanupMutation = useMutation({
    mutationFn: () => apiRequest({
      url: "/api/database-cleanup/manual",
      method: "POST"
    }),
    onSuccess: () => {
      toast({
        title: "Thành công",
        description: "Dọn dẹp database thủ công hoàn thành"
      });
      refetchDbCleanupStatus();
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể thực hiện dọn dẹp database",
        variant: "destructive"
      });
    }
  });

  const autoFetchCookiePairsMutation = useMutation({
    mutationFn: () => apiRequest({
      url: "/api/cookie-pairs/auto-fetch",
      method: "POST"
    }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-config"] });
      toast({
        title: "Auto-fetch hoàn tất",
        description: `Thành công: ${data.success}, Thất bại: ${data.failed}, Bỏ qua: ${data.skipped}`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể auto-fetch cookie pairs",
        variant: "destructive"
      });
    }
  });

  const createCookiePairMutation = useMutation({
    mutationFn: async (pairData: CookiePairFormData) => {
      const spcStKey = `SPC_ST_check_${pairData.pairNumber}`;
      const spcScSessionKey = `SPC_SC_SESSION_check_${pairData.pairNumber}`;

      const existingConfigs = allConfigs as SystemConfig[];
      const spcStExists = existingConfigs.some(c => c.configKey === spcStKey && c.configType === 'shopee_cookie');
      const spcScSessionExists = existingConfigs.some(c => c.configKey === spcScSessionKey && c.configType === 'shopee_cookie');

      if (spcStExists || spcScSessionExists) {
        const conflictMsg = spcStExists && spcScSessionExists 
          ? `Cặp cookie số ${pairData.pairNumber} đã tồn tại hoàn chỉnh`
          : spcStExists 
          ? `Cookie SPC_ST cho cặp ${pairData.pairNumber} đã tồn tại`
          : `Cookie SPC_SC_SESSION cho cặp ${pairData.pairNumber} đã tồn tại`;
        throw new Error(conflictMsg);
      }

      const spcStConfig = {
        configKey: spcStKey,
        configValue: pairData.spcStValue,
        configType: 'shopee_cookie',
        description: `${pairData.description || `Cookie SPC_ST - Cặp ${pairData.pairNumber}`}`,
        isActive: pairData.isActive
      };

      const spcScSessionConfig = {
        configKey: spcScSessionKey,
        configValue: pairData.spcScSessionValue,
        configType: 'shopee_cookie',
        description: `${pairData.description || `Cookie SPC_SC_SESSION - Cặp ${pairData.pairNumber}`}`,
        isActive: pairData.isActive
      };

      let spcStCreatedId: number | null = null;

      try {
        const spcStResult = await apiRequest({
          url: "/api/system-config",
          method: "POST",
          body: spcStConfig
        }) as SystemConfig;
        
        spcStCreatedId = spcStResult.id;

        await apiRequest({
          url: "/api/system-config",
          method: "POST",
          body: spcScSessionConfig
        });

        return { success: true };
      } catch (error) {
        if (spcStCreatedId !== null) {
          try {
            await apiRequest({
              url: `/api/system-config/${spcStCreatedId}`,
              method: "DELETE"
            });
            console.log(`[ROLLBACK] Deleted SPC_ST cookie config (ID: ${spcStCreatedId}) after SPC_SC_SESSION creation failed`);
          } catch (rollbackError) {
            console.error(`[ROLLBACK FAILED] Could not delete SPC_ST cookie config (ID: ${spcStCreatedId}):`, rollbackError);
          }
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-config"] });
      setIsCreatePairDialogOpen(false);
      resetPairForm();
      toast({
        title: "Thành công",
        description: "Tạo cặp cookie Shopee thành công"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể tạo cặp cookie",
        variant: "destructive"
      });
    }
  });

  const resetForm = () => {
    setFormData({
      configKey: "",
      configValue: "",
      configType: "proxy_key",
      description: "",
      isActive: true
    });
    setSelectedProxyProvider("fproxy");
    setProxyValidationResult(null);
  };

  const resetPairForm = () => {
    const existingPairs = groupShopeeCookiesIntoPairs;
    const existingNumbers = existingPairs
      .filter(p => !p.id.startsWith('unpaired-'))
      .map(p => parseInt(p.id));
    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
    
    cookiePairForm.reset({
      pairNumber: nextNumber.toString(),
      spcStValue: "",
      spcScSessionValue: "",
      description: "",
      isActive: true
    });
    
    setPairFormData({
      pairNumber: nextNumber.toString(),
      spcStValue: "",
      spcScSessionValue: "",
      description: "",
      isActive: true
    });
  };

  const handleConfigTypeChange = (newType: string) => {
    const newFormData = {
      ...formData,
      configType: newType
    };

    if (newType === 'sim_service_key') {
      newFormData.configKey = 'api_keytotp_1';
      newFormData.description = 'TOTP key cho dịch vụ thuê sim v2';
    } else if (newType === 'sim_service_v1_key') {
      newFormData.configKey = 'api_keyfirefox_1';
      newFormData.description = 'Firefox key cho dịch vụ thuê sim v1';
    } else if (newType === 'api_key') {
      newFormData.configKey = 'api_keychaycodes3_1';
      newFormData.description = 'ChayCodeso3 key cho thuê sim v3';
    } else if (newType === 'shopee_cookie') {
      newFormData.configKey = 'SPC_ST_check_1';
      newFormData.description = 'Cookie dịch vụ Shopee - Cặp 1';
    } else if (newType === 'proxy_key') {
      newFormData.configKey = `${selectedProxyProvider}_key`;
      newFormData.description = 'Key proxy xoay';
    } else {
      newFormData.configKey = '';
    }

    setFormData(newFormData);
    setProxyValidationResult(null);
  };

  const handleValidateProxy = () => {
    if (!formData.configValue.trim()) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập key proxy",
        variant: "destructive"
      });
      return;
    }
    validateProxyMutation.mutate({ apiKey: formData.configValue, provider: selectedProxyProvider });
  };

  const handleCreateConfig = () => {
    if (formData.configType === 'proxy_key') {
      if (!proxyValidationResult || !proxyValidationResult.valid) {
        toast({
          title: "Lỗi",
          description: "Vui lòng kiểm tra key proxy trước khi lưu",
          variant: "destructive"
        });
        return;
      }
      const configKeyWithProvider = selectedProxyProvider === 'fproxy' ? 'fproxy_key' : 'wwproxy_key';
      const finalFormData = { ...formData, configKey: configKeyWithProvider };
      createConfigMutation.mutate(finalFormData);
    } else if (formData.configType === 'sim_service_key') {
      const finalFormData = { ...formData, configKey: formData.configKey || 'api_keytotp_1' };
      createConfigMutation.mutate(finalFormData);
    } else if (formData.configType === 'sim_service_v1_key') {
      const finalFormData = { ...formData, configKey: formData.configKey || '365otp_key_1' };
      createConfigMutation.mutate(finalFormData);
    } else if (formData.configType === 'api_key') {
      const finalFormData = { ...formData, configKey: formData.configKey || 'api_keychaycodes3_1' };
      createConfigMutation.mutate(finalFormData);
    } else {
      createConfigMutation.mutate(formData);
    }
  };

  const handleEditConfig = (config: SystemConfig) => {
    setSelectedConfig(config);
    setFormData({
      configKey: config.configKey,
      configValue: config.configValue,
      configType: config.configType,
      description: config.description || "",
      isActive: config.isActive
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateConfig = () => {
    if (!selectedConfig) return;
    updateConfigMutation.mutate({ id: selectedConfig.id, data: formData });
  };

  const handleDeleteConfig = (configId: number) => {
    if (confirm("Bạn có chắc chắn muốn xóa cấu hình này?")) {
      deleteConfigMutation.mutate(configId);
    }
  };

  const maskValue = (value: string, type: string) => {
    if (type.includes('key') || type.includes('api') || type.includes('cookie')) {
      return value.length > 8 ? `${value.substring(0, 4)}****${value.substring(value.length - 4)}` : '****';
    }
    return value;
  };

  const toggleValueVisibility = (configId: number) => {
    setRevealedValues(prev => {
      const newSet = new Set(prev);
      if (newSet.has(configId)) {
        newSet.delete(configId);
      } else {
        newSet.add(configId);
      }
      return newSet;
    });
  };

  // Navigation Component
  const NavigationList = () => (
    <nav className="space-y-1">
      {CONFIG_TYPES.map((type) => {
        const Icon = type.icon;
        const isActive = activeSection === type.value;
        const count = type.value === "shopee_cookie" 
          ? groupShopeeCookiesIntoPairs.filter(p => p.spcSt && p.spcScSession).length
          : type.value === "database_cleanup" 
          ? null 
          : getConfigsByType(type.value).length;
        
        return (
          <button
            key={type.value}
            onClick={() => {
              setActiveSection(type.value);
              setIsNavOpen(false);
            }}
            data-testid={`nav-${type.value}`}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
              isActive 
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-medium' 
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            style={{ minHeight: '44px' }}
          >
            <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{type.label}</div>
              {type.description && (
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{type.description}</div>
              )}
            </div>
            {count !== null && (
              <Badge variant="secondary" className="ml-auto flex-shrink-0">
                {count}
              </Badge>
            )}
          </button>
        );
      })}
    </nav>
  );

  // Shopee Cookie Pairs Section
  const renderShopeeCookiePairs = () => {
    if (isLoadingConfigs) {
      return (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <Skeleton className="h-12 w-64" />
            <Skeleton className="h-11 w-40" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-2">
                <CardHeader className="pb-3">
                  <Skeleton className="h-6 w-24 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <div className="flex gap-2">
                    <Skeleton className="h-11 flex-1" />
                    <Skeleton className="h-11 flex-1" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      );
    }

    if (isErrorConfigs) {
      return (
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Failed to load configurations</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {configsError?.message || "An error occurred while loading the configurations"}
            </p>
          </CardContent>
        </Card>
      );
    }

    const pairs = groupShopeeCookiesIntoPairs;
    const completePairs = pairs.filter(p => p.spcSt && p.spcScSession);
    const incompletePairs = pairs.filter(p => !p.spcSt || !p.spcScSession);

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Shopee Cookie Pairs</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {completePairs.length} complete pairs, {incompletePairs.length} incomplete
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button 
              onClick={() => autoFetchCookiePairsMutation.mutate()}
              disabled={autoFetchCookiePairsMutation.isPending}
              data-testid="button-auto-fetch-cookie-pairs"
              variant="outline"
              className="w-full sm:w-auto"
              style={{ minHeight: '44px' }}
            >
              {autoFetchCookiePairsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              Auto-fetch Cookie Pairs
            </Button>
            <Button 
              onClick={() => {
                resetPairForm();
                setIsCreatePairDialogOpen(true);
              }}
              data-testid="button-create-cookie-pair"
              className="w-full sm:w-auto"
              style={{ minHeight: '44px' }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Cookie Pair
            </Button>
          </div>
        </div>

        {completePairs.length === 0 && incompletePairs.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Key className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No cookie pairs</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Create your first Shopee cookie pair to get started
              </p>
              <Button onClick={() => {
                resetPairForm();
                setIsCreatePairDialogOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Cookie Pair
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Complete Pairs Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {completePairs.map((pair) => {
                const spcSt = pair.spcSt!;
                const spcScSession = pair.spcScSession!;
                const bothActive = spcSt.isActive && spcScSession.isActive;
                
                return (
                  <Card key={pair.id} className="border-2 hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <LinkIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          <CardTitle className="text-base">Pair #{pair.id}</CardTitle>
                        </div>
                        <Badge variant={bothActive ? "default" : "secondary"}>
                          {bothActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      {spcSt.description && (
                        <CardDescription className="text-xs mt-1">{spcSt.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* SPC_ST */}
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">SPC_ST</span>
                          <Badge variant={spcSt.isActive ? "default" : "secondary"} className="text-xs">
                            {spcSt.isActive ? "ON" : "OFF"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-xs font-mono bg-white dark:bg-gray-800 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 truncate">
                            {revealedValues.has(spcSt.id) ? spcSt.configValue : maskValue(spcSt.configValue, spcSt.configType)}
                          </code>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleValueVisibility(spcSt.id)}
                            data-testid={`button-toggle-visibility-${spcSt.id}`}
                            className="h-8 w-8 p-0"
                          >
                            {revealedValues.has(spcSt.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      {/* SPC_SC_SESSION */}
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">SPC_SC_SESSION</span>
                          <Badge variant={spcScSession.isActive ? "default" : "secondary"} className="text-xs">
                            {spcScSession.isActive ? "ON" : "OFF"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-xs font-mono bg-white dark:bg-gray-800 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 truncate">
                            {revealedValues.has(spcScSession.id) ? spcScSession.configValue : maskValue(spcScSession.configValue, spcScSession.configType)}
                          </code>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleValueVisibility(spcScSession.id)}
                            data-testid={`button-toggle-visibility-${spcScSession.id}`}
                            className="h-8 w-8 p-0"
                          >
                            {revealedValues.has(spcScSession.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditConfig(spcSt)}
                          data-testid={`button-edit-${spcSt.id}`}
                          className="flex-1"
                          style={{ minHeight: '44px' }}
                          disabled={updateConfigMutation.isPending}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit SPC_ST
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditConfig(spcScSession)}
                          data-testid={`button-edit-${spcScSession.id}`}
                          className="flex-1"
                          style={{ minHeight: '44px' }}
                          disabled={updateConfigMutation.isPending}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit SESSION
                        </Button>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteConfig(spcSt.id)}
                          data-testid={`button-delete-${spcSt.id}`}
                          className="flex-1"
                          style={{ minHeight: '44px' }}
                          disabled={deleteConfigMutation.isPending}
                        >
                          {deleteConfigMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                          )}
                          Delete SPC_ST
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteConfig(spcScSession.id)}
                          data-testid={`button-delete-${spcScSession.id}`}
                          className="flex-1"
                          style={{ minHeight: '44px' }}
                          disabled={deleteConfigMutation.isPending}
                        >
                          {deleteConfigMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                          )}
                          Delete SESSION
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Incomplete Pairs */}
            {incompletePairs.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Incomplete Pairs ({incompletePairs.length})
                </h3>
                <div className="space-y-2">
                  {incompletePairs.map((pair) => {
                    const config = pair.spcSt || pair.spcScSession;
                    if (!config) return null;
                    
                    return (
                      <Card key={pair.id} className="border-amber-200 dark:border-amber-900">
                        <CardContent className="p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium font-mono">{config.configKey}</span>
                                <Badge variant={config.isActive ? "default" : "secondary"} className="text-xs">
                                  {config.isActive ? "ON" : "OFF"}
                                </Badge>
                              </div>
                              <code className="text-xs font-mono text-gray-600 dark:text-gray-400 block truncate">
                                {maskValue(config.configValue, config.configType)}
                              </code>
                              {config.description && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{config.description}</p>
                              )}
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditConfig(config)}
                                data-testid={`button-edit-${config.id}`}
                                style={{ minHeight: '44px' }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteConfig(config.id)}
                                data-testid={`button-delete-${config.id}`}
                                style={{ minHeight: '44px' }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // Proxy Keys Section
  const renderProxyKeys = () => {
    const proxyConfigs = getConfigsByType('proxy_key');
    const grouped = proxyConfigs.reduce((acc, config) => {
      const provider = config.configKey.includes('fproxy') ? 'FProxy' : 'WWProxy';
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(config);
      return acc;
    }, {} as Record<string, SystemConfig[]>);

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Proxy Keys</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {proxyConfigs.length} rotating proxy keys
            </p>
          </div>
          <Button 
            onClick={() => {
              setFormData({
                configKey: "",
                configValue: "",
                configType: "proxy_key",
                description: "",
                isActive: true
              });
              setProxyValidationResult(null);
              setIsCreateDialogOpen(true);
            }}
            data-testid="button-add-proxy-key"
            className="w-full sm:w-auto"
            style={{ minHeight: '44px' }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Proxy Key
          </Button>
        </div>

        {proxyConfigs.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Globe className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No proxy keys</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Add your first proxy key to get started
              </p>
              <Button onClick={() => {
                setFormData({
                  configKey: "",
                  configValue: "",
                  configType: "proxy_key",
                  description: "",
                  isActive: true
                });
                setIsCreateDialogOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Proxy Key
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([provider, configs]) => (
              <Card key={provider}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <CardTitle className="text-base">{provider}</CardTitle>
                    <Badge variant="secondary">{configs.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {configs.map((config) => (
                    <div key={config.id} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium font-mono">{config.configKey}</span>
                            <Badge variant={config.isActive ? "default" : "secondary"}>
                              {config.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-xs font-mono bg-white dark:bg-gray-800 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 truncate">
                              {revealedValues.has(config.id) ? config.configValue : maskValue(config.configValue, config.configType)}
                            </code>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleValueVisibility(config.id)}
                              data-testid={`button-toggle-visibility-${config.id}`}
                              className="h-9 w-9 p-0 flex-shrink-0"
                            >
                              {revealedValues.has(config.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                          {config.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{config.description}</p>
                          )}
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Updated: {new Date(config.updatedAt).toLocaleDateString('vi-VN')}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const provider = config.configKey.includes('fproxy') ? 'fproxy' : 'wwproxy';
                            setSelectedProxyProvider(provider);
                            validateProxyMutation.mutate({ apiKey: config.configValue, provider });
                          }}
                          disabled={validateProxyMutation.isPending}
                          data-testid={`button-validate-${config.id}`}
                          className="flex-1"
                          style={{ minHeight: '44px' }}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          {validateProxyMutation.isPending ? "Validating..." : "Validate"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteConfig(config.id)}
                          data-testid={`button-delete-${config.id}`}
                          style={{ minHeight: '44px' }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Generic Service Keys Section
  const renderServiceKeys = (type: string, title: string, icon: any) => {
    const configs = getConfigsByType(type);
    const Icon = icon;

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {configs.length} keys configured
            </p>
          </div>
          <Button 
            onClick={() => {
              handleConfigTypeChange(type);
              setIsCreateDialogOpen(true);
            }}
            data-testid={`button-add-${type}`}
            className="w-full sm:w-auto"
            style={{ minHeight: '44px' }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Key
          </Button>
        </div>

        {configs.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Icon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No keys configured</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Add your first key to get started
              </p>
              <Button onClick={() => {
                handleConfigTypeChange(type);
                setIsCreateDialogOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Key
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {configs.map((config) => (
              <Card key={config.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                          <span className="text-sm font-medium font-mono truncate">{config.configKey}</span>
                          <Badge variant={config.isActive ? "default" : "secondary"} className="flex-shrink-0">
                            {config.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-xs font-mono bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 truncate">
                            {revealedValues.has(config.id) ? config.configValue : maskValue(config.configValue, config.configType)}
                          </code>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleValueVisibility(config.id)}
                            data-testid={`button-toggle-visibility-${config.id}`}
                            className="h-9 w-9 p-0 flex-shrink-0"
                          >
                            {revealedValues.has(config.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                        {config.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{config.description}</p>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          Updated: {new Date(config.updatedAt).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditConfig(config)}
                        data-testid={`button-edit-${config.id}`}
                        className="flex-1"
                        style={{ minHeight: '44px' }}
                        disabled={updateConfigMutation.isPending}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteConfig(config.id)}
                        data-testid={`button-delete-${config.id}`}
                        style={{ minHeight: '44px' }}
                        disabled={deleteConfigMutation.isPending}
                      >
                        {deleteConfigMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Database Cleanup Section
  const renderDatabaseCleanup = () => {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Database Maintenance</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Automated cleanup and maintenance tasks
          </p>
        </div>

        <Card className="border-2">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg">
                  <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle>Cleanup Service</CardTitle>
                  <CardDescription className="mt-1">
                    Runs automatically every day at 2:00 AM
                  </CardDescription>
                </div>
              </div>
              <Button
                onClick={() => manualDbCleanupMutation.mutate()}
                disabled={manualDbCleanupMutation.isPending}
                data-testid="button-manual-cleanup"
                className="w-full sm:w-auto"
                style={{ minHeight: '44px' }}
              >
                {manualDbCleanupMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 mr-2" />
                    Run Cleanup Now
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Status Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Service Status</div>
                {isLoadingDbStatus ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${dbCleanupStatusQuery?.running ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {dbCleanupStatusQuery?.running ? 'Active' : 'Standby'}
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Next Cleanup</div>
                {isLoadingDbStatus ? (
                  <Skeleton className="h-5 w-32" />
                ) : (
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    {dbCleanupStatusQuery?.nextCleanup || 'Pending...'}
                  </div>
                )}
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Schedule</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  Daily 2:00 AM
                </div>
              </div>
            </div>

            {/* Tasks and Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Automated Tasks
                </h3>
                <ul className="space-y-2">
                  {[
                    'Delete audit logs older than 30 days',
                    'Delete transaction history older than 30 days',
                    'Delete service usage logs older than 30 days',
                    'Runs automatically every day at 2:00 AM'
                  ].map((task, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{task}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Important Notes
                </h3>
                <ul className="space-y-2">
                  {[
                    'Deleted data cannot be recovered',
                    'Only data older than 30 days is removed',
                    'Service starts automatically with system',
                    'Manual cleanup can be run anytime'
                  ].map((note, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Form Content Component (shared between Dialog and Drawer)
  const ConfigFormContent = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="configType">Configuration Type</Label>
        <Select value={formData.configType} onValueChange={handleConfigTypeChange}>
          <SelectTrigger data-testid="select-config-type">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {CONFIG_TYPES.filter(t => t.value !== 'database_cleanup').map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {formData.configType === 'proxy_key' && (
        <div className="space-y-2">
          <Label htmlFor="proxyProvider">Proxy Provider</Label>
          <Select value={selectedProxyProvider} onValueChange={(value) => {
            setSelectedProxyProvider(value);
            setProxyValidationResult(null);
          }}>
            <SelectTrigger data-testid="select-proxy-provider">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              {PROXY_PROVIDERS.map((provider) => (
                <SelectItem key={provider.value} value={provider.value}>
                  {provider.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {formData.configType === 'shopee_cookie' && (
        <div className="space-y-3">
          <Label htmlFor="cookieType">Cookie Type</Label>
          <Select value={formData.configKey.includes('SPC_ST') ? 'SPC_ST' : 'SPC_SC_SESSION'} onValueChange={(value) => {
            if (value === 'SPC_ST') {
              setFormData({...formData, configKey: 'SPC_ST_check_1', description: 'Cookie SPC_ST - Cặp 1'});
            } else {
              setFormData({...formData, configKey: 'SPC_SC_SESSION_check_1', description: 'Cookie SPC_SC_SESSION - Cặp 1'});
            }
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SPC_ST">SPC_ST Cookie</SelectItem>
              <SelectItem value="SPC_SC_SESSION">SPC_SC_SESSION Cookie</SelectItem>
            </SelectContent>
          </Select>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              <strong>Note:</strong> A complete cookie pair requires both SPC_ST and SPC_SC_SESSION with the same number
            </p>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="configKey">Key Name</Label>
        <Input
          id="configKey"
          data-testid="input-config-key"
          value={formData.configKey}
          onChange={(e) => setFormData({...formData, configKey: e.target.value})}
          placeholder="Enter key name"
          disabled={formData.configType === 'proxy_key'}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="configValue">Value</Label>
        <div className="flex gap-2">
          <Input
            id="configValue"
            type="password"
            data-testid="input-config-value"
            value={formData.configValue}
            onChange={(e) => setFormData({...formData, configValue: e.target.value})}
            placeholder="Enter value"
            className="flex-1"
          />
          {formData.configType === 'proxy_key' && (
            <Button
              type="button"
              variant="outline"
              onClick={handleValidateProxy}
              disabled={validateProxyMutation.isPending || !formData.configValue.trim()}
              data-testid="button-validate-proxy"
              style={{ minHeight: '44px' }}
            >
              {validateProxyMutation.isPending ? "Checking..." : "Validate"}
            </Button>
          )}
        </div>
        {proxyValidationResult && formData.configType === 'proxy_key' && (
          <div className={`text-sm p-2 rounded ${proxyValidationResult.valid ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800' : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'}`}>
            {proxyValidationResult.message}
            {proxyValidationResult.valid && proxyValidationResult.proxyInfo && (
              <div className="mt-1 text-xs">
                IP: {proxyValidationResult.proxyInfo.ip} | Location: {proxyValidationResult.proxyInfo.location}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          data-testid="input-description"
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="Enter description"
        />
      </div>
      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="space-y-0.5">
          <Label htmlFor="isActive" className="text-sm font-medium">Active Status</Label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Enable this configuration immediately
          </p>
        </div>
        <Switch
          id="isActive"
          data-testid="switch-is-active"
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData({...formData, isActive: checked})}
        />
      </div>
    </div>
  );

  const cookiePairForm = useForm<CookiePairFormValues>({
    resolver: zodResolver(cookiePairSchema),
    defaultValues: {
      pairNumber: "1",
      spcStValue: "",
      spcScSessionValue: "",
      description: "",
      isActive: true
    }
  });

  const handleCreateCookiePair = (values: CookiePairFormValues) => {
    createCookiePairMutation.mutate({
      pairNumber: values.pairNumber,
      spcStValue: values.spcStValue,
      spcScSessionValue: values.spcScSessionValue,
      description: values.description || "",
      isActive: values.isActive
    });
  };

  // Cookie Pair Form Content
  const CookiePairFormContent = () => (
    <Form {...cookiePairForm}>
      <form onSubmit={cookiePairForm.handleSubmit(handleCreateCookiePair)} className="space-y-5 py-2" id="cookie-pair-form">
        <FormField
          control={cookiePairForm.control}
          name="pairNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Pair Number <span className="text-red-500">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="number"
                  min="1"
                  data-testid="input-pair-number"
                  placeholder="Enter pair number"
                  className="h-10"
                />
              </FormControl>
              <FormDescription>
                Unique number to identify this cookie pair
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <LinkIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Complete Cookie Pair
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                This will create: SPC_ST_check_{cookiePairForm.watch("pairNumber")} + SPC_SC_SESSION_check_{cookiePairForm.watch("pairNumber")}
              </p>
            </div>
          </div>
        </div>

        <FormField
          control={cookiePairForm.control}
          name="spcStValue"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                SPC_ST Cookie Value <span className="text-red-500">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  data-testid="input-spc-st-value"
                  placeholder="Enter SPC_ST cookie value (min 10 chars)"
                  className="h-10 font-mono text-sm"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={cookiePairForm.control}
          name="spcScSessionValue"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                SPC_SC_SESSION Cookie Value <span className="text-red-500">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  data-testid="input-spc-sc-session-value"
                  placeholder="Enter SPC_SC_SESSION cookie value (min 10 chars)"
                  className="h-10 font-mono text-sm"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={cookiePairForm.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  data-testid="input-pair-description"
                  placeholder="Add a description for this pair"
                  className="h-10"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={cookiePairForm.control}
          name="isActive"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="space-y-0.5">
                  <FormLabel>Active Status</FormLabel>
                  <FormDescription>
                    Enable this cookie pair immediately
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-pair-is-active"
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );

  const EditFormContent = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="edit-configType">Type</Label>
        <Select value={formData.configType} onValueChange={(value) => setFormData({...formData, configType: value})}>
          <SelectTrigger data-testid="select-edit-config-type">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {CONFIG_TYPES.filter(t => t.value !== 'database_cleanup').map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-configKey">Key</Label>
        <Input
          id="edit-configKey"
          data-testid="input-edit-config-key"
          value={formData.configKey}
          onChange={(e) => setFormData({...formData, configKey: e.target.value})}
          placeholder="Enter key"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-configValue">Value</Label>
        <Input
          id="edit-configValue"
          type="password"
          data-testid="input-edit-config-value"
          value={formData.configValue}
          onChange={(e) => setFormData({...formData, configValue: e.target.value})}
          placeholder="Enter value"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-description">Description</Label>
        <Input
          id="edit-description"
          data-testid="input-edit-description"
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="Enter description"
        />
      </div>
      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="space-y-0.5">
          <Label htmlFor="edit-isActive" className="text-sm font-medium">Active Status</Label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Toggle configuration status
          </p>
        </div>
        <Switch
          id="edit-isActive"
          data-testid="switch-edit-is-active"
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData({...formData, isActive: checked})}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <FixedHeader />
      
      {/* Mobile Header with Navigation Trigger */}
      <div className="lg:hidden fixed top-16 left-0 right-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-30">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <h1 className="text-base font-semibold text-gray-900 dark:text-white">System Config</h1>
          </div>
          <Sheet open={isNavOpen} onOpenChange={setIsNavOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-open-nav" style={{ minHeight: '44px' }}>
                <Menu className="h-4 w-4 mr-2" />
                Sections
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh]">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <div className="mt-6">
                <NavigationList />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="pt-16 lg:pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-12 lg:gap-8">
            {/* Desktop Sidebar Navigation */}
            <aside className="hidden lg:block lg:col-span-3 sticky top-20 self-start">
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                    Configuration
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Manage system settings
                  </p>
                </div>
                <Separator className="mb-4" />
                <NavigationList />
              </div>

              {/* Stats Summary */}
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-sm">Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Total Configs</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{(allConfigs as SystemConfig[]).length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Active</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      {(allConfigs as SystemConfig[]).filter((c: SystemConfig) => c.isActive).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Cookie Pairs</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {groupShopeeCookiesIntoPairs.filter((p: CookiePair) => p.spcSt && p.spcScSession).length}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </aside>

            {/* Main Content */}
            <main className="lg:col-span-9 pt-20 lg:pt-6 pb-8">
              {isLoadingConfigs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                </div>
              ) : (
                <>
                  {activeSection === "shopee_cookie" && renderShopeeCookiePairs()}
                  {activeSection === "proxy_key" && renderProxyKeys()}
                  {activeSection === "sim_service_key" && renderServiceKeys("sim_service_key", "Sim v2 (TOTP) Keys", Smartphone)}
                  {activeSection === "sim_service_v1_key" && renderServiceKeys("sim_service_v1_key", "Sim v1 (Firefox) Keys", Smartphone)}
                  {activeSection === "api_key" && renderServiceKeys("api_key", "Sim v3 API Keys", Smartphone)}
                  {activeSection === "username_check_cookie" && renderServiceKeys("username_check_cookie", "Username Check Cookies", Shield)}
                  {activeSection === "database_cleanup" && renderDatabaseCleanup()}
                </>
              )}
            </main>
          </div>
        </div>
      </div>

      {/* Create Config Dialog/Drawer */}
      {isMobile ? (
        <Drawer open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Create Configuration</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-4 overflow-y-auto max-h-[60vh]">
              <ConfigFormContent />
            </div>
            <DrawerFooter>
              <Button 
                onClick={handleCreateConfig} 
                disabled={createConfigMutation.isPending} 
                data-testid="button-submit-create-config"
                style={{ minHeight: '44px' }}
              >
                {createConfigMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create"
                )}
              </Button>
              <DrawerClose asChild>
                <Button variant="outline" data-testid="button-cancel-create-config" style={{ minHeight: '44px' }}>Cancel</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Configuration</DialogTitle>
            </DialogHeader>
            <ConfigFormContent />
            <div className="flex gap-2 pt-2">
              <Button 
                onClick={handleCreateConfig} 
                disabled={createConfigMutation.isPending} 
                className="flex-1"
                data-testid="button-submit-create-config"
                style={{ minHeight: '44px' }}
              >
                {createConfigMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create"
                )}
              </Button>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} data-testid="button-cancel-create-config" style={{ minHeight: '44px' }}>
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Cookie Pair Dialog/Drawer */}
      {isMobile ? (
        <Drawer open={isCreatePairDialogOpen} onOpenChange={setIsCreatePairDialogOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Add Shopee Cookie Pair</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-4 overflow-y-auto max-h-[60vh]">
              <CookiePairFormContent />
            </div>
            <DrawerFooter>
              <Button 
                type="submit"
                form="cookie-pair-form"
                disabled={createCookiePairMutation.isPending} 
                data-testid="button-submit-create-cookie-pair"
                style={{ minHeight: '44px' }}
              >
                {createCookiePairMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Cookie Pair
                  </>
                )}
              </Button>
              <DrawerClose asChild>
                <Button 
                  variant="outline" 
                  disabled={createCookiePairMutation.isPending}
                  data-testid="button-cancel-create-cookie-pair"
                  style={{ minHeight: '44px' }}
                >
                  Cancel
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={isCreatePairDialogOpen} onOpenChange={setIsCreatePairDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">Add Shopee Cookie Pair</DialogTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Add both SPC_ST and SPC_SC_SESSION cookies together to create a complete cookie pair
              </p>
            </DialogHeader>
            <CookiePairFormContent />
            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button 
                type="submit"
                form="cookie-pair-form"
                disabled={createCookiePairMutation.isPending} 
                className="flex-1 h-10 bg-blue-600 hover:bg-blue-700"
                data-testid="button-submit-create-cookie-pair"
                style={{ minHeight: '44px' }}
              >
                {createCookiePairMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Cookie Pair
                  </>
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setIsCreatePairDialogOpen(false)}
                disabled={createCookiePairMutation.isPending}
                className="h-10"
                data-testid="button-cancel-create-cookie-pair"
                style={{ minHeight: '44px' }}
              >
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Config Dialog/Drawer */}
      {isMobile ? (
        <Drawer open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Edit Configuration</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-4 overflow-y-auto max-h-[60vh]">
              <EditFormContent />
            </div>
            <DrawerFooter>
              <Button 
                onClick={handleUpdateConfig} 
                disabled={updateConfigMutation.isPending}
                data-testid="button-submit-edit-config"
                style={{ minHeight: '44px' }}
              >
                {updateConfigMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update"
                )}
              </Button>
              <DrawerClose asChild>
                <Button variant="outline" data-testid="button-cancel-edit-config" style={{ minHeight: '44px' }}>Cancel</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Configuration</DialogTitle>
            </DialogHeader>
            <EditFormContent />
            <div className="flex gap-2 pt-2">
              <Button 
                onClick={handleUpdateConfig} 
                disabled={updateConfigMutation.isPending} 
                className="flex-1"
                data-testid="button-submit-edit-config"
                style={{ minHeight: '44px' }}
              >
                {updateConfigMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update"
                )}
              </Button>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} data-testid="button-cancel-edit-config" style={{ minHeight: '44px' }}>
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
