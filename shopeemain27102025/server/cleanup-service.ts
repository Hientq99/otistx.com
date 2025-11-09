/**
 * DỊCH VỤ DỌN DẸP TỰ ĐỘNG
 * ========================
 * 
 * Service tự động xóa CMD/terminal định kỳ
 * Hỗ trợ cả Windows (cls) và Linux/Unix (clear)
 * 
 * Cấu hình (Environment Variables):
 * - CMD_CLEANUP_ENABLED: true/false (mặc định: true)
 * - CMD_CLEANUP_INTERVAL: số phút giữa các lần cleanup (mặc định: 30)
 * 
 * Chức năng:
 * - Chạy background task định kỳ
 * - Tự động phát hiện OS và dùng lệnh phù hợp
 * - Xóa terminal/console history
 * - Log hoạt động cleanup
 * - Hỗ trợ cleanup thủ công
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let cleanupInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let nextCleanupTime: Date | null = null;

// Configuration
const CLEANUP_INTERVAL_MINUTES = parseInt(process.env.CMD_CLEANUP_INTERVAL || '120');
const CLEANUP_ENABLED = process.env.CMD_CLEANUP_ENABLED !== 'false';
const CLEANUP_INTERVAL_MS = CLEANUP_INTERVAL_MINUTES * 60 * 1000;

/**
 * Thực hiện lệnh xóa CMD/terminal với nhiều phương pháp
 */
async function clearCommand(): Promise<void> {
  try {
    const platform = process.platform;
    let commands: string[] = [];
    let methods: string[] = [];

    // Kiểm tra nếu đang chạy trên Replit hoặc có Windows Server trong tên
    const isWindowsTarget = process.env.TARGET_OS === 'windows' || 
                           process.env.WINDOWS_SERVER === 'true' ||
                           process.env.NODE_ENV?.includes('windows') ||
                           process.env.FORCE_WINDOWS_CLEANUP === 'true';

    if (platform === 'win32' || isWindowsTarget) {
      // Windows commands với enhanced methods
      commands = [
        'cls',                                    // Windows clear screen
        'echo off & cls',                         // Alternative Windows clear
        'powershell Clear-Host',                  // PowerShell clear
        'cmd /c cls',                            // CMD clear via command prompt
        'echo. & cls',                           // Echo newline then clear
        'powershell -Command "Clear-Host"',      // PowerShell one-liner
        'powershell -NoProfile -Command Clear-Host', // Fast PowerShell clear
        'mode con cols=80 lines=25',             // Reset console size and clear
        'powershell -WindowStyle Hidden -Command "Clear-Host"', // Hidden PowerShell
        'clear',                                 // Fallback to Unix clear
        'printf "\\033[2J\\033[H"',             // ANSI escape sequences fallback
      ];
      methods = ['cls', 'echo+cls', 'powershell', 'cmd', 'echo+cls-alt', 'ps-command', 'ps-noprofile', 'mode-reset', 'ps-hidden', 'clear-fallback', 'ansi-fallback'];
    } else if (platform === 'darwin') {
      // macOS specific commands
      commands = [
        'clear',                                 // Standard clear
        'printf "\\033[2J\\033[H"',             // ANSI escape sequences
        'tput clear',                           // Terminfo clear
        'reset',                                // Terminal reset
        'printf "\\033c"',                      // Full terminal reset
        'echo -e "\\033[2J\\033[H"',           // Echo with ANSI codes
        'osascript -e "tell application \\"Terminal\\" to do script \\"clear\\" in front window"', // AppleScript
      ];
      methods = ['clear', 'ansi-seq', 'tput', 'reset', 'full-reset', 'echo-ansi', 'applescript'];
    } else {
      // Linux/Unix commands - mở rộng thêm nhiều phương pháp
      commands = [
        'clear',                                 // Standard clear
        'printf "\\033[2J\\033[H"',             // ANSI escape sequences  
        'tput clear',                           // Terminfo clear
        'reset',                                // Terminal reset
        'printf "\\033c"',                      // Full terminal reset
        'echo -e "\\033[2J\\033[H"',           // Echo with ANSI codes
        'setterm -clear all',                   // Linux setterm clear
        'printf "\\033[H\\033[2J"',            // Alternative ANSI sequence
        'echo -en "\\033[2J\\033[H"',          // Another echo variant
        'tput reset',                          // Reset terminal state
        'stty sane && clear',                  // Sanitize terminal then clear
      ];
      methods = ['clear', 'ansi-seq', 'tput', 'reset', 'full-reset', 'echo-ansi', 'setterm', 'ansi-alt', 'echo-en', 'tput-reset', 'stty-clear'];
    }

    let success = false;
    let successMethod = '';
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      const method = methods[i];
      
      try {
        const result = await execAsync(command, { timeout: 5000 }); // 5 second timeout
        success = true;
        successMethod = method;
        break; // Stop on first successful command
      } catch (error) {
        // Log failed attempt for debugging
        console.log(`[${new Date().toLocaleString('vi-VN')}] ⚠ Method '${method}' failed, trying next...`);
        continue;
      }
    }

    if (success) {
      console.log(`[${new Date().toLocaleString('vi-VN')}] ✓ CMD cleared automatically (${platform}) using method: ${successMethod}`);
    } else {
      console.log(`[${new Date().toLocaleString('vi-VN')}] ⚠ All CMD cleanup methods failed on ${platform} - terminal may not support clearing`);
      
      // Fallback: try to write newlines to create visual separation
      try {
        for (let i = 0; i < 50; i++) {
          console.log(''); // Write 50 empty lines as visual separator
        }
        console.log(`[${new Date().toLocaleString('vi-VN')}] ✓ Fallback: Added visual separation lines`);
      } catch (fallbackError) {
        console.error(`[${new Date().toLocaleString('vi-VN')}] ✗ Even fallback method failed:`, fallbackError);
      }
    }
  } catch (error) {
    console.error(`[${new Date().toLocaleString('vi-VN')}] ✗ CMD cleanup system error:`, error);
  }
}

