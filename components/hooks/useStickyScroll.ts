"use client";

import { useCallback, useEffect, useRef, useState, type RefObject, type DependencyList } from "react";

type StickyScrollState = {
  /** True while the container is scrolled to (or near) the bottom. */
  pinned: boolean;
  /** Count of dep-changes received while unpinned. Resets when the user returns to bottom. */
  newCount: number;
  /** Imperatively scroll to the bottom and re-pin. */
  jumpToBottom: () => void;
};

const PIN_THRESHOLD_PX = 64;

/**
 * Sticky scroll behavior for a chat-style list: when the user is near the bottom,
 * incoming events auto-scroll the list. When the user scrolls up, auto-scroll
 * stops and a counter tracks how many new events arrived while unpinned. The
 * counter resets when the user manually scrolls back to the bottom OR calls
 * `jumpToBottom`.
 *
 * `deps` should be something that changes per appended event (e.g. `events.length`).
 */
export function useStickyScroll(
  ref: RefObject<HTMLElement | null>,
  deps: DependencyList,
): StickyScrollState {
  const [pinned, setPinned] = useState(true);
  const [newCount, setNewCount] = useState(0);
  // Keep `pinned` reachable inside the scroll listener without re-binding it on every
  // pin/unpin transition (which would cause flickering during scroll events).
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;

  // Track scroll position → maintain pinned state.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = (): void => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const nowPinned = distance < PIN_THRESHOLD_PX;
      if (nowPinned !== pinnedRef.current) {
        pinnedRef.current = nowPinned;
        setPinned(nowPinned);
        if (nowPinned) setNewCount(0);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);

  // On deps change (new event): auto-scroll if pinned; otherwise increment counter.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setNewCount((c) => c + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);

  const jumpToBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
    setPinned(true);
    setNewCount(0);
  }, [ref]);

  return { pinned, newCount, jumpToBottom };
}
