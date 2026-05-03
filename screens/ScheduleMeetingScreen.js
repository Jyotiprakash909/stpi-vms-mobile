import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  FlatList,
  StatusBar,
} from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';

// --- Custom JS-Only Time Picker Component ---
const CustomTimePicker = ({ visible, onSelect, onClose, initialDate }) => {
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

  const [selectedHour, setSelectedHour] = useState(initialDate.getHours().toString().padStart(2, '0'));
  const [selectedMinute, setSelectedMinute] = useState((Math.floor(initialDate.getMinutes() / 5) * 5).toString().padStart(2, '0'));

  const handleConfirm = () => {
    const newDate = new Date(initialDate);
    newDate.setHours(parseInt(selectedHour));
    newDate.setMinutes(parseInt(selectedMinute));
    onSelect(newDate);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.pickerModalContent}>
          <View style={styles.pickerModalHeader}>
            <Text style={styles.modalTitle}>Select Time</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.pickerColumns}>
            <View style={styles.pickerColumn}>
              <Text style={styles.columnLabel}>Hour</Text>
              <FlatList
                data={hours}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[styles.pickerItem, selectedHour === item && styles.pickerItemSelected]}
                    onPress={() => setSelectedHour(item)}
                  >
                    <Text style={[styles.pickerItemText, selectedHour === item && styles.pickerItemTextSelected]}>{item}</Text>
                  </TouchableOpacity>
                )}
                showsVerticalScrollIndicator={false}
              />
            </View>
            <View style={styles.pickerColumn}>
              <Text style={styles.columnLabel}>Min</Text>
              <FlatList
                data={minutes}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[styles.pickerItem, selectedMinute === item && styles.pickerItemSelected]}
                    onPress={() => setSelectedMinute(item)}
                  >
                    <Text style={[styles.pickerItemText, selectedMinute === item && styles.pickerItemTextSelected]}>{item}</Text>
                  </TouchableOpacity>
                )}
                showsVerticalScrollIndicator={false}
              />
            </View>
          </View>
          
          <TouchableOpacity style={styles.modalConfirmBtnLarge} onPress={handleConfirm}>
            <View
              style={[styles.modalConfirmGradient, { backgroundColor: '#2563eb' }]}
            >
              <Text style={styles.modalConfirmText}>Set Time</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// --- Custom JS-Only Date Picker Component ---
const CustomDatePicker = ({ visible, onSelect, onClose, initialDate }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  
  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const days = [];
    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);

    for (let i = 0; i < startDay; i++) {
      days.push(<View key={`empty-${i}`} style={styles.calendarDay} />);
    }

    for (let i = 1; i <= totalDays; i++) {
      const isSelected = initialDate.getDate() === i && initialDate.getMonth() === month && initialDate.getFullYear() === year;
      const isPast = new Date(year, month, i) < new Date().setHours(0,0,0,0);
      
      days.push(
        <TouchableOpacity 
          key={`day-${i}`} 
          style={[styles.calendarDay, isSelected && styles.calendarDaySelected, isPast && styles.calendarDayDisabled]}
          onPress={() => {
            if (!isPast) {
              const newDate = new Date(year, month, i);
              onSelect(newDate);
              onClose();
            }
          }}
          disabled={isPast}
        >
          <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, isPast && styles.calendarDayTextDisabled]}>{i}</Text>
        </TouchableOpacity>
      );
    }
    return days;
  };

  const changeMonth = (offset) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.pickerModalContent}>
          <View style={styles.pickerModalHeader}>
            <Text style={styles.modalTitle}>Select Date</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={styles.calendarHeader}>
            <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navBtnContainer}>
              <Ionicons name="chevron-back" size={20} color="#2563eb" />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>
              {currentMonth.toLocaleString('default', { month: 'long' })} {currentMonth.getFullYear()}
            </Text>
            <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navBtnContainer}>
              <Ionicons name="chevron-forward" size={20} color="#2563eb" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.weekRow}>
            {['S','M','T','W','T','F','S'].map((d, index) => (
              <Text key={`${d}-${index}`} style={styles.weekDay}>{d}</Text>
            ))}
          </View>
          
          <View style={styles.calendarGrid}>
            {renderCalendar()}
          </View>
          
          <View style={{ height: 20 }} />
        </View>
      </View>
    </Modal>
  );
};

