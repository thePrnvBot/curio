import { Badge } from "@curio/ui/components/badge";
import { Button } from "@curio/ui/components/button";
import { Skeleton } from "@curio/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AtSignIcon,
  CpuIcon,
  MonitorIcon,
  MoonStarIcon,
  SunIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactElement } from "react";
import { toast } from "sonner";

import { getRuntimeSettings } from "@/functions/get-runtime-settings";
import {
  disableInteractionSounds,
  enableInteractionSounds,
  playInteractionCue,
  soundSettingEnabled,
} from "@/utils/sound";
import {
  getVoiceCatalog,
  readVoicePreferences,
  saveVoicePreferences,
  subscribeToVoicePreferences,
} from "@/utils/voice/voice-manager";
import type { VoicePreferences } from "@/utils/voice/voice-manager";
import type { VoiceCatalogEntry } from "@/utils/voice/voice-worker-protocol";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardRoute,
});

const THEME_OPTIONS: Array<{
  icon: ReactElement;
  label: string;
  theme: "dark" | "light" | "system";
}> = [
  {
    icon: <SunIcon className="size-4" aria-hidden="true" />,
    label: "Light",
    theme: "light",
  },
  {
    icon: <MoonStarIcon className="size-4" aria-hidden="true" />,
    label: "Dark",
    theme: "dark",
  },
  {
    icon: <MonitorIcon className="size-4" aria-hidden="true" />,
    label: "System",
    theme: "system",
  },
];

type ProviderChoice = "openai" | "openai-compatible";

interface ProviderFormState {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: ProviderChoice;
}

function ProviderField(props: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "password" | "text" | "url";
  value: string;
}): ReactElement {
  return (
    <label className="block">
      <span className="text-muted-foreground mb-1.5 block text-xs font-medium tracking-wide uppercase">
        {props.label}
      </span>
      <input
        className="bg-input/20 placeholder:text-muted-foreground/60 text-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onChange={(inputEvent) => props.onChange(inputEvent.target.value)}
        placeholder={props.placeholder}
        type={props.type ?? "text"}
        value={props.value}
      />
    </label>
  );
}

function SectionHeader({ children }: { children: string }): ReactElement {
  return (
    <h2 className="text-muted-foreground mb-3 text-sm font-medium tracking-widest uppercase">
      {children}
    </h2>
  );
}

