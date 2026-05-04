import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Vibration,
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import EmployeeProfileScreen from './screens/EmployeeProfileScreen';
import ScheduleMeetingScreen from './screens/ScheduleMeetingScreen';

// IMPORTANT: Replace with your computer's local IP address when running on a physical device.
const BASE_URL = "https://stpi-vms-backend.onrender.com";
const API_BASE = `${BASE_URL}/api`;
const VISITOR_ALERT_CHANNEL_ID = 'visitor-alerts-v3';
const LEGACY_VISITOR_ALERT_CHANNEL_ID = 'visitor-alerts-v2';
const VISITOR_ALERT_CATEGORY_ID = 'visitorrequestactions';
const APPROVE_ACTION_ID = 'VISITOR_APPROVE';
const REJECT_ACTION_ID = 'VISITOR_REJECT';
const NOTIFICATION_SOUND = require('./assets/sounds/notification.mp3');

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const normalizeVisitorPayload = (data = {}) => ({
  type: data.type || '',
  visitorId: data.visitorId || data._id || '',
  name: data.name || 'Unknown Visitor',
  phone: data.phone || 'N/A',
  email: data.email || '',
  company: data.company || '',
  visitorDesignation: data.visitorDesignation || '',
  purpose: data.purpose || 'N/A',
  description: data.description || data.message || '',
  employeeId: data.employeeId || '',
  employeeName: data.employeeName || '',
  department: data.department || '',
  employeeDesignation: data.employeeDesignation || '',
  status: data.status || 'pending',
  visitDate: data.visitDate || new Date().toISOString(),
  checkInTime: data.checkInTime || new Date().toISOString(),
  checkOutTime: data.checkOutTime || null,
  photoUrl: data.photoUrl || '',
  message: data.message || '',
  place: data.place || '',
  visitorCount: data.visitorCount || 1,
});

