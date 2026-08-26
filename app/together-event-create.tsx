import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { consumePendingPlaceSelection, type PlaceSearchResult } from '../src/features/place-search';
import { useShiftSchedule } from '../src/features/shifts/ShiftScheduleContext';
import { parseAppointmentPrefill } from '../src/features/together/appointmentRecommendation';

type SelectedGapSlot = {
  start: string;
  end: string;
  durationHours: number;
};

type SelectedGap = {
  localDate: string;
  date: string;
  weekday: string;
  slots: SelectedGapSlot[];
};

const MOCK_SELECTED_GAP: SelectedGap = {
  localDate: '2026-08-24',
  date: '8/24',
  weekday: '토요일',
  slots: [
    { start: '14:00', end: '18:00', durationHours: 4 },
    { start: '20:00', end: '22:00', durationHours: 2 },
  ],
};

const MOCK_PARTICIPANTS = [
  { id: 'me', initial: '나', label: '나', color: '#E7ECE3' },
  { id: 'partner', initial: '배', label: '배우자', color: '#FCE0D8' },
  { id: 'coworker', initial: '동', label: '동료 1명', color: '#DDE7EE' },
] as const;

function Header({ onBack }: { onBack: () => void }) {
  const theme = useAppTheme();

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="뒤로"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
      </Pressable>
      <AppText variant="button" style={styles.headerTitle}>공동 일정 만들기</AppText>
      <Pressable
        accessibilityLabel="닫기"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="close" color={theme.text} size={22} />
      </Pressable>
    </View>
  );
}

type SelectedGapCardProps = {
  selectedSlotIndex: number;
  onSelectSlot: (index: number) => void;
};

