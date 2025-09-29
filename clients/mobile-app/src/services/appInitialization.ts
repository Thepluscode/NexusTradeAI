import { Platform, PermissionsAndroid } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import NetInfo from '@react-native-community/netinfo';
import PushNotification from 'react-native-push-notification';
import Orientation from 'react-native-orientation-locker';

import { store } from '../store/store';
import { setDeviceInfo, setNetworkStatus } from '../store/slices/appSlice';
import { loadUserFromStorage } from '../store/slices/authSlice';

/**
 * Initialize the mobile application
 * Sets up device info, network monitoring, push notifications, etc.
 */
export const initializeApp = async (): Promise<void> => {
  try {
    console.log('🚀 Initializing NexusTrade Mobile App...');

    // Initialize device information
    await initializeDeviceInfo();

    // Setup network monitoring
    initializeNetworkMonitoring();

    // Setup push notifications
    await initializePushNotifications();

    // Setup orientation lock
    initializeOrientation();

    // Load persisted user data
    await loadPersistedData();

    // Setup error handling
    initializeErrorHandling();

    console.log('✅ App initialization completed successfully');
  } catch (error) {
    console.error('❌ App initialization failed:', error);
  }
};

/**
 * Initialize device information
 */
const initializeDeviceInfo = async (): Promise<void> => {
  try {
    const deviceInfo = {
      deviceId: await DeviceInfo.getUniqueId(),
      deviceName: await DeviceInfo.getDeviceName(),
      brand: DeviceInfo.getBrand(),
      model: DeviceInfo.getModel(),
      systemName: DeviceInfo.getSystemName(),
      systemVersion: DeviceInfo.getSystemVersion(),
      appVersion: DeviceInfo.getVersion(),
      buildNumber: DeviceInfo.getBuildNumber(),
      bundleId: DeviceInfo.getBundleId(),
      isTablet: DeviceInfo.isTablet(),
      hasNotch: DeviceInfo.hasNotch(),
      isEmulator: await DeviceInfo.isEmulator(),
      totalMemory: await DeviceInfo.getTotalMemory(),
      usedMemory: await DeviceInfo.getUsedMemory(),
      batteryLevel: await DeviceInfo.getBatteryLevel(),
      isLandscape: await DeviceInfo.isLandscape(),
      carrier: await DeviceInfo.getCarrier(),
      ipAddress: await DeviceInfo.getIpAddress(),
      macAddress: await DeviceInfo.getMacAddress(),
      userAgent: await DeviceInfo.getUserAgent(),
    };

    store.dispatch(setDeviceInfo(deviceInfo));
    console.log('📱 Device info initialized:', deviceInfo);
  } catch (error) {
    console.error('Failed to initialize device info:', error);
  }
};

/**
 * Initialize network monitoring
 */
const initializeNetworkMonitoring = (): void => {
  // Subscribe to network state changes
  const unsubscribe = NetInfo.addEventListener(state => {
    store.dispatch(setNetworkStatus({
      isConnected: state.isConnected,
      type: state.type,
      isInternetReachable: state.isInternetReachable,
      details: state.details,
    }));
  });

  // Get initial network state
  NetInfo.fetch().then(state => {
    store.dispatch(setNetworkStatus({
      isConnected: state.isConnected,
      type: state.type,
      isInternetReachable: state.isInternetReachable,
      details: state.details,
    }));
  });

  console.log('🌐 Network monitoring initialized');
};

/**
 * Initialize push notifications
 */
