/**
 * Notification utilities for OTP success and other events
 */

// Sound notification function
export const playNotificationSound = () => {
  try {
    // Create audio context for better browser support
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create oscillator for beep sound
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Configure sound (pleasant notification beep)
    oscillator.frequency.value = 800; // Hz
    oscillator.type = 'sine';
    
    // Fade in/out for smooth sound
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch (error) {
    console.warn('Could not play notification sound:', error);
  }
};

// Browser notification function
export const showBrowserNotification = async (title: string, options?: NotificationOptions) => {
  // Check if browser supports notifications
  if (!('Notification' in window)) {
    console.warn('Browser does not support notifications');
    return;
  }

  // Request permission if not granted
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }

  // Show notification if permission granted
  if (Notification.permission === 'granted') {
    try {
      const notification = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        vibrate: [200, 100, 200], // Vibration pattern on mobile
        requireInteraction: false,
        ...options
      });

      // Auto close after 5 seconds
      setTimeout(() => notification.close(), 5000);

      return notification;
    } catch (error) {
      console.warn('Could not show browser notification:', error);
    }
  }
};

// Combined notification (sound + browser)
export const notifyOtpSuccess = (otpCode: string, phoneNumber?: string) => {
  // Play sound
  playNotificationSound();

  // Show browser notification
  showBrowserNotification('🎉 OTP đã về!', {
    body: phoneNumber 
      ? `Số ${phoneNumber}\nMã OTP: ${otpCode}`
      : `Mã OTP: ${otpCode}`,
    tag: 'otp-success',
    renotify: true
  });
};

// Request notification permission on app load
export const requestNotificationPermission = async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch (error) {
      console.warn('Could not request notification permission:', error);
    }
  }
};

// Haptic feedback for mobile
export const triggerHapticFeedback = (pattern: number | number[] = 50) => {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (error) {
      console.warn('Could not trigger haptic feedback:', error);
    }
  }
};