function SelectedGapCard({ selectedGap, selectedSlotIndex, onSelectSlot }: SelectedGapCardProps & { selectedGap: SelectedGap }) {
  const totalHours = selectedGap.slots.reduce((sum, slot) => sum + slot.durationHours, 0);
  const totalHoursLabel = `총 ${totalHours}시간`;
  const slotCount = selectedGap.slots.length;

  return (
    <View style={styles.fieldGroup}>
      <AppText style={styles.label}>선택한 함께 시간</AppText>
      <Card style={styles.selectedGapCard}>
        <View style={styles.selectedGapHeader}>
          <AppText variant="button" style={styles.selectedDate}>
            {selectedGap.date} ({selectedGap.weekday})
          </AppText>
          <View style={styles.selectedIconPanel} accessibilityElementsHidden>
            <MaterialCommunityIcons name="calendar-clock-outline" color={brandColors.coral} size={28} />
          </View>
        </View>

        {slotCount === 1 && (
          <View style={styles.singleSlotRow}>
            <AppText variant="heading" style={styles.selectedTime}>
              {selectedGap.slots[0].start} ~ {selectedGap.slots[0].end}
            </AppText>
            <View style={styles.totalBadge}>
              <AppText numberOfLines={1} style={styles.totalBadgeText}>{totalHoursLabel}</AppText>
            </View>
          </View>
        )}

        {slotCount === 2 && (
          <View style={styles.twoSlotList}>
            {selectedGap.slots.map((slot, index) => (
              <View key={`${slot.start}-${slot.end}`}>
                {index > 0 && <View style={styles.slotDivider} />}
                <Pressable
                  accessibilityLabel={`${index + 1}번 시간대 ${slot.start}부터 ${slot.end}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedSlotIndex === index }}
                  onPress={() => onSelectSlot(index)}
                  style={({ pressed }) => [
                    styles.slotRow,
                    selectedSlotIndex === index && styles.selectedSlotRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.slotNumber}>
                    <AppText style={styles.slotNumberText}>{index + 1}</AppText>
                  </View>
                  <AppText style={styles.slotTime}>{slot.start} ~ {slot.end}</AppText>
                  <View style={styles.slotDurationBadge}>
                    <AppText style={styles.slotDurationText}>{slot.durationHours}시간</AppText>
                  </View>
                  <View style={styles.slotSelectionIndicator}>
                    {selectedSlotIndex === index && (
                      <MaterialCommunityIcons name="check-circle-outline" color={brandColors.coral} size={17} />
                    )}
                  </View>
                </Pressable>
              </View>
            ))}
            <View style={styles.totalRow}>
              <AppText style={styles.totalLabel}>총 함께 가능한 시간</AppText>
              <View style={styles.totalBadge}>
                <AppText numberOfLines={1} style={styles.totalBadgeText}>{totalHoursLabel}</AppText>
              </View>
            </View>
          </View>
        )}

        {slotCount >= 3 && (
          <View style={styles.manySlotsArea}>
            <ScrollView
              contentContainerStyle={styles.horizontalSlotList}
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
            >
              {selectedGap.slots.map((slot, index) => (
                <Pressable
                  accessibilityLabel={`${index + 1}번 시간대 ${slot.start}부터 ${slot.end}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedSlotIndex === index }}
                  key={`${slot.start}-${slot.end}`}
                  onPress={() => onSelectSlot(index)}
                  style={({ pressed }) => [
                    styles.horizontalSlotBlock,
                    selectedSlotIndex === index && styles.selectedHorizontalSlotBlock,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.horizontalSlotHeader}>
                    <View style={styles.slotNumber}>
                      <AppText style={styles.slotNumberText}>{index + 1}</AppText>
                    </View>
                    <View style={styles.horizontalSlotMeta}>
                      <View style={styles.slotDurationBadge}>
                        <AppText style={styles.slotDurationText}>{slot.durationHours}시간</AppText>
                      </View>
                      <View style={styles.slotSelectionIndicator}>
                        {selectedSlotIndex === index && (
                          <MaterialCommunityIcons name="check-circle-outline" color={brandColors.coral} size={17} />
                        )}
                      </View>
                    </View>
                  </View>
                  <AppText style={styles.horizontalSlotTime}>{slot.start}~{slot.end}</AppText>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.totalRow}>
              <AppText style={styles.totalLabel}>총 함께 가능한 시간</AppText>
              <View style={styles.totalBadge}>
                <AppText numberOfLines={1} style={styles.totalBadgeText}>{totalHoursLabel}</AppText>
              </View>
            </View>
          </View>
        )}
      </Card>
    </View>
  );
}

type FormInputProps = React.ComponentProps<typeof TextInput> & {
  label: string;
};

function FormInput({ label, multiline, style, ...props }: FormInputProps) {
  const theme = useAppTheme();

  return (
    <View style={styles.fieldGroup}>
      <AppText style={styles.label}>{label}</AppText>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          multiline && styles.memoInput,
          { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
          style,
        ]}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

function Participants() {
  const theme = useAppTheme();

  return (
    <View style={styles.fieldGroup}>
      <AppText style={styles.label}>참여자</AppText>
      <View style={styles.participantRow}>
        {MOCK_PARTICIPANTS.map((participant) => (
          <View key={participant.id} style={styles.participantItem}>
            <View style={[styles.avatar, { backgroundColor: participant.color, borderColor: theme.border }]}>
              <AppText variant="caption" style={styles.avatarInitial}>{participant.initial}</AppText>
            </View>
            <AppText variant="caption" style={styles.participantLabel}>{participant.label}</AppText>
          </View>
        ))}
        <View style={styles.participantItem}>
          <Pressable
            accessibilityLabel="참여자 추가"
            accessibilityRole="button"
            onPress={() => Alert.alert('참여자 추가', '참여자 추가 기능은 다음 단계에서 연결할 예정입니다.')}
            style={({ pressed }) => [styles.addAvatar, { borderColor: theme.border }, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="plus" color={theme.text} size={22} />
          </Pressable>
          <AppText variant="caption" style={styles.participantLabel}>추가</AppText>
        </View>
      </View>
    </View>
  );
}

type LocationInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSearch: () => void;
  selectedPlace: PlaceSearchResult | null;
};

function LocationInput({ value, onChangeText, onSearch, selectedPlace }: LocationInputProps) {
  const theme = useAppTheme();

  return (
    <View style={styles.fieldGroup}>
      <AppText style={styles.label}>장소</AppText>
      <View style={[styles.locationInput, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.locationTextArea}>
          <TextInput onChangeText={onChangeText} placeholder="장소를 입력하세요" placeholderTextColor={theme.textSecondary} style={[styles.locationTextInput, { color: theme.text }]} value={value} />
          {selectedPlace && (
            <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.selectedPlaceAddress}>
              {selectedPlace.roadAddress}
            </AppText>
          )}
        </View>
        <Pressable
          accessibilityLabel={selectedPlace ? '장소 변경' : '장소 검색'}
          accessibilityRole="button"
          hitSlop={4}
          onPress={onSearch}
          style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="map-marker-outline" color={brandColors.coral} size={21} />
        </Pressable>
      </View>
    </View>
  );
}

function ActionButtons({ onSubmit }: { onSubmit: () => void }) {
  const theme = useAppTheme();

  return (
    <View style={styles.actionRow}>
      <Pressable
        accessibilityRole="button"
        onPress={() => Alert.alert('초안 저장', '초안 저장 기능은 다음 단계에서 연결할 예정입니다.')}
        style={({ pressed }) => [
          styles.actionButton,
          styles.draftButton,
          { backgroundColor: theme.surface, borderColor: theme.border },
          pressed && styles.pressed,
        ]}
      >
        <AppText variant="button" style={styles.draftButtonText}>초안 저장</AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onSubmit}
        style={({ pressed }) => [styles.actionButton, styles.submitButton, pressed && styles.pressed]}
      >
        <AppText variant="button" style={styles.submitButtonText}>공동 일정 등록</AppText>
      </Pressable>
    </View>
  );
}

export default function TogetherEventCreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string | string[]; startTime?: string | string[]; endTime?: string | string[] }>();
  const { personalEvents, savePersonalEvent } = useShiftSchedule();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(0);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<PlaceSearchResult | null>(null);
  const [memo, setMemo] = useState('');
  const prefill = parseAppointmentPrefill(params.date, params.startTime, params.endTime);
  const selectedGap: SelectedGap = prefill ? (() => {
    const date = new Date(`${prefill.localDate}T12:00:00`);
    const durationMinutes = Number(prefill.endTime.slice(0, 2)) * 60
      + Number(prefill.endTime.slice(3, 5))
      - Number(prefill.startTime.slice(0, 2)) * 60
      - Number(prefill.startTime.slice(3, 5));
    return {
      localDate: prefill.localDate,
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      weekday: new Intl.DateTimeFormat('ko-KR', { weekday: 'long' }).format(date),
      slots: [{ start: prefill.startTime, end: prefill.endTime, durationHours: durationMinutes / 60 }],
    };
  })() : MOCK_SELECTED_GAP;

  useFocusEffect(
    useCallback(() => {
      const place = consumePendingPlaceSelection();
      if (place) {
        setSelectedPlace(place);
        setLocation(place.name);
      }
    }, []),
  );

  const revealMemoAboveKeyboard = () => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 180);
  };

  const saveSharedEvent = async () => {
    if (!title.trim()) {
      Alert.alert('일정 제목을 입력해주세요.');
      return;
    }
    const selectedSlot = selectedGap.slots[selectedSlotIndex];
    if (!selectedSlot) {
      Alert.alert('함께할 시간을 선택해주세요.');
      return;
    }
    const eventId = `shared-event-${Date.now()}-${personalEvents.length + 1}`;
    const saved = await savePersonalEvent({
      id: eventId,
      title: title.trim(),
      date: selectedGap.localDate,
      allDay: false,
      startTime: selectedSlot.start,
      endTime: selectedSlot.end,
      memo: memo.trim(),
      kind: 'shared',
      source: 'together',
      participants: MOCK_PARTICIPANTS.map((participant) => participant.id),
      location: location.trim(),
      place: selectedPlace ? {
        name: selectedPlace.name,
        roadAddress: selectedPlace.roadAddress,
        latitude: selectedPlace.latitude,
        longitude: selectedPlace.longitude,
        kakaoPlaceUrl: selectedPlace.kakaoPlaceUrl,
      } : undefined,
    });

    if (!saved) {
      Alert.alert('공동 일정을 저장하지 못했어요.', '잠시 후 다시 시도해 주세요.');
      return;
    }
    router.push({
      pathname: '/together-event-detail',
      params: {
        eventId,
      },
    });
  };

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoiding}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
        >
          <Header onBack={() => router.back()} />
          <View style={styles.form}>
            <SelectedGapCard onSelectSlot={setSelectedSlotIndex} selectedGap={selectedGap} selectedSlotIndex={selectedSlotIndex} />
            <FormInput
              label="일정 제목"
              maxLength={40}
              onChangeText={setTitle}
              placeholder="예) 영화 관람, 저녁 식사 등"
              returnKeyType="next"
              value={title}
            />
            <Participants />
            <LocationInput
              onChangeText={(value) => {
                setLocation(value);
                setSelectedPlace(null);
              }}
              onSearch={() => router.push('/together-place-search')}
              selectedPlace={selectedPlace}
              value={location}
            />
            <FormInput
              label="메모 (선택)"
              maxLength={200}
              multiline
              onChangeText={setMemo}
              onFocus={revealMemoAboveKeyboard}
              placeholder="메모를 입력하세요"
              value={memo}
            />
            <ActionButtons onSubmit={() => void saveSharedEvent()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 0,
    paddingTop: spacing.xs,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.lg,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  headerButton: {
    alignItems: 'center',
    borderRadius: radius.xxl,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerTitle: {
    fontSize: 18,
    lineHeight: 24,
  },
  form: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  selectedGapCard: {
    backgroundColor: '#FFF1EA',
    borderColor: '#F5D8CC',
    borderCurve: 'continuous',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectedGapHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  selectedDate: {
    color: brandColors.deepNavy,
    fontSize: 14,
    lineHeight: 20,
  },
  selectedTime: {
    color: brandColors.coral,
    fontSize: 23,
    lineHeight: 30,
  },
  singleSlotRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  selectedIconPanel: {
    alignItems: 'center',
    backgroundColor: '#FFE4D8',
    borderRadius: radius.md,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  twoSlotList: {
    gap: spacing.xxs,
  },
  slotRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.xs,
  },
  selectedSlotRow: {
    backgroundColor: '#FFF6F1',
  },
  slotNumber: {
    alignItems: 'center',
    backgroundColor: brandColors.coral,
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  slotNumberText: {
    color: brandColors.white,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  slotTime: {
    color: brandColors.coral,
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
  },
  slotDurationBadge: {
    backgroundColor: '#FFE4D8',
    borderRadius: radius.xxl,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  slotDurationText: {
    color: brandColors.coral,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  slotSelectionIndicator: {
    alignItems: 'center',
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  slotDivider: {
    backgroundColor: '#F2D8CD',
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.xxs,
  },
  totalRow: {
    alignItems: 'center',
    borderTopColor: '#F2D8CD',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginTop: spacing.xxs,
    paddingTop: spacing.xs,
  },
  totalLabel: {
    color: brandColors.deepNavy,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  totalBadge: {
    alignItems: 'center',
    backgroundColor: brandColors.coral,
    borderRadius: radius.xxl,
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 25,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
  },
  totalBadgeText: {
    color: brandColors.white,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  manySlotsArea: {
    gap: spacing.xs,
  },
  horizontalSlotList: {
    gap: spacing.xs,
    paddingRight: spacing.xs,
  },
  horizontalSlotBlock: {
    backgroundColor: '#FFF8F4',
    borderColor: '#F2D8CD',
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xxs,
    minWidth: 126,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  selectedHorizontalSlotBlock: {
    backgroundColor: '#FFF6F1',
    borderColor: brandColors.coral,
  },
  horizontalSlotHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  horizontalSlotMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  horizontalSlotTime: {
    color: brandColors.coral,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  memoInput: {
    minHeight: 76,
    paddingTop: spacing.sm,
  },
  participantRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  participantItem: {
    alignItems: 'center',
    gap: spacing.xxs,
    minWidth: 48,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avatarInitial: {
    color: brandColors.deepNavy,
    fontWeight: '700',
  },
  participantLabel: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  addAvatar: {
    alignItems: 'center',
    borderRadius: 20,
    borderStyle: 'dashed',
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  locationInput: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 46,
    paddingLeft: spacing.md,
  },
  locationTextArea: {
    flex: 1,
    paddingVertical: 3,
  },
  locationTextInput: {
    fontSize: 14,
    minHeight: 30,
    paddingVertical: 3,
  },
  selectedPlaceAddress: {
    fontSize: 11,
    lineHeight: 15,
    paddingBottom: 3,
  },
  locationButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingTop: spacing.xxs,
  },
  actionButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: spacing.sm,
  },
  draftButton: {},
  draftButtonText: {
    fontSize: 14,
  },
  submitButton: {
    backgroundColor: brandColors.coral,
    borderColor: brandColors.coral,
  },
  submitButtonText: {
    color: brandColors.white,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.78,
  },
});
