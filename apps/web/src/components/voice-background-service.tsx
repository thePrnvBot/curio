import { useEffect, useRef, useState } from "react";

import { useTRPCClient } from "@/utils/trpc";
import { runVoiceBackgroundSweep } from "@/utils/voice/voice-background";
import {
  getOrSynthesizeUtterance,
  readVoicePreferences,
  restartVoiceWorker,
  stopVoiceWorker,
  subscribeToVoicePreferences,
  warmVoiceWorker,
} from "@/utils/voice/voice-manager";
import type { VoicePreferences } from "@/utils/voice/voice-manager";
import { narrationLog } from "@/utils/voice/voice-playback";

/** How often to look for lessons generated since the last pass. Cached lines
 * make a repeat sweep mostly IndexedDB probes. */
const RESWEEP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Keeps narration alive outside the course page. Mounted in the authenticated
 * layout, so navigating between chats, courses, settings and the dashboard
 * never tears down the worker or the prefill queue. It also owns the GPU
 * preference lifecycle: changing the adapter restarts the worker so the next
 * load uses the new device.
 */
export function VoiceBackgroundService(): null {
  const trpcClient = useTRPCClient();
  const [preferences, setPreferences] =
    useState<VoicePreferences>(readVoicePreferences);

  useEffect(
    () =>
      subscribeToVoicePreferences(() => {
        setPreferences(readVoicePreferences());
      }),
    []
  );

  // The worker is configured when it boots, so an adapter change needs a new
  // worker. Model weights stay in the browser cache across the restart.
  const gpuPreferenceRef = useRef(preferences.gpuPreference);
  useEffect(() => {
    if (gpuPreferenceRef.current === preferences.gpuPreference) {
      return;
    }
    gpuPreferenceRef.current = preferences.gpuPreference;
    narrationLog("gpu preference changed -> restarting worker");
    restartVoiceWorker();
  }, [preferences.gpuPreference]);

  // Stop background work if the authenticated shell goes away (logout).
  useEffect(
    () => () => {
      stopVoiceWorker("authenticated shell unmounted");
    },
    []
  );

  useEffect(() => {
    const { enabled, gpuPreference, speed, voiceId } = preferences;
    if (!enabled) {
      stopVoiceWorker("narration disabled");
      return;
    }
    narrationLog(
      "background narration active:",
      voiceId,
      `${speed}x`,
      gpuPreference
    );

    let cancelled = false;
    let sweepRunning = false;

    const sweep = async (): Promise<void> => {
      if (sweepRunning || cancelled) {
        return;
      }
      sweepRunning = true;
      try {
        const result = await runVoiceBackgroundSweep({
          getCourse: async (courseId) =>
            await trpcClient.courses.get.query({ courseId }),
          getLesson: async ({ courseId, lessonId }) =>
            await trpcClient.courses.getLesson.query({ courseId, lessonId }),
          isCancelled: () => cancelled,
          listCourses: async () => await trpcClient.courses.list.query(),
          synthesize: (text) =>
            getOrSynthesizeUtterance(text, readVoicePreferences()),
        });
        if (!result.cancelled) {
          narrationLog(
            "background sweep:",
            `${result.linesQueued} lines across ${result.lessonsVisited} lessons`,
            result.failedLessons === 0
              ? ""
              : `(${result.failedLessons} skipped)`
          );
        }
      } catch (sweepError: unknown) {
        narrationLog(
          "background sweep failed:",
          sweepError instanceof Error ? sweepError.message : sweepError
        );
      }
      sweepRunning = false;
    };

    // Load the model before the first lesson is opened, then keep filling
    // voice lines for every guided lesson in the active course(s).
    warmVoiceWorker();
    void sweep();
    const interval = window.setInterval(() => {
      void sweep();
    }, RESWEEP_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [preferences, trpcClient]);

  return null;
}
