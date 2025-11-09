import { ServiceOption } from './types';

// Danh sách các dịch vụ thuê số khả dụng với cấu hình nhà mạng
export const SERVICE_OPTIONS: ServiceOption[] = [
  { 
    value: 'otissim_v3', 
    label: 'OtisSim v3', 
    price: '2,000 VND',
    carriers: [
      { value: 'main_3', label: '3 mạng chính' },    // Random từ Viettel, Vina, Mobi
      { value: 'vnmb', label: 'VNMB' },              // Vietnam Mobile
      { value: 'itel', label: 'iTel' },              // ITelecom
      { value: 'random', label: 'Random' }           // Random từ tất cả nhà mạng
    ]
  },
  { 
    value: 'otissim_v2', 
    label: 'OtisSim v2', 
    price: '2,000 VND',
    carriers: [
      { value: 'main_3', label: '3 mạng chính' },      // viettel|mobifone|vinaphone
      { value: 'VIETTEL', label: 'Viettel' },          // viettel
      { value: 'MOBIFONE', label: 'Mobifone' },        // mobifone
      { value: 'VINAPHONE', label: 'Vinaphone' },      // vinaphone
      { value: 'VIETNAMOBILE', label: 'Vietnamobile' }, // vietnamobile
      { value: 'random', label: 'Random' }             // viettel|mobifone|vietnamobile|vinaphone
    ]
  },
  { 
    value: 'otissim_v1', 
    label: 'OtisSim v1', 
    price: '2,100 VND',
    carriers: [
      { value: 'main_3', label: '3 mạng chính' },      // NetworkId: 1,2,3 (Viettel, MobiFone, VinaPhone)
      { value: 'VIETTEL', label: 'Viettel' },          // NetworkId: 1
      { value: 'MOBIFONE', label: 'MobiFone' },        // NetworkId: 2
      { value: 'VINAPHONE', label: 'VinaPhone' },      // NetworkId: 3
      { value: 'VIETNAMOBILE', label: 'Vietnamobile' }, // NetworkId: 4
      { value: 'ITELECOM', label: 'Itelecom' },        // NetworkId: 5
      { value: 'random', label: 'Random' }             // NetworkId: 1,2,3,4,5 (tất cả)
    ]
  }
];

// Các tùy chọn lọc theo thời gian
export const DATE_FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả' },           // Hiển thị tất cả thời gian
  { value: 'today', label: 'Hôm nay' },        // Chỉ hôm nay
  { value: 'yesterday', label: 'Hôm qua' },    // Chỉ hôm qua
  { value: 'week', label: 'Tuần này' },        // Tuần hiện tại
  { value: 'month', label: 'Tháng này' },      // Tháng hiện tại
  { value: 'custom', label: 'Tùy chọn' }       // Chọn khoảng thời gian tùy ý
];

// Số lượng bản ghi hiển thị mỗi trang
export const ITEMS_PER_PAGE_OPTIONS = [
  { value: 10, label: '10 mục' },   // 10 bản ghi
  { value: 20, label: '20 mục' },   // 20 bản ghi
  { value: 50, label: '50 mục' }    // 50 bản ghi
];

// Trạng thái mặc định cho bộ lọc lịch sử
export const DEFAULT_FILTER_STATE = {
  searchQuery: '',              // Không có từ khóa tìm kiếm
  itemsPerPage: 10,            // Mặc định 10 mục mỗi trang
  currentPage: 1,              // Bắt đầu từ trang đầu tiên
  dateFilter: 'all',           // Hiển thị tất cả thời gian
  customStartDate: undefined,   // Không có ngày bắt đầu tùy chọn
  customEndDate: undefined     // Không có ngày kết thúc tùy chọn
};

// Thời gian polling để kiểm tra OTP (1 giây) - TĂNG TỐC để nhận OTP nhanh hơn
export const POLLING_INTERVAL = 1000; // 1 giây/lần - Live speed

// Thời gian refresh lịch sử tự động (5 phút) - OPTIMIZED
export const HISTORY_REFRESH_INTERVAL = 300000; // Tăng từ 2 phút → 5 phút (60% reduction)

// Thời gian check expired sessions (10 phút) - OPTIMIZED  
export const EXPIRED_CHECK_INTERVAL = 600000; // Tăng từ 5 phút → 10 phút (50% reduction)

// TikTok service configuration
export const TIKTOK_SERVICE_OPTIONS = [
  { 
    value: 'tiktoksim_v1', 
    label: 'TikTokSim v1', 
    price: '1,200 VND',
    carriers: [
      { value: 'main_3', label: '3 mạng chính' },    // Random từ Viettel, Vina, Mobi
      { value: 'vnmb', label: 'VNMB' },              // Vietnam Mobile
      { value: 'itel', label: 'iTel' },              // ITelecom
      { value: 'random', label: 'Random' }           // Random từ tất cả nhà mạng
    ]
  }
];