/**
 * Khởi động service dọn dẹp tự động
 */
export function startCleanupService(): void {
  if (!CLEANUP_ENABLED) {
    console.log('[Cleanup Service] Disabled via environment variable CMD_CLEANUP_ENABLED=false');
    return;
  }

  if (isRunning) {
    console.log('[Cleanup Service] Already running - skipping start');
    return;
  }

  isRunning = true;
  
  // Log platform and configuration info
  console.log(`[Cleanup Service] Starting on platform: ${process.platform}`);
  console.log(`[Cleanup Service] Cleanup interval: ${CLEANUP_INTERVAL_MINUTES} minutes (${CLEANUP_INTERVAL_MS}ms)`);
  
  // Clear immediately on start
  clearCommand().then(() => {
    console.log(`[${new Date().toLocaleString('vi-VN')}] ✓ Initial CMD cleanup completed`);
  }).catch((error) => {
    console.error(`[${new Date().toLocaleString('vi-VN')}] ✗ Initial cleanup failed:`, error);
  });

  // Set up interval using configurable time
  cleanupInterval = setInterval(async () => {
    console.log(`[${new Date().toLocaleString('vi-VN')}] 🔄 Automatic CMD cleanup starting...`);
    await clearCommand();
    updateNextCleanupTime();
    console.log(`[${new Date().toLocaleString('vi-VN')}] ⏰ Next cleanup scheduled for: ${nextCleanupTime?.toLocaleString('vi-VN')}`);
  }, CLEANUP_INTERVAL_MS);

  updateNextCleanupTime();
  console.log(`[Cleanup Service] ✅ Started successfully - running every ${CLEANUP_INTERVAL_MINUTES} minutes`);
  console.log(`[Cleanup Service] Next cleanup at: ${nextCleanupTime?.toLocaleString('vi-VN')}`);
}

/**
 * Dừng service dọn dẹp tự động
 */
export function stopCleanupService(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  
  isRunning = false;
  nextCleanupTime = null;
  console.log('[Cleanup Service] Stopped');
}

/**
 * Kiểm tra trạng thái service
 */
export function getCleanupServiceStatus(): { running: boolean; nextCleanup?: string } {
  return {
    running: isRunning,
    nextCleanup: nextCleanupTime ? nextCleanupTime.toLocaleString('vi-VN') : undefined
  };
}

/**
 * Thực hiện cleanup thủ công
 */
export async function manualCleanup(): Promise<void> {
  console.log(`[${new Date().toLocaleString('vi-VN')}] 🧹 Manual CMD cleanup requested...`);
  await clearCommand();
  console.log(`[${new Date().toLocaleString('vi-VN')}] ✓ Manual CMD cleanup completed`);
}

/**
 * Cập nhật thời gian cleanup tiếp theo
 */
function updateNextCleanupTime(): void {
  if (isRunning) {
    nextCleanupTime = new Date(Date.now() + CLEANUP_INTERVAL_MS);
  }
}

/**
 * Lấy thông tin cấu hình cleanup
 */
