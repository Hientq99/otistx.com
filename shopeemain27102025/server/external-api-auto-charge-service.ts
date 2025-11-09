import { DatabaseStorage } from './storage';

/**
 * Background Service: Tự động poll OTP và charge user cho External API rentals
 * 
 * Logic:
 * - Chạy mỗi 30 giây
 * - Tìm external API rentals đang "allocated" và chưa có OTP
 * - Poll OTP từ provider
 * - Nếu OTP thành công → Tự động trừ 100đ và update status
 * - Anti-duplicate: Chỉ trừ tiền 1 lần với reference `otp_charge_{sessionId}`
 */

const POLLING_INTERVAL_MS = 1000; // 1 giây - TĂNG TỐC để nhận OTP nhanh (live speed)
const MAX_RENTAL_AGE_MS = 15 * 60 * 1000; // 15 phút - Timeout phù hợp với polling nhanh
const SMART_POLLING_CACHE_TTL = 60 * 1000; // 1 phút cache for empty results
let isServiceRunning = false;
let pollingInterval: NodeJS.Timeout | null = null;
let lastEmptyResultTime = 0; // Smart caching for empty results
let consecutiveEmptyResults = 0; // Track empty result streak

// Import polling functions từ routes.ts (cần export chúng)
async function pollOtpFromViotp(apiKey: string, requestId: string) {
  try {
    const response = await fetch(`https://api.viotp.com/session/getv2?requestId=${encodeURIComponent(requestId)}&token=${encodeURIComponent(apiKey)}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`[AUTO-CHARGE VIOTP] Response for requestId ${requestId}:`, JSON.stringify(data));
      
      if (typeof data !== 'object' || data === null || typeof data.status_code !== 'number' || typeof data.success !== 'boolean' || !data.data || typeof data.data !== 'object') {
        return {
          success: false,
          state: 'error',
          error: `Malformed response structure`
        };
      }
      
      if (data.status_code === 200 && data.success && data.data.Code) {
        return {
          success: true,
          state: 'completed',
          otpCode: data.data.Code.toString(),
          smsContent: data.data.content || null
        };
      } else if (data.status_code === 200 && data.success && !data.data.Code) {
        return {
          success: false,
          state: 'waiting',
          error: 'Chưa có OTP'
        };
      } else {
        return {
          success: false,
          state: 'error',
          error: data.message || 'API error'
        };
      }
    } else {
      return {
        success: false,
        state: 'error',
        error: `HTTP ${response.status}`
      };
    }
  } catch (error) {
    console.error(`[AUTO-CHARGE VIOTP] Error for requestId ${requestId}:`, error);
    return {
      success: false,
      state: 'error',
      error: (error as Error).message
    };
  }
}

async function pollOtpFromChaycodes3(apiKey: string, requestId: string) {
  try {
    const response = await fetch(`https://chaycodeso3.com/api?act=code&apik=${encodeURIComponent(apiKey)}&id=${encodeURIComponent(requestId)}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`[AUTO-CHARGE CHAYCODES3] Response for requestId ${requestId}:`, JSON.stringify(data));
      
      if (typeof data !== 'object' || data === null || typeof data.ResponseCode !== 'number') {
        return {
          success: false,
          state: 'error',
          error: `Malformed response structure`
        };
      }
      
      // Map ResponseCode: 0=completed, 1=waiting, 2=expired
      if (data.ResponseCode === 0 && data.Result && data.Result.Code) {
        return {
          success: true,
          state: 'completed',
          otpCode: data.Result.Code.toString(),
          smsContent: data.Result.Content || null
        };
      } else if (data.ResponseCode === 1) {
        return {
          success: false,
          state: 'waiting',
          error: data.Msg || 'Chưa có OTP'
        };
      } else if (data.ResponseCode === 2) {
        return {
          success: false,
          state: 'expired',
          error: data.Msg || 'Session expired'
        };
      } else {
        return {
          success: false,
          state: 'error',
          error: data.Msg || 'API error'
        };
      }
    } else {
      return {
        success: false,
        state: 'error',
        error: `HTTP ${response.status}`
      };
    }
  } catch (error) {
    console.error(`[AUTO-CHARGE CHAYCODES3] Error for requestId ${requestId}:`, error);
    return {
      success: false,
      state: 'error',
      error: (error as Error).message
    };
  }
}

