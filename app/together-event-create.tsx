import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { DatePickerSheet, formatReadableDate, TimePickerSheet } from '../src/features/events/EventPickerSheets';
import { formatGapDuration } from '../src/features/gaps/gapCalculator';
import { consumePendingPlaceSelection, type PlaceSearchResult } from '../src/features/place-search';
import { useAuth } from '../src/features/auth/AuthContext';
import { isLocalCalendarDate } from '../src/features/together/dayOffProjection';
import { parseAppointmentPrefill } from '../src/features/together/appointmentRecommendation';
import { formatAvailabilityMinute, getTogetherAvailabilityStatusMessage, type TogetherCommonAvailability } from '../src/features/together/commonAvailabilityPresentation';
import { createSharedEventIsoRangeAcrossDates } from '../src/features/together/sharedEventDateTime';
import {
  chooseSharedEventSpaceId,
  selectActiveSharedEventSpaces,
  type SharedEventSpaceOption,
} from '../src/features/together/sharedEventSpaceSelection';
import {
  createDefaultSharedEventTime,
  findContainingAvailabilityInterval,

  type SharedEventTimeSelection,
} from '../src/features/together/sharedEventTimeSelection';
import {
  createSharedEvent,
  getTogetherGapAvailability,
  getTogetherMembers,
  getTogetherSpaces,
  isTogetherSpaceId,
  type TogetherMember,
} from '../src/features/together/togetherServerData';

type SelectedGapSlot = {
  start: string;
  end: string;
  durationMinutes: number;
};

type SelectedGap = {
  localDate: string;
  date: string;
  weekday: string;
  slots: SelectedGapSlot[];
};

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
  const totalMinutes = selectedGap.slots.reduce((sum, slot) => sum + slot.durationMinutes, 0);
  const totalHoursLabel = `총 ${formatGapDuration(totalMinutes)}`;
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
                    <AppText style={styles.slotDurationText}>{formatGapDuration(slot.durationMinutes)}</AppText>
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
                        <AppText style={styles.slotDurationText}>{formatGapDuration(slot.durationMinutes)}</AppText>
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

