import { format, isToday, isYesterday, isThisWeek, isThisMonth, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { RentalSession, HistorySession, SessionStatus } from './types';

// Xác định trạng thái hiện tại của phiên thuê số
export const getSessionStatus = (session: RentalSession): SessionStatus => {
  const now = new Date();
  const expires = new Date(session.expiresAt);
  
  // Nếu đã quá thời gian hết hạn và vẫn đang chờ, chuyển thành thất bại
  if (now.getTime() > expires.getTime() && session.status === 'waiting') {
    return 'failed';
  }
  
  return session.status;
};

// Xác định trạng thái cho bản ghi lịch sử thuê số
export const getHistorySessionStatus = (session: HistorySession): SessionStatus => {
  const now = new Date();
  const expires = new Date(session.expiresAt);
  
  // Nếu đã quá thời gian hết hạn và vẫn đang chờ, chuyển thành thất bại
  if (now.getTime() > expires.getTime() && session.status === 'waiting') {
    return 'failed';
  }
  
  return session.status as SessionStatus;
};

// Tính toán thời gian còn lại của phiên thuê số
export const getTimeRemaining = (expiresAt: string): string => {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();
  
  // Nếu đã hết hạn
  if (diff <= 0) return "Đã hết hạn";
  
  // Tính phút và giây còn lại
  const minutes = Math.floor(diff / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Định dạng ngày giờ theo chuẩn Việt Nam
export const formatVietnameseDate = (dateString: string): string => {
  return format(new Date(dateString), 'dd/MM/yyyy HH:mm', { locale: vi });
};

// Sao chép text vào clipboard với haptic feedback
export const copyToClipboard = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
    
    // Haptic feedback trên mobile
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  } catch (error) {
    console.error('Lỗi khi sao chép vào clipboard:', error);
  }
};

// Lọc lịch sử theo từ khóa tìm kiếm
export const filterHistoryBySearch = (
  sessions: HistorySession[], 
  searchQuery: string
): HistorySession[] => {
  if (!searchQuery) return sessions;
  
  const query = searchQuery.toLowerCase();
  return sessions.filter(session => 
    session.phoneNumber.toLowerCase().includes(query) ||     // Tìm theo số điện thoại
    session.sessionId.toLowerCase().includes(query) ||       // Tìm theo session ID
    session.service.toLowerCase().includes(query) ||         // Tìm theo dịch vụ
    session.carrier.toLowerCase().includes(query)            // Tìm theo nhà mạng
  );
};

// Lọc lịch sử theo khoảng thời gian
export const filterHistoryByDate = (
  sessions: HistorySession[],
  dateFilter: string,
  customStartDate?: Date,
  customEndDate?: Date
): HistorySession[] => {
  if (dateFilter === 'all') return sessions;
  
  return sessions.filter(session => {
    const sessionDate = parseISO(session.startTime);
    
    switch (dateFilter) {
      case 'today':
        return isToday(sessionDate);                                    // Chỉ hôm nay
      case 'yesterday':
        return isYesterday(sessionDate);                                // Chỉ hôm qua
      case 'week':
        return isThisWeek(sessionDate, { weekStartsOn: 1 });           // Tuần này (bắt đầu thứ 2)
      case 'month':
        return isThisMonth(sessionDate);                                // Tháng này
      case 'custom':
        // Khoảng thời gian tùy chọn
        if (!customStartDate || !customEndDate) return true;
        const start = new Date(customStartDate);
        const end = new Date(customEndDate);
        start.setHours(0, 0, 0, 0);        // Bắt đầu từ 00:00:00
        end.setHours(23, 59, 59, 999);     // Kết thúc tại 23:59:59
        return sessionDate >= start && sessionDate <= end;
      default:
        return true;
    }
  });
};

// Phân trang dữ liệu
export const paginateData = <T>(
  data: T[],
  currentPage: number,
  itemsPerPage: number
): { paginatedData: T[]; totalPages: number; startIndex: number; endIndex: number } => {
  const totalPages = Math.ceil(data.length / itemsPerPage);          // Tổng số trang
  const startIndex = (currentPage - 1) * itemsPerPage;              // Chỉ số bắt đầu
  const endIndex = startIndex + itemsPerPage;                       // Chỉ số kết thúc
  const paginatedData = data.slice(startIndex, endIndex);           // Dữ liệu trang hiện tại
  
  return {
    paginatedData,     // Dữ liệu đã phân trang
    totalPages,        // Tổng số trang
    startIndex,        // Vị trí bắt đầu
    endIndex           // Vị trí kết thúc
  };
};

// Tạo danh sách số trang cho navigation
export const generatePageNumbers = (
  currentPage: number,
  totalPages: number,
  maxVisible: number = 5    // Tối đa 5 trang hiển thị
): number[] => {
  // Nếu tổng số trang ít hơn số trang tối đa hiển thị
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  
  // Nếu đang ở trang đầu (1, 2, 3)
  if (currentPage <= 3) {
    return Array.from({ length: maxVisible }, (_, i) => i + 1);
  }
  
  // Nếu đang ở gần trang cuối
  if (currentPage >= totalPages - 2) {
    return Array.from({ length: maxVisible }, (_, i) => totalPages - maxVisible + 1 + i);
  }
  
  // Hiển thị trang hiện tại ở giữa
  return Array.from({ length: maxVisible }, (_, i) => currentPage - 2 + i);
};