async function pollOtpFrom365otp(apiKey: string, requestId: string) {
  try {
    const response = await fetch(`https://365otp.com/apiv1/ordercheck?apikey=${encodeURIComponent(apiKey)}&id=${encodeURIComponent(requestId)}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`[AUTO-CHARGE 365OTP] Response for requestId ${requestId}:`, JSON.stringify(data));
      
      if (typeof data !== 'object' || data === null || typeof data.status !== 'number' || !data.data || typeof data.data !== 'object') {
        return {
          success: false,
          state: 'error',
          error: `Malformed response structure`
        };
      }
      
      if (data.status === 1 && data.data.code) {
        return {
          success: true,
          state: 'completed',
          otpCode: data.data.code.toString(),
          smsContent: data.data.content || null
        };
      } else if (data.status === 1 && !data.data.code) {
        return {
          success: false,
          state: 'waiting',
          error: 'Chưa có OTP'
        };
      } else {
        return {
          success: false,
          state: 'error',
          error: data.message || 'API error'
        };
      }
    } else {
      return {
        success: false,
        state: 'error',
        error: `HTTP ${response.status}`
      };
    }
  } catch (error) {
    console.error(`[AUTO-CHARGE 365OTP] Error for requestId ${requestId}:`, error);
    return {
      success: false,
      state: 'error',
      error: (error as Error).message
    };
  }
}

async function pollOtpFromFunOtp(apiKey: string, requestId: string) {
  try {
    const response = await fetch(`https://funotp.com/api?action=code&id=${encodeURIComponent(requestId)}&apikey=${encodeURIComponent(apiKey)}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`[AUTO-CHARGE FUNOTP] Response for requestId ${requestId}:`, JSON.stringify(data));
      
      if (typeof data !== 'object' || data === null || typeof data.status !== 'number') {
        return {
          success: false,
          state: 'error',
          error: `Malformed response structure`
        };
      }
      
      if (data.status === 1 && data.code) {
        return {
          success: true,
          state: 'completed',
          otpCode: data.code.toString(),
          smsContent: data.content || null
        };
      } else if (data.status === 1 && !data.code) {
        return {
          success: false,
          state: 'waiting',
          error: 'Chưa có OTP'
        };
      } else {
        return {
          success: false,
          state: 'error',
          error: data.message || 'API error'
        };
      }
    } else {
      return {
        success: false,
        state: 'error',
        error: `HTTP ${response.status}`
      };
    }
  } catch (error) {
    console.error(`[AUTO-CHARGE FUNOTP] Error for requestId ${requestId}:`, error);
    return {
      success: false,
      state: 'error',
      error: (error as Error).message
    };
  }
}

async function pollOtpFromIronSim(apiKey: string, requestId: string) {
  try {
    const response = await fetch(`https://ironsim.com/api/v1/otp-sessions/${encodeURIComponent(requestId)}?api_key=${encodeURIComponent(apiKey)}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`[AUTO-CHARGE IRONSIM] Response for requestId ${requestId}:`, JSON.stringify(data));
      
      if (typeof data !== 'object' || data === null || typeof data.success !== 'boolean') {
        return {
          success: false,
          state: 'error',
          error: `Malformed response structure`
        };
      }
      
      if (data.success && data.data && data.data.otp_code) {
        return {
          success: true,
          state: 'completed',
          otpCode: data.data.otp_code.toString(),
          smsContent: data.data.sms_content || null
        };
      } else if (data.success && data.data && !data.data.otp_code) {
        return {
          success: false,
          state: 'waiting',
          error: 'Chưa có OTP'
        };
      } else {
        return {
          success: false,
          state: 'error',
          error: data.message || 'API error'
        };
      }
    } else {
      return {
        success: false,
        state: 'error',
        error: `HTTP ${response.status}`
      };
    }
  } catch (error) {
    console.error(`[AUTO-CHARGE IRONSIM] Error for requestId ${requestId}:`, error);
    return {
      success: false,
      state: 'error',
      error: (error as Error).message
    };
  }
}

async function pollOtpFromBossOtp(apiKey: string, requestId: string) {
  try {
    const response = await fetch(`https://bossotp.net/api/get-otp?id=${encodeURIComponent(requestId)}&apikey=${encodeURIComponent(apiKey)}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`[AUTO-CHARGE BOSSOTP] Response for requestId ${requestId}:`, JSON.stringify(data));
      
      if (typeof data !== 'object' || data === null || typeof data.status !== 'number') {
        return {
          success: false,
          state: 'error',
          error: `Malformed response structure`
        };
      }
      
      if (data.status === 1 && data.otp) {
        return {
          success: true,
          state: 'completed',
          otpCode: data.otp.toString(),
          smsContent: data.sms || null
        };
      } else if (data.status === 1 && !data.otp) {
        return {
          success: false,
          state: 'waiting',
          error: 'Chưa có OTP'
        };
      } else {
        return {
          success: false,
          state: 'error',
          error: data.message || 'API error'
        };
      }
    } else {
      return {
        success: false,
        state: 'error',
        error: `HTTP ${response.status}`
      };
    }
  } catch (error) {
    console.error(`[AUTO-CHARGE BOSSOTP] Error for requestId ${requestId}:`, error);
    return {
      success: false,
      state: 'error',
      error: (error as Error).message
    };
  }
}

