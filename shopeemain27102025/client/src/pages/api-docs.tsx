import { FixedHeader } from "@/components/fixed-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useState } from "react";
import { Copy, Code, Book, Key, Server, Globe, Phone, Shield, Mail, Eye, Download, Truck, Gift, CreditCard, User, Search, Play, AlertTriangle, Lock, EyeOff, ChevronDown, ChevronUp, Network } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ApiEndpoint {
  method: string;
  path: string;
  permission?: string;
  cost: string;
  serviceName: string;
  description: string;
  requestExample?: string;
  queryParams?: string;
  responseExample: string;
  supportsApiKey?: boolean;  // Thêm field để đánh dấu hỗ trợ API key
  alternativeExamples?: Array<{
    title: string;
    example: string;
  }>;
}

export default function ApiDocs() {
  const { toast } = useToast();
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('relative');
  const [requestBody, setRequestBody] = useState('');
  const [queryParams, setQueryParams] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedCodeSamples, setExpandedCodeSamples] = useState<Set<string>>(new Set());

  const toggleCodeSample = (endpointKey: string) => {
    setExpandedCodeSamples(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(endpointKey)) {
        newExpanded.delete(endpointKey);
      } else {
        newExpanded.add(endpointKey);
      }
      return newExpanded;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Đã sao chép",
      description: "Mã code đã được sao chép vào clipboard",
    });
  };

  const generateCodeSample = (endpoint: ApiEndpoint) => {
    const baseUrlMap = {
      production: 'https://otistx.com',
      localhost: 'http://localhost:5000',
      relative: '' // same origin
    };
    
    let url = baseUrl === 'relative' ? endpoint.path : baseUrlMap[baseUrl as keyof typeof baseUrlMap] + endpoint.path;
    
    // Handle path parameters: replace {sessionId} with actual example value
    if (url.includes('{sessionId}')) {
      url = url.replace('{sessionId}', 'YOUR_SESSION_ID_HERE');
    }
    
    if (endpoint.method === 'GET') {
      // Use queryParams if provided, otherwise use default
      const queryString = (endpoint as ApiEndpoint).queryParams || 'sessionId=your_session_id';
      return `// JavaScript/Node.js example
const response = await fetch('${url}?${queryString}', {
  method: 'GET',
  headers: {
    'X-API-Key': 'your_api_key_here'
  }
});

const data = await response.json();
console.log(data);`;
    } else {
      return `// JavaScript/Node.js example
const response = await fetch('${url}', {
  method: '${endpoint.method}',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your_api_key_here'
  },
  body: JSON.stringify(${endpoint.requestExample || '{}'})
});

const data = await response.json();
console.log(data);`;
    }
  };

  const validateJson = (jsonString: string): boolean => {
    if (!jsonString.trim()) return true; // Empty is valid
    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  };

  const testEndpoint = async () => {
    if (!selectedEndpoint || !apiKey) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn endpoint và nhập API key",
        variant: "destructive"
      });
      return;
    }

    // Validate JSON for non-GET requests
    if (selectedEndpoint.method !== 'GET' && requestBody && !validateJson(requestBody)) {
      toast({
        title: "JSON không hợp lệ",
        description: "Vui lòng kiểm tra format JSON trong request body",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    let controller: AbortController | null = null;
    let timeoutId: number | undefined;
    
    try {
      // Build URL based on selected base
      let url;
      switch (baseUrl) {
        case 'production':
          url = `https://otistx.com${selectedEndpoint.path}`;
          break;
        case 'localhost':
          url = `http://localhost:5000${selectedEndpoint.path}`;
          break;
        default: // relative
          url = selectedEndpoint.path;
          break;
      }
      
      // Add query parameters if provided
      if (queryParams.trim()) {
        const params = new URLSearchParams();
        // Handle key=value pairs, supporting values with = signs
        queryParams.split('&').forEach(param => {
          const equalIndex = param.indexOf('=');
          if (equalIndex > 0) {
            const key = param.substring(0, equalIndex).trim();
            const value = param.substring(equalIndex + 1).trim();
            if (key && value) {
              params.append(key, value);
            }
          }
        });
        url += '?' + params.toString();
      }

      const headers: Record<string, string> = {
        'X-API-Key': apiKey
      };
      
      // Only set Content-Type for non-GET requests with body
      if (selectedEndpoint.method !== 'GET' && requestBody.trim()) {
        headers['Content-Type'] = 'application/json';
      }

      controller = new AbortController();
      timeoutId = window.setTimeout(() => controller!.abort(), 30000); // 30s timeout

      const options: RequestInit = {
        method: selectedEndpoint.method,
        headers,
        signal: controller.signal
      };

      // Only add body for non-GET requests
      if (selectedEndpoint.method !== 'GET' && requestBody.trim()) {
        options.body = requestBody;
      }

      const res = await fetch(url, options);
      
      // Handle different response types
      let data;
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        data = await res.text();
      }
      
      setResponse(JSON.stringify({
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        data: data
      }, null, 2));

      const environmentName = baseUrl === 'production' ? 'production (otistx.com)' : baseUrl === 'localhost' ? 'development (localhost:5000)' : 'same-origin';
      
      toast({
        title: res.ok ? "Thành công" : "Có lỗi",
        description: `API trả về mã ${res.status} từ ${environmentName}`,
        variant: res.ok ? "default" : "destructive"
      });
    } catch (error) {
      const isTimeout = error instanceof DOMException && error.name === 'AbortError';
      const environmentName = baseUrl === 'production' ? 'production (otistx.com)' : baseUrl === 'localhost' ? 'development (localhost:5000)' : 'same-origin';
      const environmentNote = baseUrl === 'production' ? 'Kiểm tra kết nối đến otistx.com' : 
                              baseUrl === 'localhost' ? 'Đảm bảo server development đang chạy trên localhost:5000' :
                              'Kiểm tra API endpoint và xác thực';
      
      setResponse(JSON.stringify({
        error: isTimeout ? 'Request timeout (30s)' : (error instanceof Error ? error.message : 'Unknown error'),
        note: environmentNote
      }, null, 2));
      toast({
        title: isTimeout ? "Timeout" : "Lỗi kết nối",
        description: isTimeout ? "Request quá 30 giây" : `Không thể kết nối đến ${environmentName}`,
        variant: "destructive"
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  // Filtered endpoints for specific services only
  const endpointGroups = {
    'shopee-services': [
      // Shopee Phone Check
      {
        method: 'POST',
        path: '/api/phone-checks/bulk',
        permission: 'phone_check',
        cost: '100 VND/số chưa đăng ký',
        serviceName: 'Shopee Phone Check',
        description: 'Kiểm tra số điện thoại đã đăng ký Shopee',
        supportsApiKey: true,
        requestExample: JSON.stringify({ phoneNumbers: ['0987654321', '0123456789'] }, null, 2),
        responseExample: '{ "totalCost": 100, "summary": { "registered": 1, "unregistered": 1 } }',
        alternativeExamples: [
          {
            title: 'Lỗi: Không đủ tiền',
            example: '{ "message": "Số dư không đủ. Cần 200 VND. Số dư hiện tại: 50 VND" }'
          },
          {
            title: 'Lỗi: Request không hợp lệ',
            example: '{ "message": "phoneNumbers là bắt buộc và phải là mảng" }'
          }
        ]
      },
      // Username Check
      {
        method: 'POST',
        path: '/api/username-checks/bulk',
        permission: 'username_check',
        cost: 'MIỄN PHÍ',
        serviceName: 'Shopee Username Check',
        description: 'Kiểm tra trạng thái username Shopee (active/banned) - Tối đa 20 username/lần',
        supportsApiKey: true,
        requestExample: JSON.stringify({ usernames: ['username1', 'username2', 'username3'] }, null, 2),
        responseExample: JSON.stringify({
          success: true,
          results: [
            { username: 'username1', status: 1, isAvailable: true, ipAddress: '1.2.3.4' },
            { username: 'username2', status: 2, isAvailable: false, ipAddress: '1.2.3.4' },
            { username: 'username3', status: null, isAvailable: false, ipAddress: '1.2.3.4' }
          ],
          totalChecked: 3,
          activeCount: 1,
          bannedCount: 1,
          errorCount: 1
        }, null, 2),
        alternativeExamples: [
          {
            title: 'Status codes',
            example: '// status = 1: Active (tài khoản hoạt động)\n// status = 2: Banned (tài khoản bị cấm)\n// status = null: Error/Unknown (lỗi hoặc không xác định)'
          }
        ]
      },
      // Phone Live Check
      {
        method: 'POST',
        path: '/api/phone-live-checks/bulk',
        permission: 'phone_live_check',
        cost: 'MIỄN PHÍ',
        serviceName: 'Phone Live Check',
        description: 'Kiểm tra số điện thoại live qua API check_unbind_phone - Tối đa 20 số/lần',
        supportsApiKey: true,
        requestExample: JSON.stringify({ phoneNumbers: ['0987654321', '0123456789', '84987654321'] }, null, 2),
        responseExample: JSON.stringify({
          success: true,
          results: [
            { phone: '0987654321', normalizedPhone: '84987654321', status: 'live', statusMessage: 'Số điện thoại đang hoạt động', errorCode: 0 },
            { phone: '0123456789', normalizedPhone: '84123456789', status: 'blocked', statusMessage: 'Số điện thoại đã bị chặn hoặc không hợp lệ', errorCode: 134 },
            { phone: '84987654321', normalizedPhone: '84987654321', status: 'error', statusMessage: 'Định dạng số điện thoại không hợp lệ', errorCode: null }
          ],
          totalChecked: 3,
          liveCount: 1,
          blockedCount: 1,
          errorCount: 1
        }, null, 2),
        alternativeExamples: [
          {
            title: 'Định dạng số điện thoại hợp lệ',
            example: '// Các định dạng được hỗ trợ:\n// - 9 số: "987654321" → chuyển thành "84987654321"\n// - 10 số bắt đầu bằng 0: "0987654321" → chuyển thành "84987654321"\n// - 11 số bắt đầu bằng 84: "84987654321" → giữ nguyên'
          },
          {
            title: 'Status codes',
            example: '// status = "live": Số điện thoại đang hoạt động (errorCode = 0)\n// status = "blocked": Số điện thoại bị chặn (errorCode = 134)\n// status = "error": Lỗi định dạng hoặc API error'
          }
        ]
      },
      // Shopee Account Check (Bulk only)
      {
        method: 'POST',
        path: '/api/account-check/bulk',
        permission: 'account_check',
        cost: '100 VND/cookie (hoàn tiền tự động nếu thất bại)',
        serviceName: 'Shopee Account Check',
        description: 'Kiểm tra tài khoản Shopee hàng loạt - TỐI ƯU XỬ LÝ SONG SONG: Xử lý 10 cookies cùng lúc, nhanh gấp 3x! Tự động phát hiện cookie hết hạn/DIE và hoàn tiền ngay',
        supportsApiKey: true,
        requestExample: JSON.stringify({ 
          entries: [
            { cookie: 'SPC_ST=...', proxy: 'ip:port:user:pass' }, 
            { cookie: 'SPC_ST=...' },
            { cookie: 'SPC_ST=...', proxy: 'ip:port:user:pass' }
          ] 
        }, null, 2),
        responseExample: JSON.stringify([
          { 
            cookieId: 'ABC123', 
            status: true, 
            message: 'Tài khoản hợp lệ',
            username: 'user123',
            nickname: 'John Doe',
            email: 'user@example.com',
            phone: '0987654321',
            userid: '12345678',
            shopid: '87654321',
            ctime: '2024-01-01T10:00:00Z',
            proxy: 'http://1.2.3.4:8080'
          },
          {
            cookieId: 'DEF456',
            status: false,
            message: 'Cookie hết hạn hoặc DIE!',
            username: null,
            nickname: null,
            email: null,
            phone: null,
            userid: null,
            shopid: null,
            ctime: null,
            proxy: 'http://5.6.7.8:8080'
          }
        ], null, 2),
        alternativeExamples: [
          {
            title: 'Không dùng proxy (dùng HTTP proxy hệ thống)',
            example: JSON.stringify({ entries: [{ cookie: 'SPC_ST=...' }, { cookie: 'SPC_ST=...' }] }, null, 2)
          },
          {
            title: 'Bulk 50 cookies (batch 10)',
            example: `// Ví dụ: gửi 50 entries cùng lúc\n{\n  "entries": [\n    { "cookie": "SPC_ST=..." },\n    { "cookie": "SPC_ST=..." },\n    // ... 48 cookies khác\n  ]\n}`
          }
        ]
      },
      // Shopee Order Tracking
      {
        method: 'POST',
        path: '/api/tracking-checks/bulk',
        permission: 'tracking_check',
        cost: '100 VND/cookie (hoàn tiền tự động nếu thất bại)',
        serviceName: 'Shopee Order Tracking',
        description: 'Theo dõi đơn hàng Shopee hàng loạt - TỐI ƯU XỬ LÝ SONG SONG: Xử lý 10 cookies cùng lúc, nhanh gấp 7-10 lần! Tự động phát hiện cookie hết hạn/DIE và hoàn tiền ngay',
        supportsApiKey: true,
        requestExample: JSON.stringify({ 
          entries: [
            { cookie: 'SPC_ST=...', proxy: 'ip:port:user:pass' }, 
            { cookie: 'SPC_ST=...' },
            { cookie: 'SPC_ST=...', proxy: 'ip:port:user:pass' }
          ] 
        }, null, 2),
        responseExample: JSON.stringify([
          { 
            cookieId: 'ABC123', 
            status: true,
            message: 'Tìm thấy 2 đơn hàng',
            orderCount: 2, 
            orders: [
              {
                order_id: '240101ABC123',
                tracking_number: 'SPXVN123456',
                shipping_name: 'Nguyễn Văn A',
                shipping_phone: '0987654321',
                shipping_address: 'Hà Nội',
                name: 'Sản phẩm A',
                final_total: 150000,
                order_time: '2024-01-01T10:00:00Z'
              }
            ],
            proxy: 'http://1.2.3.4:8080'
          },
          {
            cookieId: 'DEF456',
            status: false,
            message: 'Cookie hết hạn hoặc DIE!',
            orderCount: 0,
            orders: [],
            proxy: 'http://5.6.7.8:8080'
          }
        ], null, 2),
        alternativeExamples: [
          {
            title: 'Không dùng proxy (dùng HTTP proxy hệ thống)',
            example: JSON.stringify({ 
              entries: [
                { cookie: 'SPC_ST=...' }, 
                { cookie: 'SPC_ST=...' }
              ] 
            }, null, 2)
          },
          {
            title: 'Bulk 50 cookies (batch 10)',
            example: `// Ví dụ: gửi 50 entries cùng lúc\n{\n  "entries": [\n    { "cookie": "SPC_ST=..." },\n    { "cookie": "SPC_ST=..." },\n    // ... 48 cookies khác\n  ]\n}`
          },
          {
            title: 'Lỗi: Không đủ tiền',
            example: '{ "message": "Số dư không đủ. Cần 300 VND để check 3 cookies. Số dư hiện tại: 50 VND" }'
          },
          {
            title: 'Lỗi: Request không hợp lệ',
            example: '{ "message": "entries is required and must be an array" }'
          }
        ]
      },
      // Shopee Email Addition (Bulk only)
      {
        method: 'POST',
        path: '/api/email-additions/bulk',
        permission: 'email_service',
        cost: '100 VND/email thành công (hoàn tiền tự động nếu thất bại)',
        serviceName: 'Shopee Email Addition',
        description: 'Thêm email hàng loạt vào tài khoản Shopee - TỐI ƯU XỬ LÝ SONG SONG: Xử lý 10 cookies cùng lúc, nhanh gấp 3x! Tự động phát hiện lỗi và hoàn tiền ngay. Cookie thành công được tự động thêm vào Cookie Manager',
        supportsApiKey: true,
        requestExample: JSON.stringify({ 
          entries: [
            { cookie: 'SPC_ST=...', email: 'email1@gmail.com', proxy: 'ip:port:user:pass' }, 
            { cookie: 'SPC_ST=...', email: 'email2@gmail.com' },
            { cookie: 'SPC_ST=...', email: 'email3@gmail.com', proxy: 'ip:port:user:pass' }
          ] 
        }, null, 2),
        responseExample: JSON.stringify([
          { 
            cookieId: 'ABC123', 
            email: 'email1@gmail.com', 
            status: true, 
            message: 'Email đã được thêm thành công',
            proxy: 'http://1.2.3.4:8080'
          },
          {
            cookieId: 'DEF456',
            email: 'email2@gmail.com',
            status: false,
            message: 'Không lấy được SPC_SC_SESSION từ cookie',
            proxy: 'http://5.6.7.8:8080'
          }
        ], null, 2),
        alternativeExamples: [
          {
            title: 'Không dùng proxy (dùng HTTP proxy hệ thống)',
            example: JSON.stringify({ 
              entries: [
                { cookie: 'SPC_ST=...', email: 'email1@gmail.com' }, 
                { cookie: 'SPC_ST=...', email: 'email2@gmail.com' }
              ] 
            }, null, 2)
          },
          {
            title: 'Bulk 50 emails (batch 10)',
            example: `// Ví dụ: gửi 50 entries cùng lúc\n{\n  "entries": [\n    { "cookie": "SPC_ST=...", "email": "user1@example.com" },\n    { "cookie": "SPC_ST=...", "email": "user2@example.com" },\n    // ... 48 entries khác\n  ]\n}`
          },
          {
            title: 'Lỗi: Không đủ tiền',
            example: '{ "message": "Số dư không đủ. Cần 300 VND để thêm 3 emails. Số dư hiện tại: 100 VND" }'
          },
          {
            title: 'Lỗi: Email không hợp lệ',
            example: '{ "message": "Invalid email format for entry 2" }'
          }
        ]
      }
    ],
    'cookie-services': [
      // Express Tracking Check (Check Số Shipper)
      {
        method: 'POST',
        path: '/api/express-tracking-check-api',
        permission: 'express_tracking_check',
        cost: '500 VND',
        serviceName: 'Express Tracking Check',
        description: 'Kiểm tra số điện thoại shipper - CHỈ check thông tin shipper/driver',
        supportsApiKey: true,
        requestExample: JSON.stringify({ cookie: 'SPC_ST=...' }, null, 2),
        responseExample: JSON.stringify({
          success: true,
          message: 'Thành công - Tìm thấy thông tin shipper',
          charged: true,
          amount_charged: 500,
          hasDriver: true,
          driverPhone: '84987654321',
          driverName: 'Nguyễn Văn A',
          orderCount: 2,
          orders: [{ order_id: '240101ABC', tracking_number: 'SPX123' }]
        }, null, 2),
        alternativeExamples: [
          {
            title: 'Không tìm thấy driver (Auto-refund)',
            example: '{ "success": false, "message": "Không tìm thấy thông tin driver - Đã hoàn 500 VND", "charged": false, "refunded": true, "refund_amount": 500, "hasDriver": false }'
          },
          {
            title: 'Lỗi: Cookie không hợp lệ',
            example: '{ "success": false, "message": "Cookie check failed - Đã hoàn 500 VND", "charged": false, "refunded": true }'
          },
          {
            title: 'Lỗi: Không đủ tiền',
            example: '{ "success": false, "message": "Insufficient balance. Required: 500 VND, Available: 200 VND" }'
          }
        ]
      },
      // Voucher Saving (Lưu Voucher)
      {
        method: 'POST',
        path: '/api/voucher-saving-api',
        permission: 'voucher_saving',
        cost: '3,000 VND',
        serviceName: 'Voucher Saving',
        description: 'Lưu mã freeship tự động - CHỈ lưu voucher không check shipper',
        supportsApiKey: true,
        requestExample: JSON.stringify({ cookie: 'SPC_ST=...' }, null, 2),
        responseExample: JSON.stringify({
          success: true,
          message: 'Successfully saved 3 voucher codes',
          charged: true,
          amount_charged: 3000,
          voucherCodes: ['FREESHIP50K', 'FREESHIP30K', 'FREESHIP20K'],
          successfulSaves: 3,
          failedSaves: 0
        }, null, 2),
        alternativeExamples: [
          {
            title: 'Không có vouchers (Auto-refund)',
            example: '{ "success": false, "message": "No vouchers found - Đã hoàn 3,000 VND", "charged": false, "refunded": true, "refund_amount": 3000, "voucherCodes": [] }'
          },
          {
            title: 'Lưu một phần thành công',
            example: '{ "success": true, "message": "Saved 2 out of 3 vouchers", "charged": true, "amount_charged": 3000, "voucherCodes": ["FREESHIP50K", "FREESHIP30K"], "successfulSaves": 2, "failedSaves": 1 }'
          },
          {
            title: 'Lỗi: Không đủ tiền',
            example: '{ "success": false, "message": "Insufficient balance. Need 3,000 VND for voucher saving. Current balance: 1,000 VND" }'
          }
        ]
      },
      // Cookie Extraction Services  
      {
        method: 'POST',
        path: '/api/cookie-extractions',
        cost: '100 VND',
        serviceName: 'Cookie Extraction',
        description: 'Trích xuất cookie tự động',
        supportsApiKey: true,
        requestExample: JSON.stringify({ method: 'auto', targetUrl: 'shopee.vn' }, null, 2),
        responseExample: '{ "success": true, "cookieId": "abc123", "cookie": "SPC_ST=..." }'
      },
      {
        method: 'POST',
        path: '/api/cookie-extractions/spcf',
        cost: '100 VND',
        serviceName: 'Cookie SPCF Extraction',
        description: 'Trích xuất cookie SPCF cho Shopee',
        supportsApiKey: true,
        requestExample: JSON.stringify({ spcfToken: 'token_here' }, null, 2),
        responseExample: '{ "success": true, "cookieId": "spcf123", "cookie": "SPC_ST=..." }'
      },
      {
        method: 'POST',
        path: '/api/cookie-extractions/qr/generate',
        cost: '100 VND',
        serviceName: 'Cookie QR Generation',
        description: 'Tạo QR code để trích xuất cookie',
        supportsApiKey: true,
        requestExample: JSON.stringify({ targetSite: 'shopee' }, null, 2),
        responseExample: '{ "success": true, "qrId": "qr123", "qrCode": "data:image/png..." }'
      },
      {
        method: 'POST',
        path: '/api/cookie-extractions/qr/complete',
        cost: 'Miễn phí',
        serviceName: 'Cookie QR Complete',
        description: 'Hoàn thành quá trình trích xuất cookie từ QR',
        supportsApiKey: true,
        requestExample: JSON.stringify({ qrId: 'qr123' }, null, 2),
        responseExample: '{ "success": true, "cookieId": "qr_cookie123", "cookie": "SPC_ST=..." }'
      }
    ],
    'phone-rental': [
      // Shopee Phone Rental (All versions)
      {
        method: 'POST',
        path: '/api/phone-rental/start',
        cost: 'V1: 2,100đ | V2: 2,000đ | V3: 2,000đ',
        serviceName: 'Shopee Phone Rental',
        description: 'Thuê số điện thoại nhận OTP Shopee - 3 phiên bản (V1: 2,100đ, V2: 2,000đ, V3: 2,000đ với validation)',
        supportsApiKey: true,
        requestExample: JSON.stringify({ service: 'otissim_v1', carrier: 'main_3' }, null, 2),
        responseExample: '{ "sessionId": "abc123def456", "service": "otissim_v1", "carrier": "main_3", "phoneNumber": "0987654321", "cost": 2100, "expiresAt": "2025-09-21T10:36:00Z" }',
        alternativeExamples: [
          {
            title: 'V2 - Viettel (2,000đ)',
            example: JSON.stringify({ service: 'otissim_v2', carrier: 'VIETTEL' }, null, 2)
          },
          {
            title: 'V2 - 3 mạng chính',
            example: JSON.stringify({ service: 'otissim_v2', carrier: 'main_3' }, null, 2)
          },
          {
            title: 'V2 - Random (tất cả nhà mạng)',
            example: JSON.stringify({ service: 'otissim_v2', carrier: 'random' }, null, 2)
          },
          {
            title: 'V3 - Random carrier (2,000đ)',
            example: JSON.stringify({ service: 'otissim_v3', carrier: 'random' }, null, 2)
          },
          {
            title: 'V1 - Viettel (2,100đ)',
            example: JSON.stringify({ service: 'otissim_v1', carrier: 'VIETTEL' }, null, 2)
          },
          {
            title: 'V1 - Random tất cả nhà mạng (2,100đ)',
            example: JSON.stringify({ service: 'otissim_v1', carrier: 'random' }, null, 2)
          },
          {
            title: 'V1 - Vietnamobile (2,100đ)',
            example: JSON.stringify({ service: 'otissim_v1', carrier: 'VIETNAMOBILE' }, null, 2)
          },
          {
            title: 'Lỗi: Không đủ tiền',
            example: '{ "message": "Số dư không đủ. Cần 2,000 VND để thuê số. Số dư hiện tại: 1,000 VND" }'
          },
          {
            title: 'Lỗi: Service không hợp lệ',
            example: '{ "message": "Service không hợp lệ" }'
          }
        ]
      },
      // OTP Retrieval for Shopee
      {
        method: 'POST',
        path: '/api/phone-rental/get-otp',
        cost: 'Miễn phí',
        serviceName: 'Lấy OTP Shopee',
        description: 'Lấy mã OTP từ session thuê số Shopee (áp dụng V1/V2/V3). Hỗ trợ cả POST (body) và GET (query params)',
        supportsApiKey: true,
        requestExample: JSON.stringify({ sessionId: 'abc123def456' }, null, 2),
        responseExample: '{ "otp": "123456", "receivedAt": "2025-09-21T10:30:00Z", "success": true }',
        alternativeExamples: [
          {
            title: 'GET method (query params)',
            example: `// GET request alternative
const sessionId = 'abc123def456';
const response = await fetch(\`https://otistx.com/api/phone-rental/get-otp?sessionId=\${sessionId}\`, {
  method: 'GET',
  headers: { 'X-API-Key': 'your_api_key_here' }
});
const data = await response.json();`
          },
          {
            title: 'Lỗi: Session không tồn tại',
            example: '{ "message": "Session không tồn tại" }'
          },
          {
            title: 'Lỗi: Session hết hạn',
            example: '{ "message": "Session đã hết hạn" }'
          },
          {
            title: 'Chưa có OTP',
            example: '{ "message": "Chưa nhận được OTP. Vui lòng thử lại sau." }'
          }
        ]
      },
      // TikTok Phone Rental
      {
        method: 'POST',
        path: '/api/tiktok-rental/start',
        cost: '1,200 VND',
        serviceName: 'TikTok Phone Rental',
        description: 'Thuê số điện thoại nhận OTP TikTok',
        supportsApiKey: true,
        requestExample: JSON.stringify({ service: 'tiktok_sim', carrier: 'viettel' }, null, 2),
        responseExample: '{ "sessionId": "tiktok123", "phoneNumber": "0987654321", "cost": 1200, "expiresAt": "2025-09-21T10:36:00Z" }',
        alternativeExamples: [
          {
            title: 'Lỗi: Không đủ tiền',
            example: '{ "message": "Số dư không đủ. Cần 1,200 VND để thuê số. Số dư hiện tại: 500 VND" }'
          },
          {
            title: 'Lỗi: API provider lỗi',
            example: '{ "message": "Lỗi hệ thống. Đã hoàn tiền vào tài khoản." }'
          }
        ]
      },
      // OTP Retrieval for TikTok
      {
        method: 'POST',
        path: '/api/tiktok-rental/get-otp',
        cost: 'Miễn phí',
        serviceName: 'Lấy OTP TikTok',
        description: 'Lấy mã OTP từ session thuê số TikTok',
        supportsApiKey: true,
        requestExample: JSON.stringify({ sessionId: 'tiktok123' }, null, 2),
        responseExample: '{ "otp": "123456", "receivedAt": "2025-09-21T10:30:00Z", "success": true }',
        alternativeExamples: [
          {
            title: 'Lỗi: Session không tồn tại',
            example: '{ "message": "Session không tồn tại hoặc đã hết hạn" }'
          },
          {
            title: 'Chưa có OTP',
            example: '{ "message": "Chưa nhận được OTP. Vui lòng thử lại sau." }'
          }
        ]
      }
    ],
    'external-api': [
      // External API Phone Rental
      {
        method: 'POST',
        path: '/api/v1/external-api/rent',
        permission: 'external_api_integration',
        cost: '100 VND (khi nhận OTP)',
        serviceName: 'External API Phone Rental',
        description: 'Thuê số điện thoại từ các nhà cung cấp OTP bên ngoài (6 providers)',
        supportsApiKey: true,
        requestExample: JSON.stringify({ provider: 'provider_1', carrier: 'random' }, null, 2),
        responseExample: '{ "success": true, "sessionId": "ext_provider1_123456", "phoneNumber": "0987654321", "provider": "provider_1", "carrier": "unknown", "price": "1.8" }',
        alternativeExamples: [
          {
            title: 'Alternative provider',
            example: JSON.stringify({ provider: 'provider_2', carrier: 'random' }, null, 2)
          },
          {
            title: 'Another provider',
            example: JSON.stringify({ provider: 'provider_3', carrier: 'VIETTEL' }, null, 2)
          },
          {
            title: 'Provider example 2',
            example: JSON.stringify({ provider: 'provider2', carrier: 'mobifone' }, null, 2)
          },
          {
            title: 'Provider example 3',
            example: JSON.stringify({ provider: 'provider3', carrier: 'VINAPHONE' }, null, 2)
          },
          {
            title: 'Provider example 4',
            example: JSON.stringify({ provider: 'provider4', carrier: 'VIETNAMOBILE' }, null, 2)
          },
          {
            title: 'Lỗi: Provider không hợp lệ',
            example: '{ "success": false, "message": "Provider không hợp lệ" }'
          },
          {
            title: 'Lỗi: Provider hết số',
            example: '{ "success": false, "message": "Provider không có số khả dụng", "error": "NO_NUMBERS_AVAILABLE" }'
          }
        ]
      },
      // External API Session Status
      {
        method: 'GET',
        path: '/api/v1/external-api/session/{sessionId}',
        permission: 'external_api_integration',
        cost: 'Miễn phí',
        serviceName: 'External API Session Status',
        description: 'Lấy trạng thái và thông tin của session thuê số external API. Replace {sessionId} với session ID thực tế trong URL',
        supportsApiKey: true,
        queryParams: '',
        responseExample: '{ "success": true, "session": { "sessionId": "ext_provider1_123456", "provider": "provider_1", "status": "allocated", "phoneNumber": "0987654321", "otpCode": null, "createdAt": "2025-09-22T10:30:00Z" } }',
        alternativeExamples: [
          {
            title: 'Actual usage with session ID',
            example: `// Replace {sessionId} with your actual session ID
const sessionId = 'ext_provider1_123456';
const response = await fetch(\`https://otistx.com/api/v1/external-api/session/\${sessionId}\`, {
  method: 'GET',
  headers: { 'X-API-Key': 'your_api_key_here' }
});
const data = await response.json();`
          },
          {
            title: 'Lỗi: Session không tồn tại',
            example: '{ "success": false, "message": "Rental session not found" }'
          },
          {
            title: 'Lỗi: Không có quyền truy cập',
            example: '{ "success": false, "message": "You don\'t have access to this rental session" }'
          }
        ]
      },
      // External API Get OTP
      {
        method: 'POST',
        path: '/api/external-api-rentals/{sessionId}/get-otp',
        permission: 'external_api_integration',
        cost: 'Miễn phí',
        serviceName: 'External API Get OTP',
        description: 'Poll OTP từ session external API - tự động charge 100đ khi có OTP. Replace {sessionId} với session ID thực tế trong URL',
        supportsApiKey: true,
        requestExample: JSON.stringify({}, null, 2),
        responseExample: '{ "success": true, "otp": "123456", "state": "completed", "smsContent": "Mã OTP của bạn là: 123456", "charged": true, "chargeAmount": 100 }',
        alternativeExamples: [
          {
            title: 'Actual usage with session ID',
            example: `// Replace {sessionId} with your actual session ID
const sessionId = 'ext_provider1_123456';
const response = await fetch(\`https://otistx.com/api/external-api-rentals/\${sessionId}/get-otp\`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your_api_key_here'
  },
  body: JSON.stringify({})
});
const data = await response.json();`
          },
          {
            title: 'Đang chờ OTP',
            example: '{ "success": true, "state": "waiting", "message": "Chưa nhận được OTP" }'
          },
          {
            title: 'Session hết hạn',
            example: '{ "success": false, "state": "expired", "message": "Session đã hết hạn" }'
          }
        ]
      }
    ],
    'system': [
      // User Balance
      {
        method: 'GET',
        path: '/api/user/balance',
        cost: 'Miễn phí',
        serviceName: 'User Balance',
        description: 'Lấy số dư tài khoản hiện tại',
        supportsApiKey: true,
        responseExample: '9920900'
      },
      // Top-up Service
      {
        method: 'POST',
        path: '/api/topup/generate-qr',
        cost: 'Miễn phí',
        serviceName: 'Top-up Service',
        description: 'Nạp tiền QR code',
        supportsApiKey: true,
        requestExample: JSON.stringify({ amount: 100000 }, null, 2),
        responseExample: '{ "qrCode": "data:image/png...", "requestId": "req123" }'
      },
      // Username Check
      {
        method: 'POST',
        path: '/api/username-checks/bulk',
        cost: 'Tùy chỉnh',
        serviceName: 'Username Check',
        description: 'Kiểm tra username hàng loạt',
        supportsApiKey: true,
        requestExample: JSON.stringify({ usernames: ['user1', 'user2'] }, null, 2),
        responseExample: '[{ "username": "user1", "available": true }, { "username": "user2", "available": false }]'
      },
      // Phone Live Check
      {
        method: 'POST',
        path: '/api/phone-live-checks/bulk',
        cost: 'Tùy chỉnh',
        serviceName: 'Phone Live Check',
        description: 'Kiểm tra trạng thái số điện thoại hàng loạt',
        supportsApiKey: true,
        requestExample: JSON.stringify({ phones: ['0987654321', '0123456789'] }, null, 2),
        responseExample: '[{ "phone": "0987654321", "status": "active" }, { "phone": "0123456789", "status": "inactive" }]'
      }
    ]
  };

  const totalEndpoints = Object.values(endpointGroups).reduce((sum, group) => sum + group.length, 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <FixedHeader />
      <div className="pt-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="py-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Code className="h-8 w-8 text-blue-600" />
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white">API Documentation</h1>
            </div>
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-6">
              Tài liệu API đầy đủ cho {totalEndpoints} endpoints - {Object.values(endpointGroups).flat().filter(e => (e as ApiEndpoint).supportsApiKey).length} endpoints hỗ trợ API Key
            </p>
            <div className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 px-6 py-4 rounded-xl border border-blue-200 dark:border-blue-800">
              <Shield className="h-5 w-5 text-blue-600" />
              <span className="text-blue-800 dark:text-blue-200 font-medium">
                Production API: https://otistx.com • Development: localhost:5000
              </span>
            </div>
          </div>

          {/* Security Warning */}
          <Alert className="mb-8 border-red-200 bg-red-50 dark:bg-red-900/20">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-800 dark:text-red-200">⚠️ Cảnh báo bảo mật</AlertTitle>
            <AlertDescription className="text-red-700 dark:text-red-300">
              <strong>KHÔNG nhập API key thật vào tester này!</strong> API key có thể bị lộ qua JavaScript trong browser. 
              Chỉ sử dụng API key test hoặc development. Đối với production, hãy gọi API từ server backend của bạn.
            </AlertDescription>
          </Alert>

          {/* API Key Setup */}
          <Card className="mb-8 border-blue-200 dark:border-blue-800">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
              <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
                <Key className="h-5 w-5" />
                API Key Authentication
              </CardTitle>
              <CardDescription className="text-blue-600 dark:text-blue-300">
                Hướng dẫn xác thực và cấu hình API Key
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="apikey-test" className="text-sm font-medium mb-2 block">
                      API Key (chỉ dành cho test development)
                    </Label>
                    <div className="relative">
                      <Input
                        id="apikey-test"
                        type={showApiKey ? "text" : "password"}
                        placeholder="Nhập API key test/development"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        data-testid="input-api-key"
                        className="pr-10"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1 h-8 w-8 p-0"
                        onClick={() => setShowApiKey(!showApiKey)}
                        data-testid="button-toggle-api-key"
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      ⚠️ Chỉ sử dụng API key test, không nhập production key
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="base-url" className="text-sm font-medium mb-2 block">
                      Target Environment:
                    </Label>
                    <select
                      id="base-url"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      data-testid="select-base-url"
                    >
                      <option value="relative">Same Origin (Recommended)</option>
                      <option value="localhost">Development (localhost:5000)</option>
                      <option value="production">Production (otistx.com)</option>
                    </select>
                  </div>
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                  <h4 className="font-semibold mb-2">Thông tin xác thực:</h4>
                  <div className="space-y-1 text-sm font-mono">
                    <div><strong>Header:</strong> X-API-Key</div>
                    <div><strong>Production:</strong> https://otistx.com</div>
                    <div><strong>Development:</strong> http://localhost:5000</div>
                    <div><strong>Content-Type:</strong> application/json</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left Panel: API Explorer */}
            <div className="lg:col-span-2">
              <Tabs defaultValue="shopee-services" className="w-full">
                <TabsList className="grid w-full grid-cols-5" data-testid="tabs-list">
                  <TabsTrigger value="shopee-services" className="flex items-center gap-1" data-testid="tab-shopee">
                    <Shield className="h-3 w-3" />
                    Shopee Services ({endpointGroups['shopee-services'].length})
                  </TabsTrigger>
                  <TabsTrigger value="cookie-services" className="flex items-center gap-1" data-testid="tab-cookie">
                    <Eye className="h-3 w-3" />
                    Cookie Services ({endpointGroups['cookie-services'].length})
                  </TabsTrigger>
                  <TabsTrigger value="phone-rental" className="flex items-center gap-1" data-testid="tab-phone">
                    <Phone className="h-3 w-3" />
                    Phone Rental ({endpointGroups['phone-rental'].length})
                  </TabsTrigger>
                  <TabsTrigger value="external-api" className="flex items-center gap-1" data-testid="tab-external">
                    <Network className="h-3 w-3" />
                    External API ({endpointGroups['external-api'].length})
                  </TabsTrigger>
                  <TabsTrigger value="system" className="flex items-center gap-1" data-testid="tab-system">
                    <Server className="h-3 w-3" />
                    System ({endpointGroups.system.length})
                  </TabsTrigger>
                </TabsList>

                {Object.entries(endpointGroups).map(([groupKey, endpoints]) => (
                  <TabsContent key={groupKey} value={groupKey}>
                    <div className="space-y-4">
                      {endpoints.map((endpoint, index) => (
                        <Card 
                          key={index} 
                          className={`cursor-pointer transition-all hover:shadow-md ${
                            selectedEndpoint?.path === endpoint.path && selectedEndpoint?.method === endpoint.method 
                              ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
                          }`}
                          onClick={() => {
                            setSelectedEndpoint(endpoint);
                            setRequestBody(endpoint.requestExample || '');
                            setQueryParams((endpoint as ApiEndpoint).queryParams || '');
                            setResponse('');
                          }}
                          data-testid={`endpoint-${endpoint.method}-${endpoint.path.replace(/[^a-zA-Z0-9]/g, '-')}`}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant={endpoint.method === 'GET' ? 'secondary' : 'default'}>
                                  {endpoint.method}
                                </Badge>
                                <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                  {endpoint.path}
                                </code>
                              </div>
                              <div className="flex items-center gap-1">
                                {(endpoint as ApiEndpoint).permission && (
                                  <Badge variant="outline" className="text-xs">
                                    <Lock className="h-3 w-3 mr-1" />
                                    {(endpoint as ApiEndpoint).permission}
                                  </Badge>
                                )}
                                <Badge variant="outline" className={`text-xs ${
                                  endpoint.cost === 'Miễn phí' ? 'text-green-600 border-green-300' : 'text-orange-600 border-orange-300'
                                }`}>
                                  {endpoint.cost}
                                </Badge>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              {endpoint.serviceName && (
                                <Badge variant="secondary" className="text-xs">
                                  {endpoint.serviceName}
                                </Badge>
                              )}
                              {(endpoint as ApiEndpoint).supportsApiKey && (
                                <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-blue-300">
                                  <Key className="h-3 w-3 mr-1" />
                                  API Key Support
                                </Badge>
                              )}
                            </div>
                            
                            <CardDescription className="text-sm mb-3">
                              {endpoint.description}
                            </CardDescription>
                            
                            <div className="space-y-2">
                              {endpoint.requestExample && (
                                <div>
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs font-medium text-gray-500">Request Example:</Label>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(endpoint.requestExample);
                                      }}
                                      className="h-6 px-2"
                                      data-testid={`button-copy-request-${index}`}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-xs font-mono overflow-x-auto">
                                    <pre>{endpoint.requestExample}</pre>
                                  </div>
                                  
                                  {(endpoint as ApiEndpoint).alternativeExamples && (endpoint as ApiEndpoint).alternativeExamples!.map((altExample: any, altIndex: number) => (
                                    <div key={altIndex} className="mt-2">
                                      <div className="flex items-center justify-between">
                                        <Label className="text-xs font-medium text-blue-600">{altExample.title}:</Label>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(altExample.example);
                                          }}
                                          className="h-6 px-2"
                                          data-testid={`button-copy-alt-${index}-${altIndex}`}
                                        >
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      </div>
                                      <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded text-xs font-mono overflow-x-auto">
                                        <pre>{altExample.example}</pre>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {(endpoint as ApiEndpoint).queryParams && (
                                <div>
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs font-medium text-gray-500">Query Parameters:</Label>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard((endpoint as ApiEndpoint).queryParams || '');
                                      }}
                                      className="h-6 px-2"
                                      data-testid={`button-copy-query-${index}`}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-xs font-mono">
                                    {(endpoint as ApiEndpoint).queryParams}
                                  </div>
                                </div>
                              )}
                              
                              <div>
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs font-medium text-gray-500">Code Sample:</Label>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const endpointKey = `${endpoint.method}-${endpoint.path}`;
                                        toggleCodeSample(endpointKey);
                                      }}
                                      className="h-6 px-2"
                                      data-testid={`button-toggle-code-${index}`}
                                      aria-expanded={expandedCodeSamples.has(`${endpoint.method}-${endpoint.path}`) ? true : false}
                                    >
                                      {expandedCodeSamples.has(`${endpoint.method}-${endpoint.path}`) ? 
                                        <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                      }
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(generateCodeSample(endpoint));
                                      }}
                                      className="h-6 px-2"
                                      data-testid={`button-copy-code-${index}`}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                                {expandedCodeSamples.has(`${endpoint.method}-${endpoint.path}`) && (
                                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-xs font-mono overflow-x-auto mt-2">
                                    <pre>{generateCodeSample(endpoint)}</pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </div>

            {/* Right Panel: API Tester */}
            <div className="lg:col-span-1">
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Play className="h-5 w-5 text-green-600" />
                    Development API Tester
                  </CardTitle>
                  <CardDescription>
                    Test với localhost:5000 (an toàn)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedEndpoint ? (
                    <>
                      <div>
                        <Label className="text-sm font-medium">Endpoint đã chọn:</Label>
                        <div className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded text-sm">
                          <Badge variant="outline" className="mr-2">
                            {selectedEndpoint.method}
                          </Badge>
                          {selectedEndpoint.path}
                        </div>
                      </div>

                      {selectedEndpoint.method === 'GET' && (
                        <div>
                          <Label htmlFor="query-params" className="text-sm font-medium">
                            Query Parameters (key=value&key2=value2):
                          </Label>
                          <Input
                            id="query-params"
                            value={queryParams}
                            onChange={(e) => setQueryParams(e.target.value)}
                            placeholder="sessionId=abc123&limit=10"
                            className="mt-1 font-mono text-xs"
                            data-testid="input-query-params"
                          />
                        </div>
                      )}

                      {selectedEndpoint.method !== 'GET' && (
                        <div>
                          <Label htmlFor="request-body" className="text-sm font-medium">
                            Request Body (JSON):
                          </Label>
                          <Textarea
                            id="request-body"
                            value={requestBody}
                            onChange={(e) => setRequestBody(e.target.value)}
                            placeholder="Nhập JSON request body"
                            rows={6}
                            className={`mt-1 font-mono text-xs ${
                              requestBody && !validateJson(requestBody) ? 'border-red-500' : ''
                            }`}
                            data-testid="textarea-request-body"
                          />
                          {requestBody && !validateJson(requestBody) && (
                            <p className="text-xs text-red-500 mt-1">JSON format không hợp lệ</p>
                          )}
                        </div>
                      )}

                      <Button
                        onClick={testEndpoint}
                        disabled={isLoading || !apiKey || (requestBody.trim() !== '' && !validateJson(requestBody))}
                        className="w-full"
                        data-testid="button-test-api"
                      >
                        {isLoading ? 'Đang test...' : `Test API (${baseUrl === 'production' ? 'otistx.com' : baseUrl === 'localhost' ? 'localhost' : 'same-origin'})`}
                      </Button>

                      {response && (
                        <div>
                          <Label className="text-sm font-medium">Response:</Label>
                          <Textarea
                            value={response}
                            readOnly
                            rows={12}
                            className="mt-1 font-mono text-xs"
                            data-testid="textarea-response"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(response)}
                            className="mt-2 w-full"
                            data-testid="button-copy-response"
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Response
                          </Button>
                        </div>
                      )}

                      {selectedEndpoint.responseExample && (
                        <div>
                          <Label className="text-sm font-medium">Example Response:</Label>
                          <div className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">
                            {selectedEndpoint.responseExample}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Chọn một endpoint để bắt đầu test</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Footer Info */}
          <div className="mt-8 grid md:grid-cols-2 gap-6">
            {/* Statistics */}
            <Card className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 border-green-200 dark:border-green-800">
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-600">{totalEndpoints}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">API Endpoints</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">6</div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">Nhóm Dịch Vụ</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Start */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Start</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="space-y-2">
                  <div><strong>1.</strong> Tạo API key tại /api-keys</div>
                  <div><strong>2.</strong> Đặt header: X-API-Key: your_key</div>
                  <div><strong>3.</strong> Gọi API với đúng permission</div>
                  <div><strong>4.</strong> Handle response và error codes</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}