export default function ScheduleMeetingScreen({ onBack, employee, BASE_URL }) {
  const [loading, setLoading] = useState(false);
  const [meetings, setMeetings] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const [formData, setFormData] = useState({
    visitorName: '',
    phone: '',
    email: '',
    company: '',
    visitorDesignation: '',
    purpose: '',
    scheduledDate: new Date(),
    startTime: new Date(),
    endTime: new Date(new Date().getTime() + 30 * 60 * 1000),
  });

  useEffect(() => {
    fetchMeetings();
  }, []);

  const fetchMeetings = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/schedule-meeting/employee/${employee._id}`);
      setMeetings(res.data);
    } catch (err) {
      console.error('Fetch meetings error:', err);
    }
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const handleSubmit = async () => {
    if (!formData.visitorName || !formData.phone || !formData.purpose) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (formData.endTime <= formData.startTime) {
      Alert.alert('Error', 'End time must be after start time');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        employeeId: employee._id,
        employeeName: employee.name,
        department: employee.department,
        employeeDesignation: employee.designation,
        scheduledDate: formData.scheduledDate,
        startTime: formatTime(formData.startTime),
        endTime: formatTime(formData.endTime),
      };

      await axios.post(`${BASE_URL}/api/schedule-meeting`, payload);
      Alert.alert('Success', 'Meeting scheduled successfully');
      setFormData({
        visitorName: '',
        phone: '',
        email: '',
        company: '',
        visitorDesignation: '',
        purpose: '',
        scheduledDate: new Date(),
        startTime: new Date(),
        endTime: new Date(new Date().getTime() + 30 * 60 * 1000),
      });
      fetchMeetings();
    } catch (err) {
      console.error('Schedule meeting error:', err);
      Alert.alert('Error', 'Failed to schedule meeting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>
          <Text style={styles.title}>Schedule Meeting</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.scrollContainer} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={styles.formCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={18} color="#2563eb" />
              <Text style={styles.sectionTitle}>Visitor Information</Text>
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter visitor name"
                placeholderTextColor="#9ca3af"
                value={formData.visitorName}
                onChangeText={(text) => setFormData({ ...formData, visitorName: text })}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter phone number"
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Company Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Organization name"
                placeholderTextColor="#9ca3af"
                value={formData.company}
                onChangeText={(text) => setFormData({ ...formData, company: text })}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Purpose of Meeting *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Project Discussion"
                placeholderTextColor="#9ca3af"
                value={formData.purpose}
                onChangeText={(text) => setFormData({ ...formData, purpose: text })}
              />
            </View>

            <View style={[styles.sectionHeader, { marginTop: 20 }]}>
              <Ionicons name="time-outline" size={18} color="#4f46e5" />
              <Text style={styles.sectionTitle}>Schedule Details</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Select Date *</Text>
              <TouchableOpacity 
                style={styles.pickerTrigger} 
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={18} color="#64748b" style={{ marginRight: 10 }} />
                <Text style={styles.pickerText}>{formData.scheduledDate.toLocaleDateString()}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.timeRow}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Start Time *</Text>
                <TouchableOpacity 
                  style={styles.pickerTrigger} 
                  onPress={() => setShowStartTimePicker(true)}
                >
                  <Ionicons name="time-outline" size={18} color="#64748b" style={{ marginRight: 10 }} />
                  <Text style={styles.pickerText}>{formatTime(formData.startTime)}</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>End Time *</Text>
                <TouchableOpacity 
                  style={styles.pickerTrigger} 
                  onPress={() => setShowEndTimePicker(true)}
                >
                  <Ionicons name="time-outline" size={18} color="#64748b" style={{ marginRight: 10 }} />
                  <Text style={styles.pickerText}>{formatTime(formData.endTime)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.submitBtn, loading && styles.disabledBtn]} 
              onPress={handleSubmit}
              disabled={loading}
            >
              <View
                style={[styles.submitGradient, { backgroundColor: '#2563eb' }]}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.submitBtnText}>Confirm Schedule</Text>
                )}
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.listSection}>
            <Text style={styles.listTitle}>Upcoming Meetings</Text>
            {meetings.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={40} color="#cbd5e1" />
                <Text style={styles.emptyText}>No scheduled meetings yet</Text>
              </View>
            ) : (
              meetings.map((item, index) => (
                <View key={`${item._id}-${index}`} style={styles.meetingCard}>
                  <View style={styles.meetingCardHeader}>
                    <Text style={styles.meetingVisitorName}>{item.visitorName}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: item.status === 'pending' ? '#fef3c7' : '#dcfce7' }]}>
                      <Text style={[styles.statusText, { color: item.status === 'pending' ? '#b45309' : '#166534' }]}>
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.meetingInfoRow}>
                    <View style={styles.infoItem}>
                      <Ionicons name="calendar-outline" size={14} color="#64748b" />
                      <Text style={styles.infoText}>{new Date(item.scheduledDate).toLocaleDateString()}</Text>
                    </View>
                    <View style={[styles.infoItem, { marginLeft: 16 }]}>
                      <Ionicons name="time-outline" size={14} color="#64748b" />
                      <Text style={styles.infoText}>{item.startTime} - {item.endTime}</Text>
                    </View>
                  </View>

                  <View style={styles.infoItem}>
                    <Ionicons name="chatbox-outline" size={14} color="#64748b" />
                    <Text style={styles.infoText} numberOfLines={1}>{item.purpose}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <CustomDatePicker 
        visible={showDatePicker} 
        initialDate={formData.scheduledDate}
        onSelect={(date) => setFormData({...formData, scheduledDate: date})}
        onClose={() => setShowDatePicker(false)}
      />
      <CustomTimePicker 
        visible={showStartTimePicker}
        initialDate={formData.startTime}
        onSelect={(time) => setFormData({...formData, startTime: time})}
        onClose={() => setShowStartTimePicker(false)}
      />
      <CustomTimePicker 
        visible={showEndTimePicker}
        initialDate={formData.endTime}
        onSelect={(time) => setFormData({...formData, endTime: time})}
        onClose={() => setShowEndTimePicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backBtn: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  scrollContainer: {
    flex: 1,
  },
  formCard: {
    backgroundColor: 'white',
    padding: 20,
    margin: 16,
    borderRadius: 24,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 6,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pickerTrigger: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pickerText: {
    fontSize: 15,
    color: '#0f172a',
  },
  timeRow: {
    flexDirection: 'row',
  },
  submitBtn: {
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  listSection: {
    paddingHorizontal: 16,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
    marginLeft: 4,
  },
  meetingCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  meetingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  meetingVisitorName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  meetingInfoRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  infoText: {
    fontSize: 13,
    color: '#64748b',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 10,
  },
  // Custom Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    paddingBottom: Platform.OS === 'android' ? 40 : 24,
    maxHeight: '80%',
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  pickerColumns: {
    flexDirection: 'row',
    height: 220,
    marginBottom: 20,
  },
  pickerColumn: {
    flex: 1,
    alignItems: 'center',
  },
  columnLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94a3b8',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pickerItem: {
    paddingVertical: 12,
    width: '80%',
    alignItems: 'center',
    borderRadius: 12,
  },
  pickerItemSelected: {
    backgroundColor: '#eff6ff',
  },
  pickerItemText: {
    fontSize: 18,
    color: '#64748b',
  },
  pickerItemTextSelected: {
    color: '#2563eb',
    fontWeight: 'bold',
  },
  modalConfirmBtnLarge: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 10,
  },
  modalConfirmGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  modalConfirmText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
  // Calendar Styles
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 8,
  },
  navBtnContainer: {
    padding: 8,
    backgroundColor: 'white',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.28%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  calendarDaySelected: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
  },
  calendarDayDisabled: {
    opacity: 0.2,
  },
  calendarDayText: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '500',
  },
  calendarDayTextSelected: {
    color: 'white',
    fontWeight: 'bold',
  },
  calendarDayTextDisabled: {
    color: '#94a3b8',
  },
});