function SelectionField({ compact = false, label, onPress, value }: { compact?: boolean; label: string; onPress: () => void; value: string }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.fieldGroup, compact && styles.compactField]}>
      <AppText style={styles.label}>{label}</AppText>
      <Pressable accessibilityLabel={`${label} ${value}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.selectionField, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && styles.pressed]}>
        <AppText style={styles.selectionValue}>{value}</AppText>
        <MaterialCommunityIcons name="chevron-down" color={theme.textSecondary} size={20} />
      </Pressable>
    </View>
  );
}

function Participants({ members, userId }: { members: TogetherMember[]; userId: string }) {
  const theme = useAppTheme();

  return (
    <View style={styles.fieldGroup}>
      <AppText style={styles.label}>참여자</AppText>
      <View style={styles.participantRow}>
        {members.map((member, index) => {
          const label = member.userId === userId ? '나' : member.displayName?.trim() || '이름 미설정';
          return (
          <View key={member.userId} style={styles.participantItem}>
            <View style={[styles.avatar, { backgroundColor: index % 2 === 0 ? '#E7ECE3' : '#FCE0D8', borderColor: theme.border }]}>
              <AppText variant="caption" style={styles.avatarInitial}>{label === '이름 미설정' ? '?' : label.slice(0, 1)}</AppText>
            </View>
            <AppText numberOfLines={1} variant="caption" style={styles.participantLabel}>{label}</AppText>
          </View>
          );
        })}
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

function ActionButtons({ disabled, isSubmitting, onSubmit }: { disabled: boolean; isSubmitting: boolean; onSubmit: () => void }) {
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
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onSubmit}
        style={({ pressed }) => [styles.actionButton, styles.submitButton, disabled && styles.disabled, pressed && styles.pressed]}
      >
        <AppText variant="button" style={styles.submitButtonText}>{isSubmitting ? '등록 중...' : '공동 일정 등록'}</AppText>
      </Pressable>
    </View>
  );
}

type AvailabilityState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; day: TogetherCommonAvailability; ownerUserId: string; spaceId: string };

type MembersState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; members: TogetherMember[]; ownerUserId: string; spaceId: string };

type SpacesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; options: SharedEventSpaceOption[]; ownerUserId: string };

function getTodayLocalDate(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function toSelectedGap(day: TogetherCommonAvailability): SelectedGap {
  const date = new Date(`${day.localDate}T12:00:00`);
  return {
    localDate: day.localDate,
    date: `${date.getMonth() + 1}/${date.getDate()}`,
    weekday: new Intl.DateTimeFormat('ko-KR', { weekday: 'long' }).format(date),
    slots: day.intervals.map((interval) => ({
      start: formatAvailabilityMinute(interval.startMinute),
      end: formatAvailabilityMinute(interval.endMinute),
      durationMinutes: interval.endMinute - interval.startMinute,
    })),
  };
}

type CreateEventParams = { spaceId?: string | string[]; date?: string | string[]; endDate?: string | string[]; startTime?: string | string[]; endTime?: string | string[]; title?: string | string[]; timezoneName?: string | string[]; source?: string | string[] };

export default function TogetherEventCreateScreen() {
  const params = useLocalSearchParams<CreateEventParams>();
  const { session } = useAuth();
  // A new destination starts a fresh draft; picker returns with unchanged params preserve edits.
  const formKey = JSON.stringify([session?.user.id, params.spaceId, params.date, params.endDate, params.startTime, params.endTime, params.title, params.timezoneName, params.source]);
  return <TogetherEventCreateForm key={formKey} params={params} />;
}

function TogetherEventCreateForm({ params }: { params: CreateEventParams }) {
  const router = useRouter();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const requestGenerationRef = useRef(0);
  const membersRequestGenerationRef = useRef(0);
  const spacesRequestGenerationRef = useRef(0);
  const ownerUserIdRef = useRef(session?.user.id);
  ownerUserIdRef.current = session?.user.id;
  const isSubmittingRef = useRef(false);
  const isFocusedRef = useRef(false);
  const prefill = parseAppointmentPrefill(params.date, params.startTime, params.endTime);
  const rawSpaceId = params.spaceId;
  const routeSpaceId = typeof rawSpaceId === 'string' && isTogetherSpaceId(rawSpaceId) ? rawSpaceId : undefined;
  const travelPrefill = params.source === 'travel';
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>();
  const selectedSpaceIdRef = useRef(selectedSpaceId);
  const [spacesState, setSpacesState] = useState<SpacesState>({ status: 'loading' });
  const spaceOptions = spacesState.status === 'loaded' && spacesState.ownerUserId === session?.user.id
    ? spacesState.options
    : [];
  const selectedSpaceOption = spaceOptions.find(({ space }) => space.id === selectedSpaceId);
  const spaceId = selectedSpaceOption?.space.id;
  const [selectedDate, setSelectedDate] = useState(prefill?.localDate ?? (typeof params.date === 'string' && isLocalCalendarDate(params.date) ? params.date : getTodayLocalDate()));
  const [endDate, setEndDate] = useState(typeof params.endDate === 'string' && isLocalCalendarDate(params.endDate) && params.endDate >= selectedDate ? params.endDate : selectedDate);
  const [eventTime, setEventTime] = useState<SharedEventTimeSelection>({
    startTime: prefill?.startTime ?? '09:00',
    endTime: prefill?.endTime ?? '10:00',
  });
  const [availabilityState, setAvailabilityState] = useState<AvailabilityState>({ status: 'loading' });
  const [membersState, setMembersState] = useState<MembersState>({ status: 'loading' });
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(0);
  const [title, setTitle] = useState(typeof params.title === 'string' ? params.title.slice(0, 40) : '');
  const [location, setLocation] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<PlaceSearchResult | null>(null);
  const [memo, setMemo] = useState('');
  const [picker, setPicker] = useState<'date' | 'endDate' | 'start' | 'end' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const loadedDay = availabilityState.status === 'loaded'
    && availabilityState.day.localDate === selectedDate
    && availabilityState.ownerUserId === session?.user.id
    && availabilityState.spaceId === spaceId
    ? availabilityState.day
    : undefined;
  const selectedGap = endDate === selectedDate && loadedDay?.availabilityStatus === 'ready' && loadedDay.intervals.length > 0
    ? toSelectedGap(loadedDay)
    : undefined;
  const matchingSlotIndex = loadedDay?.availabilityStatus === 'ready'
    ? findContainingAvailabilityInterval(eventTime, loadedDay.intervals)
    : -1;
  const effectiveSlotIndex = matchingSlotIndex >= 0 ? matchingSlotIndex : selectedSlotIndex;
  const activeMembers = membersState.status === 'loaded'
    && membersState.ownerUserId === session?.user.id
    && membersState.spaceId === spaceId
    ? membersState.members.filter((member) => member.status === 'active')
    : [];

  useFocusEffect(
    useCallback(() => {
      const place = consumePendingPlaceSelection();
      if (place) {
        setSelectedPlace(place);
        setLocation(place.name);
      }
    }, []),
  );

  const loadSpaces = useCallback(() => {
    const requestGeneration = ++spacesRequestGenerationRef.current;
    const userId = session?.user.id;
    setSpacesState({ status: 'loading' });
    if (!userId) {
      setSelectedSpaceId(undefined);
      setSpacesState({ status: 'error' });
      return;
    }
    void getTogetherSpaces()
      .then((spaces) => Promise.all(spaces.map(async (space) => {
        try {
          return { space, members: await getTogetherMembers(space.id) };
        } catch (error) {
          if (space.id === routeSpaceId) return null;
          throw error;
        }
      })))
      .then((entries) => {
        if (!isFocusedRef.current || spacesRequestGenerationRef.current !== requestGeneration || ownerUserIdRef.current !== userId) return;
        const available = entries.filter((entry): entry is SharedEventSpaceOption => entry !== null);
        const options = selectActiveSharedEventSpaces(available, userId);
        setSpacesState({ status: 'loaded', options, ownerUserId: userId });
        const next = travelPrefill
          ? options.find(({ space }) => space.id === routeSpaceId)?.space.id
          : chooseSharedEventSpaceId(options, routeSpaceId, selectedSpaceIdRef.current);
        selectedSpaceIdRef.current = next;
        setSelectedSpaceId(next);
      })
      .catch(() => {
        if (isFocusedRef.current && spacesRequestGenerationRef.current === requestGeneration && ownerUserIdRef.current === userId) {
          setSelectedSpaceId(undefined);
          setSpacesState({ status: 'error' });
        }
      });
  }, [routeSpaceId, session?.user.id, travelPrefill]);

  const loadAvailability = useCallback(() => {
    const requestGeneration = ++requestGenerationRef.current;
    const userId = session?.user.id;
    setAvailabilityState({ status: 'loading' });
    if (!spaceId || !userId) {
      setAvailabilityState({ status: 'error' });
      return;
    }

    void getTogetherGapAvailability(spaceId, selectedDate, selectedDate)
      .then(([day]) => {
        if (requestGenerationRef.current !== requestGeneration) return;
        if (!day || day.localDate !== selectedDate) throw new Error('Invalid availability response');
        setAvailabilityState({ status: 'loaded', day, ownerUserId: userId, spaceId });

      })
      .catch(() => {
        if (requestGenerationRef.current === requestGeneration) setAvailabilityState({ status: 'error' });
      });
  }, [selectedDate, session?.user.id, spaceId]);

  const loadMembers = useCallback(() => {
    const requestGeneration = ++membersRequestGenerationRef.current;
    const userId = session?.user.id;
    setMembersState({ status: 'loading' });
    if (!spaceId || !userId) {
      setMembersState({ status: 'error' });
      return;
    }
    void getTogetherMembers(spaceId)
      .then((members) => {
        if (membersRequestGenerationRef.current !== requestGeneration) return;
        const active = members.filter((member) => member.status === 'active');
        if (!active.some((member) => member.userId === userId)) throw new Error('Invalid together members response');
        setMembersState({ status: 'loaded', members, ownerUserId: userId, spaceId });
      })
      .catch(() => {
        if (membersRequestGenerationRef.current === requestGeneration) setMembersState({ status: 'error' });
      });
  }, [session?.user.id, spaceId]);

  useFocusEffect(useCallback(() => {
    isFocusedRef.current = true;
    loadSpaces();
    return () => {
      isFocusedRef.current = false;
      spacesRequestGenerationRef.current += 1;
    };
  }, [loadSpaces]));

  useFocusEffect(useCallback(() => {
    loadAvailability();
    loadMembers();
    return () => {
      requestGenerationRef.current += 1;
      membersRequestGenerationRef.current += 1;
    };
  }, [loadAvailability, loadMembers]));

  const revealMemoAboveKeyboard = () => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 180);
  };

  const saveSharedEvent = async () => {
    if (isSubmittingRef.current) return;
    if (!title.trim()) {
      Alert.alert('일정 제목을 입력해주세요.');
      return;
    }
    if (!selectedSpaceOption
      || selectedSpaceIdRef.current !== spaceId
      || spacesState.status !== 'loaded'
      || spacesState.ownerUserId !== session?.user.id
      || !spaceId
      || !session?.user.id
      || membersState.status !== 'loaded'
      || membersState.ownerUserId !== session.user.id
      || membersState.spaceId !== spaceId
      || activeMembers.length === 0) {
      Alert.alert('참여자를 확인할 수 없어요.', '잠시 후 다시 시도해 주세요.');
      return;
    }
    isSubmittingRef.current = true;
    const submissionGeneration = requestGenerationRef.current;
    const submissionOwner = session.user.id;
    const isCurrentSubmission = () => isFocusedRef.current
      && requestGenerationRef.current === submissionGeneration
      && ownerUserIdRef.current === submissionOwner
      && selectedSpaceIdRef.current === spaceId;
    setIsSubmitting(true);
    try {
      const { startsAt, endsAt } = createSharedEventIsoRangeAcrossDates(selectedDate, endDate, eventTime, loadedDay?.timezoneName || (typeof params.timezoneName === 'string' ? params.timezoneName : Intl.DateTimeFormat().resolvedOptions().timeZone));
      const currentMembers = (await getTogetherMembers(spaceId)).filter((member) => member.status === 'active');
      if (!isCurrentSubmission()) return;
      if (!currentMembers.some((member) => member.userId === submissionOwner)) {
        throw new Error('Active membership required');
      }
      await createSharedEvent({
        spaceId,
        title: title.trim(),
        startsAt,
        endsAt,
        participantUserIds: currentMembers.map((member) => member.userId),
        memo: memo.trim() || null,
        placeName: selectedPlace?.name ?? (location.trim() || null),
        placeAddress: selectedPlace?.roadAddress ?? null,
        placeLatitude: selectedPlace?.latitude ?? null,
        placeLongitude: selectedPlace?.longitude ?? null,
        kakaoPlaceUrl: selectedPlace?.kakaoPlaceUrl ?? null,
      });
      if (isCurrentSubmission()) {
        Alert.alert('공동 일정이 등록됐어요.', undefined, [{ text: '확인', onPress: () => { if (isCurrentSubmission()) router.back(); } }]);
      }
    } catch {
      if (isCurrentSubmission()) {
        loadSpaces();
        Alert.alert('공동 일정을 저장하지 못했어요.', '그룹 권한이나 네트워크 상태를 확인한 뒤 다시 시도해 주세요.');
      }
    } finally {
      isSubmittingRef.current = false;
      if (isFocusedRef.current) setIsSubmitting(false);
    }
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
            {spacesState.status === 'loading' ? (
              <Card style={styles.availabilityStateCard}><AppText tone="secondary">공유할 그룹을 확인하고 있어요.</AppText></Card>
            ) : null}
            {spacesState.status === 'error' ? (
              <Card style={styles.availabilityStateCard}>
                <AppText>공유할 그룹을 확인할 수 없어요.</AppText>
                <Pressable accessibilityRole="button" onPress={loadSpaces} style={({ pressed }) => pressed && styles.pressed}>
                  <AppText variant="button" style={styles.retryText}>다시 시도</AppText>
                </Pressable>
              </Card>
            ) : null}
            {spacesState.status === 'loaded' && spaceOptions.length === 0 ? (
              <Card style={styles.availabilityStateCard}>
                <AppText>공동 일정을 만들려면 함께 그룹이 필요해요.</AppText>
                <Pressable accessibilityRole="button" onPress={() => router.push('/together-add')} style={({ pressed }) => pressed && styles.pressed}>
                  <AppText variant="button" style={styles.retryText}>그룹 만들기·참여하기</AppText>
                </Pressable>
              </Card>
            ) : null}
            {spacesState.status === 'loaded' && travelPrefill && !selectedSpaceOption ? (
              <Card style={styles.availabilityStateCard}><AppText>추천을 만든 그룹에 더 이상 접근할 수 없어요. 다시 여행 가능일을 검색해 주세요.</AppText></Card>
            ) : null}
            {spacesState.status === 'loaded' && spaceOptions.length > 0 ? (
              <View style={styles.fieldGroup}>
                <AppText style={styles.label}>공유할 그룹</AppText>
                {spaceOptions.length > 1 ? <AppText variant="caption" tone="secondary">일정을 공유할 그룹을 선택해 주세요.</AppText> : null}
                <Card style={styles.spaceList}>
                  {spaceOptions.map(({ space, members }) => {
                    const selected = space.id === spaceId;
                    return (
                      <Pressable
                        accessibilityLabel={'공유할 그룹 ' + space.name}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: isSubmitting || travelPrefill || spaceOptions.length === 1, selected }}
                        disabled={isSubmitting || travelPrefill || spaceOptions.length === 1}
                        key={space.id}
                        onPress={() => {
                          if (isSubmittingRef.current) return;
                          selectedSpaceIdRef.current = space.id;
                          setSelectedSpaceId(space.id);
                        }}
                        style={({ pressed }) => [styles.spaceRow, selected && styles.spaceRowSelected, pressed && styles.pressed]}
                      >
                        <View style={styles.spaceText}>
                          <AppText variant="button" numberOfLines={1}>{space.name}</AppText>
                          <AppText variant="caption" tone="secondary">{members.filter((member) => member.status === 'active').length}명</AppText>
                        </View>
                        <MaterialCommunityIcons
                          name={selected ? 'check-circle' : 'checkbox-blank-circle-outline'}
                          color={selected ? brandColors.coral : brandColors.deepNavy}
                          size={20}
                        />
                      </Pressable>
                    );
                  })}
                </Card>
              </View>
            ) : null}
            <SelectionField label="시작 날짜" onPress={() => setPicker('date')} value={formatReadableDate(selectedDate)} />
            <SelectionField label="종료 날짜" onPress={() => setPicker('endDate')} value={formatReadableDate(endDate)} />
                <View style={styles.timeSelectionRow}>
                  <SelectionField compact label="시작 시간" onPress={() => setPicker('start')} value={eventTime.startTime} />
                  <AppText style={styles.timeSeparator}>~</AppText>
                  <SelectionField compact label="종료 시간" onPress={() => setPicker('end')} value={eventTime.endTime} />
                </View>
            {availabilityState.status === 'loading' ? (
              <Card style={styles.availabilityStateCard}><AppText tone="secondary">함께 가능한 시간을 확인하고 있어요.</AppText></Card>
            ) : null}
            {availabilityState.status === 'error' ? (
              <Card style={styles.availabilityStateCard}>
                <AppText>함께 가능한 시간을 확인할 수 없어요.</AppText>
                <Pressable accessibilityRole="button" onPress={loadAvailability} style={({ pressed }) => pressed && styles.pressed}><AppText variant="button" style={styles.retryText}>다시 시도</AppText></Pressable>
              </Card>
            ) : null}
            {loadedDay && loadedDay.availabilityStatus !== 'ready' ? (
              <Card style={styles.availabilityStateCard}><AppText>{getTogetherAvailabilityStatusMessage(loadedDay)}</AppText></Card>
            ) : null}
            {loadedDay?.availabilityStatus === 'ready' && loadedDay.intervals.length === 0 ? (
              <Card style={styles.availabilityStateCard}><AppText>이 날짜에는 함께 가능한 시간이 없어요.</AppText></Card>
            ) : null}
            {selectedGap ? (
              <>
                <SelectedGapCard
                  onSelectSlot={(index) => {
                    setSelectedSlotIndex(index);
                    const interval = loadedDay?.intervals[index];
                    if (interval) setEventTime(createDefaultSharedEventTime(interval));
                  }}
                  selectedGap={selectedGap}
                  selectedSlotIndex={effectiveSlotIndex}
                />

              </>
            ) : null}
            <FormInput
              label="일정 제목"
              maxLength={40}
              onChangeText={setTitle}
              placeholder="예) 영화 관람, 저녁 식사 등"
              returnKeyType="next"
              value={title}
            />
            {membersState.status === 'loading' ? (
              <Card style={styles.availabilityStateCard}><AppText tone="secondary">참여자를 확인하고 있어요.</AppText></Card>
            ) : null}
            {membersState.status === 'error' ? (
              <Card style={styles.availabilityStateCard}>
                <AppText>참여자를 확인할 수 없어요.</AppText>
                <Pressable accessibilityRole="button" onPress={loadMembers} style={({ pressed }) => pressed && styles.pressed}><AppText variant="button" style={styles.retryText}>다시 시도</AppText></Pressable>
              </Card>
            ) : null}
            {membersState.status === 'loaded' && activeMembers.length > 0
              ? <Participants members={activeMembers} userId={session?.user.id ?? ''} />
              : null}
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
            <ActionButtons disabled={isSubmitting || !selectedSpaceOption || membersState.status !== 'loaded' || membersState.spaceId !== spaceId} isSubmitting={isSubmitting} onSubmit={() => void saveSharedEvent()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <DatePickerSheet visible={picker === 'date'} value={selectedDate} onClose={() => setPicker(null)} onConfirm={(value) => { setSelectedDate(value); setEndDate((current) => current < value ? value : current); setPicker(null); }} />
      <DatePickerSheet visible={picker === 'endDate'} value={endDate} onClose={() => setPicker(null)} onConfirm={(value) => { if (value >= selectedDate) setEndDate(value); setPicker(null); }} />
      <TimePickerSheet visible={picker === 'start'} title="시작 시간 선택" value={eventTime.startTime} onClose={() => setPicker(null)} onConfirm={(value) => { setEventTime((current) => ({ ...current, startTime: value })); setPicker(null); }} />
      <TimePickerSheet allowEndOfDay visible={picker === 'end'} title="종료 시간 선택" value={eventTime.endTime} onClose={() => setPicker(null)} onConfirm={(value) => { setEventTime((current) => ({ ...current, endTime: value })); setPicker(null); }} />
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
  compactField: {
    flex: 1,
  },
  spaceList: {
    gap: spacing.xxs,
    padding: spacing.xs,
  },
  spaceRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
  },
  spaceRowSelected: {
    backgroundColor: '#FFF1EA',
  },
  spaceText: {
    flex: 1,
    gap: 1,
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
  selectionField: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  selectionValue: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  timeSelectionRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  timeSeparator: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 46,
  },
  availabilityStateCard: {
    gap: spacing.xs,
    padding: spacing.md,
  },
  retryText: {
    color: brandColors.coral,
  },
  memoInput: {
    minHeight: 76,
    paddingTop: spacing.sm,
  },
  participantRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.78,
  },
});