export function getCleanupConfig(): { enabled: boolean; intervalMinutes: number; platform: string; running: boolean } {
  return {
    enabled: CLEANUP_ENABLED,
    intervalMinutes: CLEANUP_INTERVAL_MINUTES,
    platform: process.platform,
    running: isRunning
  };
}

/**
 * Force cleanup for Windows Server (có thể gọi từ Linux để test)
 */
export async function forceWindowsCleanup(): Promise<{ success: boolean; method?: string; error?: string }> {
  const windowsCommands = [
    'cls',
    'echo off & cls',
    'powershell Clear-Host',
    'cmd /c cls',
    'echo. & cls',
    'powershell -Command "Clear-Host"',
    'powershell -NoProfile -Command Clear-Host',
    'mode con cols=80 lines=25',
    'powershell -WindowStyle Hidden -Command "Clear-Host"',
    'clear', // Fallback
    'printf "\\033[2J\\033[H"', // ANSI fallback
  ];
  
  const methods = ['cls', 'echo+cls', 'powershell', 'cmd', 'echo+cls-alt', 'ps-command', 'ps-noprofile', 'mode-reset', 'ps-hidden', 'clear-fallback', 'ansi-fallback'];
  
  for (let i = 0; i < windowsCommands.length; i++) {
    try {
      await execAsync(windowsCommands[i], { timeout: 5000 });
      console.log(`[${new Date().toLocaleString('vi-VN')}] ✓ Force Windows cleanup successful using: ${methods[i]}`);
      return { success: true, method: methods[i] };
    } catch (error) {
      console.log(`[${new Date().toLocaleString('vi-VN')}] ⚠ Force Windows method '${methods[i]}' failed, trying next...`);
      continue;
    }
  }
  
  // Fallback với visual separation
  try {
    for (let i = 0; i < 50; i++) {
      console.log('');
    }
    console.log(`[${new Date().toLocaleString('vi-VN')}] ✓ Force Windows cleanup: Used visual separation fallback`);
    return { success: true, method: 'visual-separation' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Test tất cả các phương pháp cleanup và trả về kết quả
 */
export async function testAllCleanupMethods(): Promise<{ platform: string; results: { method: string; success: boolean; error?: string }[] }> {
  const platform = process.platform;
  let commands: string[] = [];
  let methods: string[] = [];

  // Kiểm tra nếu force Windows testing
  const isWindowsTarget = process.env.TARGET_OS === 'windows' || 
                         process.env.WINDOWS_SERVER === 'true' ||
                         process.env.FORCE_WINDOWS_CLEANUP === 'true';

  if (platform === 'win32' || isWindowsTarget) {
    commands = [
      'cls',
      'echo off & cls',
      'powershell Clear-Host',
      'cmd /c cls',
      'echo. & cls',
      'powershell -Command "Clear-Host"',
      'powershell -NoProfile -Command Clear-Host',
      'mode con cols=80 lines=25',
      'powershell -WindowStyle Hidden -Command "Clear-Host"',
      'clear',
      'printf "\\033[2J\\033[H"',
    ];
    methods = ['cls', 'echo+cls', 'powershell', 'cmd', 'echo+cls-alt', 'ps-command', 'ps-noprofile', 'mode-reset', 'ps-hidden', 'clear-fallback', 'ansi-fallback'];
  } else if (platform === 'darwin') {
    commands = [
      'clear',
      'printf "\\033[2J\\033[H"',
      'tput clear',
      'reset',
      'printf "\\033c"',
      'echo -e "\\033[2J\\033[H"',
    ];
    methods = ['clear', 'ansi-seq', 'tput', 'reset', 'full-reset', 'echo-ansi'];
  } else {
    commands = [
      'clear',
      'printf "\\033[2J\\033[H"',
      'tput clear',
      'reset',
      'printf "\\033c"',
      'echo -e "\\033[2J\\033[H"',
      'setterm -clear all',
      'printf "\\033[H\\033[2J"',
      'echo -en "\\033[2J\\033[H"',
      'tput reset',
      'stty sane && clear',
    ];
    methods = ['clear', 'ansi-seq', 'tput', 'reset', 'full-reset', 'echo-ansi', 'setterm', 'ansi-alt', 'echo-en', 'tput-reset', 'stty-clear'];
  }

  const results = [];
  
  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    const method = methods[i];
    
    try {
      await execAsync(command, { timeout: 3000 });
      results.push({ method, success: true });
    } catch (error) {
      results.push({ 
        method, 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  return { platform, results };
}