function ModelProviderSection(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(trpc.modelSettings.get.queryOptions());
  const runtimeQuery = useQuery({
    queryFn: () => getRuntimeSettings(),
    queryKey: ["runtime-settings"],
  });

  const [form, setForm] = useState<ProviderFormState>({
    apiKey: "",
    baseUrl: "",
    model: "",
    provider: "openai",
  });
  const [formInitialized, setFormInitialized] = useState(false);

  useEffect(() => {
    if (formInitialized || settingsQuery.data === undefined) {
      return;
    }
    setFormInitialized(true);
    if (settingsQuery.data === null) {
      return;
    }
    setForm({
      apiKey: "",
      baseUrl: settingsQuery.data.baseUrl ?? "",
      model: settingsQuery.data.model,
      provider: settingsQuery.data.provider,
    });
  }, [formInitialized, settingsQuery.data]);

  const setSettingsMutation = useMutation(
    trpc.modelSettings.set.mutationOptions()
  );
  const clearSettingsMutation = useMutation(
    trpc.modelSettings.clear.mutationOptions()
  );

  const isBusy =
    setSettingsMutation.isPending || clearSettingsMutation.isPending;

  function saveProvider(): void {
    setSettingsMutation.mutate(
      {
        apiKey: form.apiKey.trim() === "" ? null : form.apiKey.trim(),
        baseUrl: form.baseUrl.trim() === "" ? null : form.baseUrl.trim(),
        model: form.model.trim(),
        provider: form.provider,
      },
      {
        onError: (mutationError) => {
          toast.error(mutationError.message);
        },
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: trpc.modelSettings.get.queryKey(),
          });
          playInteractionCue("success");
          toast.success("Model provider saved");
        },
      }
    );
  }

  function resetToDefault(): void {
    clearSettingsMutation.mutate(undefined, {
      onError: (mutationError) => {
        toast.error(mutationError.message);
      },
      onSuccess: () => {
        setForm({ apiKey: "", baseUrl: "", model: "", provider: "openai" });
        void queryClient.invalidateQueries({
          queryKey: trpc.modelSettings.get.queryKey(),
        });
        playInteractionCue("close", { emphasis: "subtle" });
        toast.success("Using the server default provider again");
      },
    });
  }

  if (settingsQuery.isPending) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-52" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const savedSettings = settingsQuery.data;
  const isUsingSavedProvider = savedSettings !== null && savedSettings !== undefined;
  const runtimeSettings = runtimeQuery.isError ? undefined : runtimeQuery.data;

  const activeModel = isUsingSavedProvider
    ? savedSettings.model
    : (runtimeSettings?.model ?? "—");
  const activeProviderLabel = isUsingSavedProvider
    ? savedSettings.provider === "openai"
      ? "OpenAI"
      : "OpenAI-compatible"
    : "Server default";
  let activeHost: string | null = null;
  if (isUsingSavedProvider) {
    if (savedSettings.provider === "openai-compatible" && savedSettings.baseUrl !== null) {
      try {
        activeHost = new URL(savedSettings.baseUrl).host;
      } catch {
        activeHost = savedSettings.baseUrl;
      }
    } else if (savedSettings.provider === "openai") {
      activeHost = "api.openai.com";
    }
  } else if (runtimeSettings !== undefined) {
    activeHost = runtimeSettings.providerHost;
  }

  return (
    <div className="space-y-4">
      {/* Active model - the single most important fact on this card. */}
      <div className="border-primary/15 bg-primary/5 flex items-center gap-3.5 rounded-xl border p-4">
        <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-full">
          <CpuIcon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-[11px] font-medium tracking-widest uppercase">
            Active model
          </p>
          <p className="truncate text-base font-semibold tracking-tight">
            {activeModel}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {activeProviderLabel}
            {activeHost !== null ? ` · ${activeHost}` : ""}
          </p>
        </div>
        {isUsingSavedProvider ? (
          <Badge>Custom</Badge>
        ) : (
          <Badge variant="outline">Default</Badge>
        )}
      </div>

      <div
        className="bg-muted/50 inline-flex items-center rounded-lg border p-1"
        role="group"
        aria-label="Provider"
      >
        {(
          [
            { label: "OpenAI", value: "openai" },
            { label: "OpenAI-compatible", value: "openai-compatible" },
          ] as const
        ).map((option) => {
          const isActive = form.provider === option.value;
          return (
            <button
              aria-pressed={isActive}
              className={
                isActive
                  ? "bg-background border-border text-foreground flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium shadow-xs"
                  : "text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              }
              key={option.value}
              onClick={() => {
                setForm({ ...form, provider: option.value });
              }}
              type="button"
            >
              <CpuIcon className="size-3.5" aria-hidden="true" />
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {form.provider === "openai-compatible" ? (
          <ProviderField
            label="Base URL"
            onChange={(value) => {
              setForm({ ...form, baseUrl: value });
            }}
            placeholder="https://api.example.com/v1"
            type="url"
            value={form.baseUrl}
          />
        ) : null}
        <ProviderField
          label="Model ID"
          onChange={(value) => {
            setForm({ ...form, model: value });
          }}
          placeholder={
            form.provider === "openai" ? "gpt-4o-mini" : "glm-4.6, kimi-k2, ..."
          }
          value={form.model}
        />
        <ProviderField
          label={
            form.provider === "openai"
              ? "API key (optional - falls back to the server key)"
              : "API key (optional - falls back to the shared key)"
          }
          onChange={(value) => {
            setForm({ ...form, apiKey: value });
          }}
          placeholder="sk-..."
          type="password"
          value={form.apiKey}
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {settingsQuery.data !== null ? (
          <Button
            disabled={isBusy}
            onClick={() => {
              resetToDefault();
            }}
            size="sm"
            variant="outline"
          >
            Use default
          </Button>
        ) : null}
        <Button
          disabled={isBusy || form.model.trim() === ""}
          onClick={() => {
            saveProvider();
          }}
          size="sm"
        >
          Save provider
        </Button>
      </div>
    </div>
  );
}

function DashboardRoute(): ReactElement {
  const { session } = Route.useRouteContext();
  const { theme, setTheme } = useTheme();
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(false);
  const [isSoundBusy, setIsSoundBusy] = useState(false);
  const [narrationPreferences, setNarrationPreferences] =
    useState<VoicePreferences>(readVoicePreferences);
  const [voiceCatalog, setVoiceCatalog] = useState<
    readonly VoiceCatalogEntry[]
  >([]);

  useEffect(() => {
    setIsHydrated(true);
    setIsSoundEnabled(soundSettingEnabled());
    return subscribeToVoicePreferences(() => {
      setNarrationPreferences(readVoicePreferences());
    });
  }, []);

  useEffect(() => {
    void getVoiceCatalog().then((catalog) => {
      setVoiceCatalog(catalog);
    });
  }, []);

  async function toggleSound(): Promise<void> {
    if (isSoundEnabled) {
      disableInteractionSounds();
      setIsSoundEnabled(false);
      return;
    }
    setIsSoundBusy(true);
    try {
      // Trust the browser's answer over the toggle state: without a
      // successful unlock nothing will sound.
      const unlocked = await enableInteractionSounds();
      setIsSoundEnabled(unlocked);
      if (unlocked) {
        playInteractionCue("toggle");
      } else {
        toast.error("Audio is unavailable in this browser");
      }
    } finally {
      setIsSoundBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl shrink-0 px-6 pt-8 pb-20">
      <div className="mb-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        </header>
      </div>

      <div className="space-y-7">
        {/* Profile */}
        <div>
          <SectionHeader>Profile</SectionHeader>
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-full text-sm font-semibold">
              {(session?.user.name ?? "C").slice(0, 1).toUpperCase()}
            </span>
            <div>
              <p className="font-medium">{session?.user.name}</p>
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <AtSignIcon className="size-3" aria-hidden="true" />
                {session?.user.email}
              </p>
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div>
          <SectionHeader>Appearance</SectionHeader>
          {!isHydrated ? <Skeleton className="h-9 w-64" /> : null}
          {isHydrated ? (
            <div
              className="bg-muted/50 inline-flex items-center rounded-lg border p-1"
              role="group"
              aria-label="Theme"
            >
              {THEME_OPTIONS.map((option) => {
                // The segmented control reflects the stored preference (the
                // persisted choice), not the resolved appearance - otherwise
                // picking System while the OS is dark would highlight two
                // chips at once.
                const storedTheme = theme ?? "system";
                const isActive = storedTheme === option.theme;
                return (
                  <button
                    aria-pressed={isActive}
                    className={
                      isActive
                        ? "bg-background border-border text-foreground flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium shadow-xs"
                        : "text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                    }
                    key={option.theme}
                    onClick={() => {
                      playInteractionCue("select", {
                        emphasis: "subtle",
                      });
                      setTheme(option.theme);
                    }}
                    type="button"
                  >
                    {option.icon}
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {isHydrated ? (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm font-medium">Interaction sounds</span>
              <Button
                disabled={isSoundBusy}
                onClick={() => {
                  void toggleSound();
                }}
                size="sm"
                variant="outline"
              >
                {isSoundEnabled ? "Sound on" : "Sound off"}
              </Button>
            </div>
          ) : null}
          {isHydrated ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Lesson narration</span>
              <Button
                onClick={() => {
                  saveVoicePreferences({
                    ...narrationPreferences,
                    enabled: !narrationPreferences.enabled,
                  });
                }}
                size="sm"
                variant="outline"
              >
                {narrationPreferences.enabled ? "Voice on" : "Voice off"}
              </Button>
              <select
                aria-label="Narration voice"
                className="border-border bg-background h-8 max-w-52 rounded-md border px-2 text-xs"
                disabled={!narrationPreferences.enabled}
                onChange={(changeEvent) => {
                  saveVoicePreferences({
                    ...narrationPreferences,
                    voiceId: changeEvent.target.value,
                  });
                }}
                value={narrationPreferences.voiceId}
              >
                {(
                  [
                    ["en-us", "🇺🇸"],
                    ["en-gb", "🇬🇧"],
                    ["ja", "🇯🇵"],
                    ["zh", "🇨🇳"],
                    ["es", "🇪🇸"],
                    ["fr-fr", "🇫🇷"],
                    ["hi", "🇮🇳"],
                    ["it", "🇮🇹"],
                    ["pt-br", "🇧🇷"],
                  ] as const
                ).map(([languageCode, flag]) => {
                  const languageVoices = voiceCatalog.filter(
                    (entry) => entry.languageCode === languageCode
                  );
                  if (languageVoices.length === 0) {
                    return null;
                  }
                  return (
                    <optgroup label={`${flag} ${languageCode}`} key={languageCode}>
                      {languageVoices
                        .slice()
                        .sort((first, second) =>
                          first.grade === ""
                            ? 1
                            : second.grade === ""
                              ? -1
                              : first.grade.localeCompare(second.grade)
                        )
                        .map((entry) => (
                          <option key={entry.voiceId} value={entry.voiceId}>
                            {entry.displayName}
                            {entry.grade !== "" ? ` · ${entry.grade}` : ""}
                          </option>
                        ))}
                    </optgroup>
                  );
                })}
              </select>
              <select
                aria-label="Narration speed"
                className="border-border bg-background h-8 rounded-md border px-2 text-xs"
                disabled={!narrationPreferences.enabled}
                onChange={(changeEvent) => {
                  saveVoicePreferences({
                    ...narrationPreferences,
                    speed: Number(changeEvent.target.value),
                  });
                }}
                value={narrationPreferences.speed}
              >
                {[0.8, 1, 1.1, 1.25, 1.5].map((speed) => (
                  <option key={speed} value={speed}>
                    {`${speed}x`}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {/* Model provider */}
        <div>
          <SectionHeader>Model provider</SectionHeader>
          <ModelProviderSection />
        </div>
      </div>
    </div>
  );
}
