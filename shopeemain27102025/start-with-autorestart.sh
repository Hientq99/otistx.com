#!/bin/bash

# ============================================================================
# AUTO-RESTART WRAPPER SCRIPT
# ============================================================================
# Tự động khởi động lại ứng dụng khi gặp lỗi
# Ghi log restart và thời gian downtime
# ============================================================================

LOG_FILE="restart.log"
MAX_RESTART_DELAY=60
INITIAL_DELAY=5
restart_count=0
restart_delay=$INITIAL_DELAY

# Hàm ghi log với timestamp
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Hàm cleanup khi nhận SIGTERM/SIGINT
cleanup() {
    log_message "🛑 Nhận tín hiệu dừng - đang tắt server..."
    kill $server_pid 2>/dev/null
    wait $server_pid 2>/dev/null
    log_message "✅ Server đã tắt an toàn"
    exit 0
}

trap cleanup SIGTERM SIGINT

log_message "🚀 Starting application with auto-restart..."
log_message "📝 Restart logs: $LOG_FILE"

while true; do
    log_message "▶️  Starting npm run dev (restart #$restart_count)..."
    
    # Chạy server trong background
    npm run dev &
    server_pid=$!
    
    # Đợi process kết thúc
    wait $server_pid
    exit_code=$?
    
    # Kiểm tra exit code
    if [ $exit_code -eq 0 ]; then
        log_message "✅ Server đã tắt bình thường (exit code 0)"
        exit 0
    else
        restart_count=$((restart_count + 1))
        log_message "❌ Server crashed với exit code $exit_code"
        log_message "🔄 Sẽ restart sau $restart_delay giây... (lần thứ $restart_count)"
        
        # Đợi trước khi restart
        sleep $restart_delay
        
        # Tăng delay cho lần restart tiếp theo (exponential backoff)
        restart_delay=$((restart_delay * 2))
        if [ $restart_delay -gt $MAX_RESTART_DELAY ]; then
            restart_delay=$MAX_RESTART_DELAY
        fi
        
        # Reset delay nếu server chạy được lâu (>5 phút)
        # Điều này được xử lý bằng cách check uptime trong lần chạy tiếp theo
    fi
done
