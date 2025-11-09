// Định nghĩa các kiểu dữ liệu cho hệ thống thuê số điện thoại

// Thông tin phiên thuê số đang hoạt động
export interface RentalSession {
  id: string;                 // ID duy nhất của phiên thuê
  service: 'otissim_v1' | 'otissim_v2' | 'otissim_v3' | 'tiktoksim_v1';  // Loại dịch vụ thuê số
  carrier: string;            // Nhà mạng được chọn
  phoneNumber: string;        // Số điện thoại được thuê
  status: 'waiting' | 'active' | 'completed' | 'expired' | 'failed';  // Trạng thái phiên
  otpCode?: string;          // Mã OTP nhận được (tùy chọn)
  cost: number;              // Chi phí thuê (VND)
  startTime: string;         // Thời gian bắt đầu (ISO string)
  expiresAt: string;         // Thời gian hết hạn (ISO string)
  sessionData?: any;         // Dữ liệu bổ sung từ API
  // V3-specific fields for enhanced OTP response
  smsContent?: string;       // Nội dung SMS đầy đủ (cho v3)
  isCall?: boolean;          // Có phải cuộc gọi không (cho v3)
  callFileUrl?: string;      // URL file âm thanh (cho v3, đã được proxy)
}

// Thông tin lịch sử thuê số từ database
export interface HistorySession {
  id: number;                     // ID trong database
  sessionId: string;              // ID phiên thuê
  service: string;                // Tên dịch vụ
  carrier: string;                // Nhà mạng
  phoneNumber: string;            // Số điện thoại
  status: string;                 // Trạng thái cuối cùng
  otpCode: string | null;         // Mã OTP (có thể null)
  cost: number;                   // Chi phí thuê
  startTime: string;              // Thời gian bắt đầu
  completedTime: string | null;   // Thời gian hoàn thành (có thể null)
  expiresAt: string;              // Thời gian hết hạn
  createdAt: string;              // Thời gian tạo record
  
  // V3 Response fields for audio/SMS support
  smsContent?: string;            // Nội dung SMS đầy đủ (cho v3)
  isCall?: boolean;               // Có phải cuộc gọi không (cho v3)
  callFileUrl?: string;           // URL file âm thanh (cho v3, đã được proxy)
}

// Cấu hình dịch vụ với danh sách nhà mạng
export interface ServiceOption {
  value: 'otissim_v1' | 'otissim_v2' | 'otissim_v3' | 'tiktoksim_v1';  // Giá trị dịch vụ
  label: string;                        // Tên hiển thị
  price: string;                        // Giá cả (định dạng hiển thị)
  carriers: CarrierOption[];            // Danh sách nhà mạng khả dụng
}

// Thông tin nhà mạng
export interface CarrierOption {
  value: string;  // Giá trị nhà mạng (3_mang_chinh, vnmb, etc.)
  label: string;  // Tên hiển thị nhà mạng
}

// Trạng thái bộ lọc cho lịch sử
export interface FilterState {
  searchQuery: string;        // Từ khóa tìm kiếm
  itemsPerPage: number;       // Số item mỗi trang
  currentPage: number;        // Trang hiện tại
  dateFilter: string;         // Bộ lọc ngày (all, today, week, etc.)
  customStartDate?: Date;     // Ngày bắt đầu tùy chọn
  customEndDate?: Date;       // Ngày kết thúc tùy chọn
}

// Trạng thái của phiên thuê số
export type SessionStatus = 'waiting' | 'active' | 'completed' | 'expired' | 'failed';

// Loại dịch vụ thuê số
export type ServiceType = 'otissim_v1' | 'otissim_v2' | 'otissim_v3' | 'tiktoksim_v1';