const initializePushNotifications = async (): Promise<void> => {
  try {
    // Request permissions
    if (Platform.OS === 'android') {
      await requestAndroidNotificationPermissions();
    }

    // Configure push notifications
    PushNotification.configure({
      onRegister: function(token) {
        console.log('📱 Push notification token:', token);
        // Store token for server registration
      },

      onNotification: function(notification) {
        console.log('📬 Push notification received:', notification);
        
        // Handle notification tap
        if (notification.userInteraction) {
          // Navigate to appropriate screen based on notification data
          handleNotificationTap(notification);
        }
      },

      onAction: function(notification) {
        console.log('📬 Push notification action:', notification);
      },

      onRegistrationError: function(err) {
        console.error('📱 Push notification registration error:', err);
      },

      permissions: {
        alert: true,
        badge: true,
        sound: true,
      },

      popInitialNotification: true,
      requestPermissions: Platform.OS === 'ios',
    });

    // Create notification channels for Android
    if (Platform.OS === 'android') {
      createNotificationChannels();
    }

    console.log('📱 Push notifications initialized');
  } catch (error) {
    console.error('Failed to initialize push notifications:', error);
  }
};

/**
 * Request Android notification permissions
 */
const requestAndroidNotificationPermissions = async (): Promise<void> => {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log('📱 Notification permission granted');
      } else {
        console.log('📱 Notification permission denied');
      }
    } catch (error) {
      console.error('Failed to request notification permissions:', error);
    }
  }
};

/**
 * Create notification channels for Android
 */
const createNotificationChannels = (): void => {
  PushNotification.createChannel(
    {
      channelId: 'price-alerts',
      channelName: 'Price Alerts',
      channelDescription: 'Notifications for price alerts',
      playSound: true,
      soundName: 'default',
      importance: 4,
      vibrate: true,
    },
    (created) => console.log(`Price alerts channel created: ${created}`)
  );

  PushNotification.createChannel(
    {
      channelId: 'trade-updates',
      channelName: 'Trade Updates',
      channelDescription: 'Notifications for trade executions and updates',
      playSound: true,
      soundName: 'default',
      importance: 4,
      vibrate: true,
    },
    (created) => console.log(`Trade updates channel created: ${created}`)
  );

  PushNotification.createChannel(
    {
      channelId: 'news-updates',
      channelName: 'News Updates',
      channelDescription: 'Market news and updates',
      playSound: false,
      importance: 3,
      vibrate: false,
    },
    (created) => console.log(`News updates channel created: ${created}`)
  );
};

/**
 * Handle notification tap
 */
const handleNotificationTap = (notification: any): void => {
  // This would typically use navigation service
  // For now, just log the notification
  console.log('Handling notification tap:', notification);
};

/**
 * Initialize orientation settings
 */
const initializeOrientation = (): void => {
  // Lock to portrait mode by default
  Orientation.lockToPortrait();
  
  console.log('📱 Orientation locked to portrait');
};

/**
 * Load persisted data
 */
const loadPersistedData = async (): Promise<void> => {
  try {
    // Load user data from storage
    await store.dispatch(loadUserFromStorage());
    
    console.log('💾 Persisted data loaded');
  } catch (error) {
    console.error('Failed to load persisted data:', error);
  }
};

/**
 * Initialize global error handling
 */
const initializeErrorHandling = (): void => {
  // Global error handler for unhandled promise rejections
  const originalHandler = global.ErrorUtils?.getGlobalHandler?.();
  
  global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
    console.error('🚨 Global error:', error, 'Fatal:', isFatal);
    
    // Log to crash reporting service (e.g., Crashlytics)
    // crashlytics().recordError(error);
    
    // Call original handler
    originalHandler?.(error, isFatal);
  });

  // Handle unhandled promise rejections
  const rejectionHandler = (reason: any, promise: Promise<any>) => {
    console.error('🚨 Unhandled promise rejection:', reason);
    
    // Log to crash reporting service
    // crashlytics().log('Unhandled promise rejection: ' + reason);
  };

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('unhandledrejection', rejectionHandler);
  }

  console.log('🛡️ Error handling initialized');
};

/**
 * Cleanup function for app termination
 */
export const cleanupApp = (): void => {
  console.log('🧹 Cleaning up app resources...');
  
  // Cancel all notifications
  PushNotification.cancelAllLocalNotifications();
  
  // Unlock orientation
  Orientation.unlockAllOrientations();
  
  console.log('✅ App cleanup completed');
};