async function pollOtpFromProvider(provider: string, apiKey: string, requestId: string) {
  switch (provider) {
    case "viotp":
      return await pollOtpFromViotp(apiKey, requestId);
    case "chaycodes3":
      return await pollOtpFromChaycodes3(apiKey, requestId);
    case "365otp":
      return await pollOtpFrom365otp(apiKey, requestId);
    case "funotp":
      return await pollOtpFromFunOtp(apiKey, requestId);
    case "ironsim":
      return await pollOtpFromIronSim(apiKey, requestId);
    case "bossotp":
      return await pollOtpFromBossOtp(apiKey, requestId);
    default:
      return { success: false, error: `Unsupported provider: ${provider}` };
  }
}

/**
 * Main function: Check và charge external API rentals
 */
async function checkAndChargeExternalApiRentals(storage: DatabaseStorage) {
  try {
    // 🚀 SMART POLLING: Skip query if recent empty results
    const now = Date.now();
    if (consecutiveEmptyResults >= 3 && (now - lastEmptyResultTime) < SMART_POLLING_CACHE_TTL) {
      const remainingTime = Math.ceil((SMART_POLLING_CACHE_TTL - (now - lastEmptyResultTime)) / 1000);
      console.log(`[AUTO-CHARGE] 🚀 SMART SKIP: ${consecutiveEmptyResults} consecutive empty results, skipping query for ${remainingTime}s`);
      return;
    }

    console.log(`[AUTO-CHARGE] Starting check for external API rentals...`);
    
    // 1. Lấy tất cả external API rentals đang chờ OTP
    const pendingRentals = await storage.getExternalApiRentalsByStatus('allocated');
    
    if (pendingRentals.length === 0) {
      consecutiveEmptyResults++;
      lastEmptyResultTime = now;
      
      // Only log every few checks to reduce noise
      if (consecutiveEmptyResults <= 3 || consecutiveEmptyResults % 5 === 0) {
        console.log(`[AUTO-CHARGE] No pending external API rentals found (${consecutiveEmptyResults} consecutive)`);
      }
      return;
    }
    
    // Reset empty results counter when we find pending rentals
    consecutiveEmptyResults = 0;
    
    console.log(`[AUTO-CHARGE] Found ${pendingRentals.length} pending rentals`);
    
    for (const rental of pendingRentals) {
      try {
        // 2. Kiểm tra tuổi của rental (không poll quá 30 phút)
        const rentalAge = Date.now() - new Date(rental.createdAt).getTime();
        if (rentalAge > MAX_RENTAL_AGE_MS) {
          console.log(`[AUTO-CHARGE] Rental ${rental.sessionId} is too old (${Math.round(rentalAge/60000)} minutes), skipping`);
          continue;
        }
        
        // 3. Kiểm tra đã có OTP chưa
        if (rental.otpCode) {
          console.log(`[AUTO-CHARGE] Rental ${rental.sessionId} already has OTP, skipping`);
          continue;
        }
        
        // 4. Lấy API key cho provider
        const apiKey = await storage.getExternalApiKeyByUserAndProvider(rental.userId, rental.provider);
        if (!apiKey || !apiKey.isActive) {
          console.log(`[AUTO-CHARGE] No active API key for user ${rental.userId} provider ${rental.provider}, skipping rental ${rental.sessionId}`);
          continue;
        }
        
        // 5. Poll OTP từ provider
        console.log(`[AUTO-CHARGE] Polling OTP for rental ${rental.sessionId} from ${rental.provider}...`);
        const otpResult = await pollOtpFromProvider(rental.provider, apiKey.keyValue, rental.providerRequestId!);
        
        // 6. Nếu có OTP thành công → Charge user và update status
        if (otpResult.success && 'state' in otpResult && otpResult.state === 'completed' && 'otpCode' in otpResult && otpResult.otpCode) {
          console.log(`[AUTO-CHARGE] ✅ OTP received for rental ${rental.sessionId}: ${otpResult.otpCode}`);
          
          // 7. ANTI-DUPLICATE: Kiểm tra đã charge chưa
          const existingCharge = await storage.getTransactionByReference(`otp_charge_${rental.sessionId}`);
          
          if (!existingCharge) {
            console.log(`[AUTO-CHARGE] Charging user ${rental.userId} 100đ for OTP session ${rental.sessionId}`);
            
            // 8. Charge user 100 VND
            const chargeTransaction = await storage.createTransaction({
              userId: rental.userId,
              type: 'external_api_otp',
              amount: "-100", // Trừ 100 VND
              reference: `otp_charge_${rental.sessionId}`,
              description: `[AUTO] Phí nhận OTP từ ${rental.provider} - ${rental.phoneNumber}`,
              relatedId: rental.id.toString()
            });
            
            console.log(`[AUTO-CHARGE] ✅ Successfully charged user ${rental.userId} 100đ (transaction ID: ${chargeTransaction.id})`);
          } else {
            console.log(`[AUTO-CHARGE] User ${rental.userId} already charged for session ${rental.sessionId}, skipping charge`);
          }
          
          // 9. Update rental với OTP
          await storage.updateExternalApiRental(rental.sessionId, {
            otpCode: otpResult.otpCode,
            smsContent: otpResult.smsContent,
            completedAt: new Date(),
            status: "completed"
          });
          
          // 10. Log activity
          await storage.createActivity({
            description: `[AUTO-CHARGE] OTP received from ${rental.provider} for ${rental.phoneNumber}${!existingCharge ? ' (100đ charged)' : ' (already charged)'}`,
            type: 'success'
          });
          
          console.log(`[AUTO-CHARGE] ✅ Completed processing rental ${rental.sessionId}`);
        } else if ('state' in otpResult && otpResult.state === 'waiting') {
          console.log(`[AUTO-CHARGE] Still waiting for OTP for rental ${rental.sessionId}`);
        } else if ('state' in otpResult && otpResult.state === 'expired') {
          console.log(`[AUTO-CHARGE] Rental ${rental.sessionId} expired at provider, updating status`);
          
          await storage.updateExternalApiRental(rental.sessionId, {
            status: "expired",
            errorMessage: otpResult.error || 'Session expired at provider'
          });
        } else {
          console.log(`[AUTO-CHARGE] Error polling OTP for rental ${rental.sessionId}: ${otpResult.error}`);
        }
        
      } catch (rentalError) {
        console.error(`[AUTO-CHARGE] Error processing rental ${rental.sessionId}:`, rentalError);
      }
    }
    
    console.log(`[AUTO-CHARGE] Check completed`);
    
  } catch (error) {
    console.error(`[AUTO-CHARGE] Service error:`, error);
  }
}

