import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Dimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function EmployeeProfileScreen({ employee, onNavigateToLogs, onNavigateToSchedule, onLogout, BASE_URL }) {
  const getPhotoUri = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;

    // Ensure there is exactly one slash between BASE_URL and path
    const baseUrl = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
    const photoPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${photoPath}`;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Top Gradient Header */}
      <View
        style={[styles.header, { backgroundColor: '#2563eb' }]}
      >
        <SafeAreaView>
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.headerGreeting}>Welcome back,</Text>
              <Text style={styles.headerName}>{employee?.name}</Text>
            </View>
            <TouchableOpacity style={styles.logoutIconButton} onPress={onLogout}>
              <Ionicons name="log-out-outline" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>

      <View style={styles.content}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            {employee?.photo ? (
              <Image
                source={{ uri: getPhotoUri(employee.photo) }}
                style={styles.profileImage}
              />
            ) : (
              <View style={[styles.profileImage, styles.placeholderImage]}>
                <Text style={styles.placeholderText}>
                  {employee?.name?.charAt(0).toUpperCase() || 'E'}
                </Text>
              </View>
            )}
            <View style={styles.statusDot} />
          </View>
          
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{employee?.name}</Text>
            <View style={styles.roleContainer}>
              <Ionicons name="briefcase-outline" size={14} color="#64748b" />
              <Text style={styles.designation}>{employee?.designation}</Text>
            </View>
            <View style={styles.roleContainer}>
              <Ionicons name="business-outline" size={14} color="#64748b" />
              <Text style={styles.department}>{employee?.department}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <View style={styles.buttonSection}>
          <TouchableOpacity 
            style={styles.cardButton} 
            onPress={onNavigateToLogs}
            activeOpacity={0.7}
          >
            <View
              style={[styles.cardButtonGradient, { backgroundColor: '#ffffff' }]}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="list-outline" size={30} color="#2563eb" />
              </View>
              <View style={styles.cardButtonTextContainer}>
                <Text style={styles.cardButtonTitle}>View Logs</Text>
                <Text style={styles.cardButtonSubtitle}>Check visitor history</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.cardButton} 
            onPress={onNavigateToSchedule}
            activeOpacity={0.7}
          >
            <View
              style={[styles.cardButtonGradient, { backgroundColor: '#ffffff' }]}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#f5f3ff' }]}>
                <Ionicons name="calendar-outline" size={30} color="#4f46e5" />
              </View>
              <View style={styles.cardButtonTextContainer}>
                <Text style={styles.cardButtonTitle}>Schedule Meeting</Text>
                <Text style={styles.cardButtonSubtitle}>Create new appointment</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingBottom: 40,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  headerGreeting: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  headerName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  logoutIconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    marginTop: -30,
  },
  profileCard: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 5,
    marginBottom: 30,
  },
  avatarContainer: {
    position: 'relative',
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#f1f5f9',
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10b981',
    borderWidth: 3,
    borderColor: 'white',
  },
  placeholderImage: {
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  profileInfo: {
    marginLeft: 20,
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 6,
  },
  roleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  designation: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  department: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 20,
    marginLeft: 4,
  },
  buttonSection: {
    width: '100%',
    gap: 16,
  },
  cardButton: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardButtonTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  cardButtonTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 2,
  },
  cardButtonSubtitle: {
    fontSize: 13,
    color: '#64748b',
  },
});