export default function App() {
  const [employee, setEmployee] = useState(null);
  const [visitors, setVisitors] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [appAssetsReady, setAppAssetsReady] = useState(false);
  const [notificationActionLoading, setNotificationActionLoading] = useState(false);

  // Dashboard Tabs
  const [activeTab, setActiveTab] = useState('current');
  const [search, setSearch] = useState('');
  const [currentScreen, setCurrentScreen] = useState('profile'); // profile, dashboard, schedule

  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Existing modal state
  const [reviewingVisitor, setReviewingVisitor] = useState(null);
  const [message, setMessage] = useState('');

  // Notification state
  const [incomingVisitorRequest, setIncomingVisitorRequest] = useState(null);
  const [pushToken, setPushToken] = useState('');

  // Ask to Wait state
  const [showWaitModal, setShowWaitModal] = useState(false);
  const [selectedWaitTime, setSelectedWaitTime] = useState(5);

  // Reject with Reason state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedRejectReason, setSelectedRejectReason] = useState('');
  const [customRejectMessage, setCustomRejectMessage] = useState('');

  // Referral state
  const [showReferModal, setShowReferModal] = useState(false);
  const [referPurpose, setReferPurpose] = useState('');
  const [referEmployeeId, setReferEmployeeId] = useState('');

  const REJECT_REASONS = [
    'I am currently in a meeting',
    'I am not available right now',
    'I am on leave today',
    'Please reschedule your visit',
    'I am working on urgent tasks',
    'Not available at this time, try later',
    'Kindly contact me before visiting',
  ];

  const alarmSoundRef = useRef(null);
  const notificationReceivedSubscription = useRef(null);
  const notificationResponseSubscription = useRef(null);

  useEffect(() => {
    loadAppAssets();
    checkAuth();
    initializeNotifications();

    return () => {
      notificationReceivedSubscription.current?.remove();
      notificationResponseSubscription.current?.remove();
      stopAlarmSound();
    };
  }, []);

  const loadAppAssets = async () => {
    try {
      // Load Ionicons font
      await Font.loadAsync({
        'ionicons': require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'),
      });

      // Configure audio for high-priority notification ringing
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        playThroughEarpieceAndroid: false,
      });
      
      console.log('App assets loaded successfully');
    } catch (error) {
      console.error('App asset preload failed:', error);
    } finally {
      setAppAssetsReady(true);
    }
  };

  useEffect(() => {
    axios.get(`${API_BASE}/employees`)
      .then(res => setEmployees(res.data))
      .catch(err => console.error("Employee fetch error:", err));
  }, []);

  useEffect(() => {
    let interval;
    if (employee && !reviewingVisitor && !incomingVisitorRequest) {
      fetchVisitors(employee._id);
      interval = setInterval(() => fetchVisitors(employee._id), 3000);
    }
    return () => clearInterval(interval);
  }, [employee, reviewingVisitor, incomingVisitorRequest]);

  useEffect(() => {
    if (employee?._id) {
      syncPushToken(employee);
    }
  }, [employee?._id]);

  const initializeNotifications = async () => {
    try {
      if (Platform.OS === 'android') {
        // Delete the channel first so Android is forced to re-apply all settings.
        // Android IGNORES changes to an existing channel once created.
        await Notifications.deleteNotificationChannelAsync(LEGACY_VISITOR_ALERT_CHANNEL_ID).catch(() => { });
        await Notifications.deleteNotificationChannelAsync(VISITOR_ALERT_CHANNEL_ID).catch(() => { });

        await Notifications.setNotificationChannelAsync(VISITOR_ALERT_CHANNEL_ID, {
          name: 'Visitor Alerts',
          description: 'Urgent visitor approval requests',
          importance: Notifications.AndroidImportance.MAX,
          sound: 'notification', // Matches android/app/src/main/res/raw/notification.mp3
          vibrationPattern: [0, 400, 300, 400, 300, 500],
          enableVibrate: true,
          enableLights: true,
          lightColor: '#ef4444',
          showBadge: true,
          bypassDnd: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          audioAttributes: {
            usage: Notifications.AndroidAudioUsage.NOTIFICATION,
            contentType: Notifications.AndroidAudioContentType.SONIFICATION,
          },
        });
      }

      await Notifications.setNotificationCategoryAsync(VISITOR_ALERT_CATEGORY_ID, [
        {
          identifier: APPROVE_ACTION_ID,
          buttonTitle: 'Approve',
          options: { opensAppToForeground: true },
        },
        {
          identifier: REJECT_ACTION_ID,
          buttonTitle: 'Reject',
          options: { opensAppToForeground: true },
        },
      ]);

      notificationReceivedSubscription.current =
        Notifications.addNotificationReceivedListener((notification) => {
          void handleIncomingNotification(notification);
        });

      notificationResponseSubscription.current =
        Notifications.addNotificationResponseReceivedListener((response) => {
          void handleNotificationResponse(response);
        });

      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      if (lastResponse) {
        await handleNotificationResponse(lastResponse);
      }
    } catch (error) {
      console.error('Notification initialization error:', error);
    }
  };

  const registerForPushNotificationsAsync = async () => {
    // Channel is fully managed in initializeNotifications(); no need to recreate here.
    if (!Device.isDevice) {
      return '';
    }

    const permissions = await Notifications.getPermissionsAsync();
    let finalStatus = permissions.status;

    if (finalStatus !== 'granted') {
      const request = await Notifications.requestPermissionsAsync();
      finalStatus = request.status;
    }

    if (finalStatus !== 'granted') {
      return '';
    }

    // Use native FCM device token so backend can send directly via Firebase Admin SDK.
    // This bypasses the Expo push gateway (which requires uploading FCM credentials to Expo).
    const tokenData = await Notifications.getDevicePushTokenAsync();
    console.log('📱 FCM Device Token:', tokenData.data);
    return tokenData.data;
  };

  const syncPushToken = async (employeeRecord) => {
    try {
      const token = await registerForPushNotificationsAsync();
      setPushToken(token);

      await axios.put(`${API_BASE}/employees/${employeeRecord._id}/push-token`, {
        expoPushToken: token || '',
      });
    } catch (error) {
      console.error('Push token sync failed:', error);
    }
  };

  const clearPushToken = async (employeeId) => {
    if (!employeeId) {
      return;
    }

    try {
      await axios.put(`${API_BASE}/employees/${employeeId}/push-token`, {
        expoPushToken: '',
      });
      setPushToken('');
    } catch (error) {
      console.error('Push token clear failed:', error);
    }
  };

  const playAlarmSound = async () => {
    const VIBRATION_PATTERN = [0, 500, 500, 500];
    Vibration.vibrate(VIBRATION_PATTERN, true);

    try {
      if (alarmSoundRef.current) {
        await alarmSoundRef.current.stopAsync().catch(() => { });
        await alarmSoundRef.current.unloadAsync().catch(() => { });
        alarmSoundRef.current = null;
      }

      // Check if asset is available
      const { sound } = await Audio.Sound.createAsync(
        NOTIFICATION_SOUND,
        {
          shouldPlay: true,
          isLooping: true,
          volume: 1.0,
        }
      );

      alarmSoundRef.current = sound;
      console.log('Alarm sound and vibration started');
    } catch (error) {
      console.error('Alarm sound playback failed:', error);
      // Fallback: Just vibration if sound fails
      Vibration.vibrate(VIBRATION_PATTERN, true);
    }

    // Safety timeout: stop after 2 minutes
    setTimeout(() => stopAlarmSound(), 120000);
  };

  const stopAlarmSound = async () => {
    Vibration.cancel();
    if (alarmSoundRef.current) {
      try {
        await alarmSoundRef.current.stopAsync();
        await alarmSoundRef.current.unloadAsync();
      } catch (err) {
        console.log('Error stopping sound:', err);
      }
    }
    alarmSoundRef.current = null;
    console.log('Alarm stopped');
  };

  const presentIncomingVisitorRequest = async (payload) => {
    if (!payload?.visitorId) {
      return;
    }

    setIncomingVisitorRequest(payload);
    await playAlarmSound();
    if (employee?._id) {
      fetchVisitors(employee._id);
    }
  };

  const handleIncomingNotification = async (notification) => {
    console.log("Full Notification Received:", JSON.stringify(notification, null, 2));
    const data = notification?.request?.content?.data || notification?.request?.trigger?.remoteMessage?.data || {};
    const type = data.type;
    console.log("Extracted Notification Type:", type);

    const payload = normalizeVisitorPayload(data);

    if (type === 'scheduled_visitor') {
      console.log("Displaying Alert for scheduled visitor");
      Alert.alert(
        "Visitor Arrived",
        "Your scheduled visitor has arrived"
      );
      if (employee?._id) {
        fetchVisitors(employee._id);
      }
      return;
    }

    if (type === 'visitor_request') {
      await presentIncomingVisitorRequest(payload);
    }
  };

  const handleNotificationResponse = async (response) => {
    if (!response?.notification) {
      return;
    }

    console.log("Full Notification Response Received:", JSON.stringify(response, null, 2));
    const data = response.notification.request.content.data || response.notification.request.trigger?.remoteMessage?.data || {};
    const type = data.type;
    console.log("Extracted Response Type:", type);

    const payload = normalizeVisitorPayload(data);
    if (type !== 'visitor_request' && type !== 'scheduled_visitor') {
      return;
    }

    const notificationIdentifier = response.notification.request.identifier;

    if (response.actionIdentifier === APPROVE_ACTION_ID) {
      await processVisitorDecision(payload, 'approved', notificationIdentifier);
    } else if (response.actionIdentifier === REJECT_ACTION_ID) {
      await processVisitorDecision(payload, 'rejected', notificationIdentifier);
    } else {
      await Notifications.dismissNotificationAsync(notificationIdentifier).catch(() => { });
      if (type !== 'scheduled_visitor') {
        await presentIncomingVisitorRequest(payload);
      }
    }

    if (typeof Notifications.clearLastNotificationResponseAsync === 'function') {
      await Notifications.clearLastNotificationResponseAsync();
    }
  };

  const processVisitorDecision = async (visitorData, status, notificationIdentifier) => {
    if (!visitorData?.visitorId) {
      return;
    }

    setNotificationActionLoading(true);

    try {
      const endpoint = status === 'approved' ? 'approve' : 'reject';
      await axios.post(`${API_BASE}/visitors/${visitorData.visitorId}/${endpoint}`, {
        message: '',
      });

      await stopAlarmSound();
      setIncomingVisitorRequest(null);
      setReviewingVisitor((current) =>
        current?._id === visitorData.visitorId ? null : current
      );
      setMessage('');

      if (notificationIdentifier) {
        await Notifications.dismissNotificationAsync(notificationIdentifier).catch(() => { });
      }

      if (employee?._id) {
        fetchVisitors(employee._id);
      }
    } catch (error) {
      console.error('Visitor action failed:', error);
      Alert.alert('Error', 'Failed to update visitor request');
    } finally {
      setNotificationActionLoading(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!incomingVisitorRequest?.visitorId) return;

    const finalMessage = customRejectMessage.trim() || selectedRejectReason;

    if (!finalMessage) {
      return Alert.alert('Error', 'Please select a reason or write a custom message');
    }

    setNotificationActionLoading(true);
    try {
      await axios.post(`${API_BASE}/visitors/${incomingVisitorRequest.visitorId}/reject`, {
        message: finalMessage,
      });

      await stopAlarmSound();
      setIncomingVisitorRequest(null);
      setShowRejectModal(false);
      setSelectedRejectReason('');
      setCustomRejectMessage('');

      if (employee?._id) {
        fetchVisitors(employee._id);
      }
    } catch (error) {
      console.error('Reject with reason failed:', error);
      Alert.alert('Error', 'Failed to reject visitor');
    } finally {
      setNotificationActionLoading(false);
    }
  };

  const handleMeetingEnd = async (visitorId) => {
    if (!visitorId) {
      Alert.alert('Error', 'Invalid visitor ID');
      return;
    }
    setLoading(true);
    try {
      await axios.put(`${API_BASE}/visitors/${visitorId}/meeting-end`, {});
      Alert.alert('Success', 'Meeting ended successfully');
      setReviewingVisitor(null);
      if (employee?._id) fetchVisitors(employee._id);
    } catch (error) {
      console.error('Meeting end failed:', error);
      Alert.alert('Error', 'Failed to end meeting');
    } finally {
      setLoading(false);
    }
  };

  const handleReferSubmit = async () => {
    if (!reviewingVisitor || !referEmployeeId || !referPurpose) {
      return Alert.alert('Error', 'Please select an employee and state the purpose');
    }

    setLoading(true);
    try {
      const targetEmployee = employees?.find(e => e._id === referEmployeeId);

      if (!targetEmployee) {
        Alert.alert("Error", "Selected employee not found");
        return;
      }

      // 1. End current meeting and mark who it was referred to
      await axios.put(`${API_BASE}/visitors/${reviewingVisitor._id}/meeting-end`, {
        referredTo: targetEmployee?.name || ''
      });

      // 2. Create referral request
      const data = new FormData();
      data.append('name', reviewingVisitor.name);
      data.append('phone', reviewingVisitor.phone);
      data.append('email', reviewingVisitor.email || '');
      data.append('company', reviewingVisitor.company || '');
      data.append('visitorDesignation', reviewingVisitor.visitorDesignation || '');
      data.append('purpose', referPurpose);
      data.append('employeeId', referEmployeeId);

      data.append('employeeName', targetEmployee?.name || '');
      data.append('department', targetEmployee?.department || '');
      data.append('employeeDesignation', targetEmployee?.designation || '');
      data.append('place', reviewingVisitor.place || '');
      data.append('visitorCount', (reviewingVisitor.visitorCount || 1).toString());
      data.append('referredBy', employee.name);

      // If there's an existing photo, we might need to handle it. 
      // For now, let's assume we just pass the URL if the backend handles it, 
      // but the backend uses upload.single('photo'), so we might need the actual file or a way to reuse it.
      // Since it's a new request, let's just pass the photoUrl field if the backend supports it, 
      // or we can modify backend to accept photoUrl from another visitor.
      // User says "Copy all previous data", including photo.

      await axios.post(`${API_BASE}/visitors`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      Alert.alert('Success', `Visitor referred to ${targetEmployee?.name}`);
      setShowReferModal(false);
      setReviewingVisitor(null);
      setReferPurpose('');
      setReferEmployeeId('');
      if (employee?._id) fetchVisitors(employee._id);
    } catch (error) {
      console.error('Referral failed:', error);
      Alert.alert('Error', 'Failed to refer visitor');
    } finally {
      setLoading(false);
    }
  };

  const handleAskToWait = async () => {
    if (!incomingVisitorRequest?.visitorId) return;

    setNotificationActionLoading(true);
    try {
      await axios.put(`${API_BASE}/visitors/${incomingVisitorRequest.visitorId}/wait`, {
        waitTime: selectedWaitTime,
      });

      await stopAlarmSound();
      setIncomingVisitorRequest(null);
      setShowWaitModal(false);

      if (employee?._id) {
        fetchVisitors(employee._id);
      }
    } catch (error) {
      console.error('Ask to wait failed:', error);
      Alert.alert('Error', 'Failed to update wait time');
    } finally {
      setNotificationActionLoading(false);
    }
  };

  const checkAuth = async () => {
    try {
      const storedAuth = await AsyncStorage.getItem('employeeAuth');
      if (storedAuth) {
        setEmployee(JSON.parse(storedAuth));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      return Alert.alert('Error', 'Please fill in all fields');
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/employees/login`, {
        email: cleanEmail,
        password,
      });

      await AsyncStorage.setItem('employeeAuth', JSON.stringify(res.data.employee));
      setEmployee(res.data.employee);
      setCurrentScreen('profile');
      setEmail('');
      setPassword('');
    } catch (error) {
      console.error('[LOGIN ERROR]', error);
      if (error.response) {
        Alert.alert('Login Failed', error.response.data.error || 'Invalid credentials');
      } else if (error.request) {
        Alert.alert('Network Error', 'Cannot connect to server. Check IP address.');
      } else {
        Alert.alert('Error', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await stopAlarmSound();
    await clearPushToken(employee?._id);
    await AsyncStorage.removeItem('employeeAuth');
    setIncomingVisitorRequest(null);
    setEmployee(null);
  };

  const fetchVisitors = async (employeeId = employee?._id) => {
    if (!employeeId) {
      return;
    }

    try {
      const res = await axios.get(`${API_BASE}/visitors/employee/${employeeId}`);
      setVisitors(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleReview = async (status) => {
    setLoading(true);
    try {
      await axios.put(`${API_BASE}/visitors/${reviewingVisitor._id}`, {
        status,
        message,
      });

      if (incomingVisitorRequest?.visitorId === reviewingVisitor._id) {
        await stopAlarmSound();
        setIncomingVisitorRequest(null);
      }

      setReviewingVisitor(null);
      setMessage('');
      fetchVisitors();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  const pendingVisitors = visitors.filter((visitor) => visitor.status === 'pending');
  const loggedVisitors = visitors.filter((visitor) => {
    if (search) {
      return (
        visitor.name.toLowerCase().includes(search.toLowerCase()) ||
        visitor.phone.includes(search)
      );
    }
    return true;
  });

  const getStatusColor = (status) => {
    if (status === 'approved') return '#10b981';
    if (status === 'rejected') return '#ef4444';
    if (status === 'completed') return '#6b7280';
    return '#f59e0b';
  };

  const getTextValue = (value) => value || 'N/A';
  const getDescription = (visitor) => visitor.description || visitor.message || 'N/A';
  const getEmployeeName = (visitor) =>
    visitor.employeeName || visitor.employeeId?.name || employee?.name || 'Unknown';
  const getDepartment = (visitor) => visitor.department || employee?.department || 'N/A';
  const getEmployeeDesignation = (visitor) =>
    visitor.employeeDesignation || employee?.designation || 'N/A';
  const getPhotoUri = (photoUrl) => {
    if (!photoUrl) return null;
    if (photoUrl.startsWith('http')) return photoUrl;
    
    // Ensure there is exactly one slash between BASE_URL and photoUrl
    const baseUrl = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
    const path = photoUrl.startsWith('/') ? photoUrl : `/${photoUrl}`;
    return `${baseUrl}${path}`;
  };

  if (authLoading || !appAssetsReady) {
    return (
      <View style={[styles.container, styles.centeredLoader]}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (!employee) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.loginContainer}
        >
          <View style={styles.loginCard}>
            <View style={styles.loginHeader}>
              <Text style={styles.loginTitle}>Employee Login</Text>
              <Text style={styles.loginSubtitle}>Access your visitor queue</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor="#9ca3af"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter your password"
                  placeholderTextColor="#9ca3af"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Text style={styles.eyeBtnText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
              <Text style={styles.loginBtnText}>
                {loading ? 'Authenticating...' : 'Secure Login'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Navigation Logic for logged-in employee
  return (
    <SafeAreaView style={styles.container}>
      {/* 1. INCOMING VISITOR MODAL (Global) */}
      <Modal
        visible={!!incomingVisitorRequest}
        animationType="fade"
        transparent={false}
        onRequestClose={() => { }}
      >
        <SafeAreaView style={styles.incomingScreen}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.incomingHeader}>
              <Text style={styles.incomingAlertLabel}>LIVE VISITOR ALERT</Text>
              <Text style={styles.incomingTitle}>New Visitor Request</Text>
              <Text style={styles.incomingSubtitle}>
                The alarm keeps ringing until you approve or reject.
              </Text>
            </View>

            <View style={styles.incomingCard}>
              {incomingVisitorRequest?.photoUrl ? (
                <Image
                  source={{ uri: getPhotoUri(incomingVisitorRequest.photoUrl) }}
                  style={styles.incomingAvatar}
                />
              ) : (
                <View style={styles.incomingAvatarPlaceholder}>
                  <Text style={styles.incomingAvatarText}>
                    {incomingVisitorRequest?.name?.charAt(0) || 'V'}
                  </Text>
                </View>
              )}

              <View style={styles.incomingDetails}>
                <Text style={styles.incomingName}>{incomingVisitorRequest?.name}</Text>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Phone:</Text>
                  <Text style={styles.infoValue}>{incomingVisitorRequest?.phone}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Email:</Text>
                  <Text style={styles.infoValue}>{getTextValue(incomingVisitorRequest?.email)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Company:</Text>
                  <Text style={styles.infoValue}>{getTextValue(incomingVisitorRequest?.company)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Visitor Designation:</Text>
                  <Text style={styles.infoValue}>{getTextValue(incomingVisitorRequest?.visitorDesignation)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Purpose:</Text>
                  <Text style={styles.infoValue}>{incomingVisitorRequest?.purpose}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Department:</Text>
                  <Text style={styles.infoValue}>{getTextValue(incomingVisitorRequest?.department)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Employee Designation:</Text>
                  <Text style={styles.infoValue}>{getTextValue(incomingVisitorRequest?.employeeDesignation)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Place:</Text>
                  <Text style={styles.infoValue}>{getTextValue(incomingVisitorRequest?.place)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Number of Visitors:</Text>
                  <Text style={styles.infoValue}>{incomingVisitorRequest?.visitorCount || 1}</Text>
                </View>

                {incomingVisitorRequest?.referredBy ? (
                  <View style={[styles.infoRow, { marginTop: 10 }]}>
                    <Text style={[styles.infoValue, { color: '#8b5cf6', fontWeight: 'bold' }]}>
                      🔄 Referred by: {incomingVisitorRequest.referredBy}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={{ width: '100%' }}>
              <TouchableOpacity
                style={[styles.incomingWaitBtn]}
                disabled={notificationActionLoading}
                onPress={() => setShowWaitModal(true)}
              >
                <Text style={styles.incomingActionText} numberOfLines={1} adjustsFontSizeToFit>
                  {notificationActionLoading ? 'Working...' : 'Ask to Wait'}
                </Text>
              </TouchableOpacity>

              <View style={styles.incomingActionRow}>
                <TouchableOpacity
                  style={[styles.incomingActionBtn, styles.incomingRejectBtn]}
                  disabled={notificationActionLoading}
                  onPress={() => setShowRejectModal(true)}
                >
                  <Text style={styles.incomingActionText} numberOfLines={1} adjustsFontSizeToFit>
                    {notificationActionLoading ? 'Working...' : 'Reject'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.incomingActionBtn, styles.incomingApproveBtn]}
                  disabled={notificationActionLoading}
                  onPress={() => processVisitorDecision(incomingVisitorRequest, 'approved')}
                >
                  <Text style={styles.incomingActionText} numberOfLines={1} adjustsFontSizeToFit>
                    {notificationActionLoading ? 'Working...' : 'Approve'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          <Modal visible={showWaitModal} transparent={true} animationType="fade">
            <View style={styles.waitModalOverlay}>
              <View style={styles.waitModalContent}>
                <Text style={styles.waitModalTitle}>Select Wait Time</Text>
                {[5, 10, 15, 20, 25, 30].map((time) => (
                  <TouchableOpacity
                    key={time}
                    style={[styles.waitOption, selectedWaitTime === time && styles.waitOptionSelected]}
                    onPress={() => setSelectedWaitTime(time)}
                  >
                    <Text style={[styles.waitOptionText, selectedWaitTime === time && styles.waitOptionTextSelected]}>
                      {time} minutes
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.waitSubmitBtn}
                  disabled={notificationActionLoading}
                  onPress={handleAskToWait}
                >
                  <Text style={styles.waitSubmitText}>
                    {notificationActionLoading ? 'Submitting...' : 'Submit'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.waitCancelBtn}
                  onPress={() => setShowWaitModal(false)}
                >
                  <Text style={styles.waitCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal visible={showRejectModal} transparent={true} animationType="fade">
            <View style={styles.waitModalOverlay}>
              <View style={styles.waitModalContent}>
                <Text style={styles.waitModalTitle}>Reject Request</Text>

                <TextInput
                  style={styles.modalTextInput}
                  placeholder="Write your reason (optional)"
                  placeholderTextColor="#9ca3af"
                  value={customRejectMessage}
                  onChangeText={setCustomRejectMessage}
                  multiline
                />

                <Text style={styles.reasonLabel}>Or select a reason:</Text>
                <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={true}>
                  {REJECT_REASONS.map((reason) => (
                    <TouchableOpacity
                      key={reason}
                      style={[styles.waitOption, selectedRejectReason === reason && styles.waitOptionSelected]}
                      onPress={() => {
                        setSelectedRejectReason(reason);
                        setCustomRejectMessage('');
                      }}
                    >
                      <Text style={[styles.waitOptionText, selectedRejectReason === reason && styles.waitOptionTextSelected]}>
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TouchableOpacity
                  style={[styles.waitSubmitBtn, { backgroundColor: '#dc2626' }]}
                  disabled={notificationActionLoading}
                  onPress={handleRejectSubmit}
                >
                  <Text style={styles.waitSubmitText}>
                    {notificationActionLoading ? 'Submitting...' : 'Confirm Reject'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.waitCancelBtn}
                  onPress={() => {
                    setShowRejectModal(false);
                    setSelectedRejectReason('');
                    setCustomRejectMessage('');
                  }}
                >
                  <Text style={styles.waitCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </Modal>

      {/* 2. CONDITIONAL SCREEN RENDERING */}
      {currentScreen === 'profile' ? (
        <EmployeeProfileScreen
          employee={employee}
          onNavigateToLogs={() => setCurrentScreen('dashboard')}
          onNavigateToSchedule={() => setCurrentScreen('schedule')}
          onLogout={handleLogout}
          BASE_URL={BASE_URL}
        />
      ) : currentScreen === 'schedule' ? (
        <ScheduleMeetingScreen
          employee={employee}
          BASE_URL={BASE_URL}
          onBack={() => setCurrentScreen('profile')}
        />
      ) : (
        /* Existing Dashboard Screen */
        <React.Fragment>
          <View
            style={[styles.header, { backgroundColor: '#2563eb' }]}
          >
            <View style={styles.headerTop}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={() => setCurrentScreen('profile')} style={styles.backIconButton}>
                  <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <View>
                  <Text style={styles.headerTitle}>STPI VMS</Text>
                  <Text style={styles.headerSubtitle}>{employee.name} • {employee.department}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={20} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.mainLayout}>
            <View style={styles.sidebar}>
              <TouchableOpacity
                style={[styles.sidebarBtn, activeTab === 'current' && styles.sidebarBtnActive]}
                onPress={() => setActiveTab('current')}
              >
                <Text
                  style={[styles.sidebarBtnText, activeTab === 'current' && styles.sidebarBtnTextActive]}
                >
                  Current Requests ({pendingVisitors.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sidebarBtn, activeTab === 'log' && styles.sidebarBtnActive]}
                onPress={() => setActiveTab('log')}
              >
                <Text style={[styles.sidebarBtnText, activeTab === 'log' && styles.sidebarBtnTextActive]}>
                  Visitor Log
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.contentArea}>
              {activeTab === 'current' && (
                <FlatList
                  data={pendingVisitors}
                  keyExtractor={(item) => item._id}
                  contentContainerStyle={styles.listContainer}
                  renderItem={({ item }) => (
                    <View style={styles.visitorCard}>
                      {item.photoUrl ? (
                        <Image source={{ uri: getPhotoUri(item.photoUrl) }} style={styles.visitorPhoto} />
                      ) : (
                        <View style={styles.visitorPhotoPlaceholder}>
                          <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
                        </View>
                      )}
                      <View style={styles.visitorInfo}>
                        <Text style={styles.visitorName}>{item.name}</Text>
                        <View style={styles.infoRowSmall}>
                          <Ionicons name="business-outline" size={12} color="#64748b" />
                          <Text style={styles.visitorPurpose} numberOfLines={1}>{getTextValue(item.company)}</Text>
                        </View>
                        <View style={styles.infoRowSmall}>
                          <Ionicons name="chatbubble-outline" size={12} color="#64748b" />
                          <Text style={styles.visitorPurpose} numberOfLines={1}>{item.purpose}</Text>
                        </View>
                        <Text style={styles.visitorTime}>{new Date(item.checkInTime).toLocaleTimeString()}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.reviewBtn}
                        onPress={() => setReviewingVisitor({ ...item, isLogView: false })}
                      >
                        <Text style={styles.reviewBtnText}>Review</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyStateText}>No pending requests.</Text>
                    </View>
                  }
                />
              )}

              {activeTab === 'log' && (
                <View style={{ flex: 1 }}>
                  <View style={styles.searchContainer}>
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search name or phone..."
                      placeholderTextColor="#9ca3af"
                      value={search}
                      onChangeText={setSearch}
                    />
                  </View>
                  <FlatList
                    data={loggedVisitors}
                    keyExtractor={(item) => item._id}
                    contentContainerStyle={styles.listContainer}
                    renderItem={({ item }) => (
                      <View style={styles.visitorCard}>
                        <View style={styles.visitorInfo}>
                          <Text style={styles.visitorName}>{item.name}</Text>
                          <View style={styles.infoRowSmall}>
                            <Ionicons name="business-outline" size={12} color="#64748b" />
                            <Text style={styles.visitorPurpose} numberOfLines={1}>{getTextValue(item.company)}</Text>
                          </View>
                          <View style={styles.infoRowSmall}>
                            <Ionicons name="time-outline" size={12} color="#64748b" />
                            <Text style={styles.visitorTime}>{new Date(item.checkInTime).toLocaleString()}</Text>
                          </View>
                        </View>
                        <View style={styles.logActionColumn}>
                          <View
                            style={[
                              styles.statusBadge,
                              {
                                backgroundColor: getStatusColor(item.status) + '15',
                                borderColor: getStatusColor(item.status) + '40',
                              },
                            ]}
                          >
                            <Text style={[styles.statusBadgeText, { color: getStatusColor(item.status) }]}>
                              {item.status.toUpperCase()}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={styles.viewBtn}
                            onPress={() => setReviewingVisitor({ ...item, isLogView: true })}
                          >
                            <Text style={styles.viewBtnText}>View</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                    ListEmptyComponent={
                      <View style={styles.emptyState}>
                        <Text style={styles.emptyStateText}>No visitors found.</Text>
                      </View>
                    }
                  />
                </View>
              )}
            </View>
          </View>
        </React.Fragment>
      )}

      {/* 3. SHARED REVIEW/REFER MODALS (Global) */}
      <Modal visible={!!reviewingVisitor} animationType="slide" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {reviewingVisitor?.isLogView ? 'Visitor Profile' : 'Approval Request'}
              </Text>
              <TouchableOpacity onPress={() => setReviewingVisitor(null)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {reviewingVisitor && (
              <FlatList
                data={[{ key: '1' }]}
                renderItem={() => (
                  <View style={{ padding: 20 }}>
                    {reviewingVisitor.photoUrl ? (
                      <Image
                        source={{ uri: getPhotoUri(reviewingVisitor.photoUrl) }}
                        style={styles.visitorPhotoLarge}
                      />
                    ) : (
                      <View style={[styles.visitorPhotoLarge, styles.placeholderPhoto]}>
                        <Text style={styles.placeholderPhotoText}>No Photo</Text>
                      </View>
                    )}

                    <View style={styles.detailsCard}>
                      <Text style={styles.visitorNameLg}>{reviewingVisitor.name}</Text>
                      <Text style={styles.visitorPhone}>Phone: {reviewingVisitor.phone}</Text>

                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Email:</Text>
                        <Text style={styles.detailValue}>{getTextValue(reviewingVisitor.email)}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Company:</Text>
                        <Text style={styles.detailValue}>{getTextValue(reviewingVisitor.company)}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>V. Desig:</Text>
                        <Text style={styles.detailValue}>{getTextValue(reviewingVisitor.visitorDesignation)}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Purpose:</Text>
                        <Text style={styles.detailValue}>{reviewingVisitor.purpose}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Place:</Text>
                        <Text style={styles.detailValue}>{getTextValue(reviewingVisitor.place)}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Visitors:</Text>
                        <Text style={styles.detailValue}>{reviewingVisitor.visitorCount || 1}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Description:</Text>
                        <Text style={styles.detailValue}>{getDescription(reviewingVisitor)}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Officer:</Text>
                        <Text style={styles.detailValue}>{getEmployeeName(reviewingVisitor)}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Dept:</Text>
                        <Text style={styles.detailValue}>{getDepartment(reviewingVisitor)}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>E. Desig:</Text>
                        <Text style={styles.detailValue}>{getEmployeeDesignation(reviewingVisitor)}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Status:</Text>
                        <Text
                          style={[
                            styles.detailValue,
                            { color: getStatusColor(reviewingVisitor.status), fontWeight: 'bold' },
                          ]}
                        >
                          {reviewingVisitor.status.toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Visit Date:</Text>
                        <Text style={styles.detailValue}>
                          {new Date(reviewingVisitor.visitDate).toLocaleDateString()}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Check-in:</Text>
                        <Text style={styles.detailValue}>
                          {new Date(reviewingVisitor.checkInTime).toLocaleTimeString()}
                        </Text>
                      </View>
                      {reviewingVisitor.checkOutTime && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Check-out:</Text>
                          <Text style={styles.detailValue}>
                            {new Date(reviewingVisitor.checkOutTime).toLocaleTimeString()}
                          </Text>
                        </View>
                      )}
                      {reviewingVisitor.meetingStartTime && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Meet Start:</Text>
                          <Text style={[styles.detailValue, { color: '#10b981' }]}>
                            {new Date(reviewingVisitor.meetingStartTime).toLocaleTimeString()}
                          </Text>
                        </View>
                      )}
                      {reviewingVisitor.meetingEndTime && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Meet End:</Text>
                          <Text style={[styles.detailValue, { color: '#ef4444' }]}>
                            {new Date(reviewingVisitor.meetingEndTime).toLocaleTimeString()}
                          </Text>
                        </View>
                      )}
                      {reviewingVisitor.message ? (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Message:</Text>
                          <Text style={styles.detailValue}>"{reviewingVisitor.message}"</Text>
                        </View>
                      ) : null}

                      {reviewingVisitor.referredBy ? (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Ref. By:</Text>
                          <Text style={[styles.detailValue, { color: '#3b82f6', fontWeight: 'bold' }]}>
                            {reviewingVisitor.referredBy}
                          </Text>
                        </View>
                      ) : null}
                      {reviewingVisitor.referredTo ? (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Ref. To:</Text>
                          <Text style={[styles.detailValue, { color: '#ec4899', fontWeight: 'bold' }]}>
                            {reviewingVisitor.referredTo}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {reviewingVisitor.isLogView && reviewingVisitor.status === 'approved' && !reviewingVisitor.meetingEndTime && (
                      <View style={styles.meetingActions}>
                        <TouchableOpacity
                          style={[styles.meetingBtn, styles.meetingEndBtn]}
                          onPress={() => handleMeetingEnd(reviewingVisitor._id)}
                          disabled={loading}
                        >
                          <Text style={styles.meetingBtnText}>🔴 Meeting End</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.meetingBtn, styles.referBtn]}
                          onPress={() => {
                            setReferPurpose('');
                            setShowReferModal(true);
                          }}
                          disabled={loading}
                        >
                          <Text style={styles.meetingBtnText}>🔵 Refer</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {!reviewingVisitor.isLogView && (
                      <View style={styles.actionSection}>
                        <Text style={styles.inputLabel}>Optional Message:</Text>
                        <TextInput
                          style={styles.messageInput}
                          placeholder="E.g., I'll be there in 5 mins"
                          placeholderTextColor="#9ca3af"
                          value={message}
                          onChangeText={setMessage}
                          multiline
                        />
                        <View style={styles.actionButtons}>
                          <TouchableOpacity
                            style={[styles.btn, styles.rejectBtn]}
                            onPress={() => handleReview('rejected')}
                            disabled={loading}
                          >
                            <Text style={styles.btnText} numberOfLines={1} adjustsFontSizeToFit>Reject</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.btn, styles.approveBtn]}
                            onPress={() => handleReview('approved')}
                            disabled={loading}
                          >
                            <Text style={styles.btnText} numberOfLines={1} adjustsFontSizeToFit>Approve</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showReferModal} transparent={true} animationType="slide">
        <View style={styles.waitModalOverlay}>
          <View style={[styles.waitModalContent, { width: '90%', maxHeight: '85%' }]}>
            <Text style={styles.waitModalTitle}>Refer Visitor</Text>

            <ScrollView style={{ width: '100%' }}>
              <View style={styles.referralPreFilled}>
                <Text style={styles.referralLabel}>Name: {reviewingVisitor?.name}</Text>
                <Text style={styles.referralLabel}>Phone: {reviewingVisitor?.phone}</Text>
                <Text style={styles.referralLabel}>Company: {getTextValue(reviewingVisitor?.company)}</Text>
                <Text style={styles.referralLabel}>Referred By: {employee?.name} (You)</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>New Purpose of Visit *</Text>
                <TextInput
                  style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="Enter purpose for next meeting..."
                  placeholderTextColor="#9ca3af"
                  value={referPurpose}
                  onChangeText={setReferPurpose}
                  multiline
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Select Employee to Meet *</Text>
                <View style={styles.pickerContainer}>
                  <ScrollView style={{ maxHeight: 150 }}>
                    {employees.filter(emp => emp._id !== employee._id).map(emp => (
                      <TouchableOpacity
                        key={emp._id}
                        style={[styles.waitOption, referEmployeeId === emp._id && styles.waitOptionSelected]}
                        onPress={() => setReferEmployeeId(emp._id)}
                      >
                        <Text style={[styles.waitOptionText, referEmployeeId === emp._id && styles.waitOptionTextSelected]}>
                          {emp.name} ({emp.department})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.waitSubmitBtn, { backgroundColor: '#3b82f6' }]}
              onPress={handleReferSubmit}
              disabled={loading}
            >
              <Text style={styles.waitSubmitText}>{loading ? 'Referring...' : 'Submit Referral'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.waitCancelBtn}
              onPress={() => setShowReferModal(false)}
            >
              <Text style={styles.waitCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  centeredLoader: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f8fafc',
  },
  loginCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 30,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
  loginHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  loginSubtitle: {
    color: '#64748b',
    marginTop: 6,
    fontSize: 15,
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '600',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '600',
  },
  eyeBtn: {
    padding: 16,
  },
  eyeBtnText: {
    color: '#6366f1',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  loginBtn: {
    backgroundColor: '#4f46e5',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  loginBtnText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  header: {
    backgroundColor: '#4f46e5',
    padding: 24,
    paddingTop: Platform.OS === 'android' ? 50 : 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: 'white',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    color: '#c7d2fe',
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
  },
  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIconButton: {
    marginRight: 16,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainLayout: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  sidebar: {
    flexDirection: 'row',
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginTop: -20,
    borderRadius: 20,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
  },
  sidebarBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 16,
  },
  sidebarBtnActive: {
    backgroundColor: '#4f46e5',
  },
  sidebarBtnText: {
    color: '#64748b',
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sidebarBtnTextActive: {
    color: 'white',
  },
  contentArea: {
    flex: 1,
  },
  searchContainer: {
    padding: 20,
    paddingBottom: 0,
  },
  searchInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 14,
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
  },
  listContainer: {
    padding: 20,
  },
  visitorCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 20,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  visitorPhoto: {
    width: 56,
    height: 56,
    borderRadius: 20,
    marginRight: 16,
  },
  visitorPhotoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#4f46e5',
  },
  visitorInfo: {
    flex: 1,
  },
  visitorName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 2,
  },
  visitorPurpose: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '500',
  },
  visitorTime: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 6,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  reviewBtn: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  reviewBtnText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  viewBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  viewBtnText: {
    color: '#475569',
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRowSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  logActionColumn: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 60,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 50,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    height: '92%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 24,
    backgroundColor: 'white',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  visitorPhotoLarge: {
    width: 120,
    height: 120,
    borderRadius: 32,
    alignSelf: 'center',
    marginBottom: 24,
    borderWidth: 4,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  placeholderPhoto: {
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsCard: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 24,
    marginHorizontal: 20,
    marginBottom: 20,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  visitorNameLg: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  visitorPhone: {
    color: '#64748b',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  detailLabel: {
    width: 100,
    color: '#94a3b8',
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  detailValue: {
    flex: 1,
    color: '#334155',
    fontWeight: '700',
    fontSize: 14,
  },
  actionSection: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 24,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  messageInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minHeight: 100,
    textAlignVertical: 'top',
    color: '#0f172a',
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
  },
  btn: {
    flex: 1,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    backgroundColor: '#ef4444',
  },
  approveBtn: {
    backgroundColor: '#10b981',
  },
  btnText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 15,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  incomingScreen: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'space-between',
    padding: 24,
  },
  incomingHeader: {
    marginTop: 20,
  },
  incomingAlertLabel: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  incomingTitle: {
    color: 'white',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  incomingSubtitle: {
    color: '#94a3b8',
    fontSize: 16,
    marginTop: 12,
    lineHeight: 24,
    fontWeight: '500',
  },
  incomingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  incomingAvatar: {
    width: 120,
    height: 120,
    borderRadius: 40,
    marginBottom: 20,
    borderWidth: 6,
    borderColor: '#f8fafc',
  },
  incomingAvatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 35,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  incomingAvatarText: {
    fontSize: 40,
    fontWeight: '900',
    color: '#ef4444',
  },
  incomingDetails: {
    width: '100%',
  },
  incomingName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  infoLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
    flex: 1,
  },
  infoValue: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '700',
    flex: 1.5,
    textAlign: 'right',
  },
  incomingActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 0,
    marginBottom: 20,
  },
  incomingActionBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomingRejectBtn: {
    backgroundColor: '#ef4444',
  },
  incomingApproveBtn: {
    backgroundColor: '#22c55e',
  },
  incomingActionText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  incomingWaitBtn: {
    backgroundColor: '#4f46e5',
    marginBottom: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
    marginTop: 24,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  waitModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  waitModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
    textAlign: 'center',
  },
  waitOption: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    alignItems: 'center',
    width: '100%',
  },
  waitOptionText: {
    fontSize: 16,
    color: '#374151',
  },
  waitOptionSelected: {
    backgroundColor: '#eff6ff',
  },
  waitOptionTextSelected: {
    color: '#3b82f6',
    fontWeight: 'bold',
  },
  waitSubmitBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 20,
    alignItems: 'center',
    width: '100%',
  },
  waitSubmitText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  waitCancelBtn: {
    marginTop: 12,
    alignItems: 'center',
  },
  waitCancelText: {
    color: '#6b7280',
    fontSize: 14,
  },
  modalTextInput: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minHeight: 60,
    textAlignVertical: 'top',
    color: '#1f2937',
    marginBottom: 12,
  },
  reasonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  meetingActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  meetingBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  meetingEndBtn: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  referBtn: {
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  meetingBtnText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  referralPreFilled: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
  },
  referralLabel: {
    fontSize: 13,
    color: '#4b5563',
    marginBottom: 4,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: 'white',
    padding: 5,
  },
});