/**
 * Khởi động service
 */
export function startExternalApiAutoChargeService(storage: DatabaseStorage) {
  if (isServiceRunning) {
    console.log('[AUTO-CHARGE] Service đã được khởi động trước đó');
    return;
  }
  
  console.log(`[AUTO-CHARGE] Starting External API Auto Charge Service...`);
  console.log(`[AUTO-CHARGE] Polling interval: ${POLLING_INTERVAL_MS/1000} seconds`);
  console.log(`[AUTO-CHARGE] Max rental age: ${MAX_RENTAL_AGE_MS/60000} minutes`);
  
  // Chạy lần đầu sau 10 giây (để server khởi động xong)
  setTimeout(() => {
    checkAndChargeExternalApiRentals(storage);
  }, 10000);
  
  // Sau đó chạy theo interval
  pollingInterval = setInterval(() => {
    checkAndChargeExternalApiRentals(storage);
  }, POLLING_INTERVAL_MS);
  
  isServiceRunning = true;
  console.log('[AUTO-CHARGE] ✅ Service started successfully');
}

/**
 * Dừng service
 */
export function stopExternalApiAutoChargeService() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  isServiceRunning = false;
  console.log('[AUTO-CHARGE] Service stopped');
}

/**
 * Kiểm tra trạng thái service
 */
export function isExternalApiAutoChargeServiceRunning(): boolean {
  return isServiceRunning;
}