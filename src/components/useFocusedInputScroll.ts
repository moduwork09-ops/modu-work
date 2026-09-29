import { useCallback, useEffect, useRef } from 'react';
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, TextInput } from 'react-native';

/** Keep the focused field and nearby actions visible after Android resizes for the keyboard. */
export function useFocusedInputScroll(clearance = 72) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef<number | null>(null);

  const scrollFocusedInput = useCallback(() => {
    const input = TextInput.State.currentlyFocusedInput();
    if (!input || keyboardTop.current === null) return;
    input.measureInWindow((_x, y, _width, height) => {
      if (keyboardTop.current === null) return;
      const overlap = y + height + clearance - keyboardTop.current;
      if (overlap > 0) scrollRef.current?.scrollTo({ y: scrollY.current + overlap, animated: true });
    });
  }, [clearance]);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      requestAnimationFrame(scrollFocusedInput);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => { keyboardTop.current = null; });
    return () => { shown.remove(); hidden.remove(); };
  }, [scrollFocusedInput]);

  return {
    scrollRef,
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => { scrollY.current = event.nativeEvent.contentOffset.y; },
    onInputFocus: () => { requestAnimationFrame(scrollFocusedInput); },
  };
}
