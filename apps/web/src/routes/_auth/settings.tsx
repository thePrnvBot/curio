import { Badge } from "@curio/ui/components/badge";
import { Button } from "@curio/ui/components/button";
import { Skeleton } from "@curio/ui/components/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@curio/ui/components/tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AtSignIcon,
  InfoIcon,
  MonitorIcon,
  MoonStarIcon,
  SunIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useReducer, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { toast } from "sonner";

import { getRuntimeSettings } from "@/functions/get-runtime-settings";
import {
  disableInteractionSounds,
  enableInteractionSounds,
  playInteractionCue,
  soundSettingEnabled,
} from "@/utils/sound";
import { useTRPC } from "@/utils/trpc";
import {
  detectVoiceGpus,
  voiceGpuFallbackLabel,
} from "@/utils/voice/voice-gpu";
import type { VoiceGpuDetection } from "@/utils/voice/voice-gpu";
import {
  getVoiceCatalog,
  readVoicePreferences,
  saveVoicePreferences,
  subscribeToVoicePreferences,
} from "@/utils/voice/voice-manager";
import type {
  VoiceGpuPreference,
  VoicePreferences,
} from "@/utils/voice/voice-manager";
import type { VoiceCatalogEntry } from "@/utils/voice/voice-worker-protocol";

import {
  canRemoveProviderKey,
  customProviderNeedsKey,
  providerKeyUpdateToInput,
  resolveProviderKeyUpdate,
} from "./-settings-provider-key";
import type { ProviderChoice } from "./-settings-provider-key";
import { soundToggleReducer } from "./-settings-sound-state";

export const Route = createFileRoute("/_auth/settings")({
  component: SettingsRoute,
});

const THEME_OPTIONS: {
  icon: ReactElement;
  label: string;
  theme: "dark" | "light" | "system";
}[] = [
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

interface ProviderFormState {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: ProviderChoice;
}

/* ------------------------------- row layout ------------------------------- */

/** Vercel-style settings row: title on the left (with the explanation hidden
 * behind a hover ⓘ icon), the one control that belongs to the setting on the
 * right, hairline dividers between rows. No cards, no boxed panels. */
function SettingsRow({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}): ReactElement {
  return (
    <div className="grid gap-3 py-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-10">
      <div>
        <div className="flex items-center gap-1.5">
          <h2 className="text-foreground text-sm font-medium">{title}</h2>
          <TooltipProvider delay={120}>
            <Tooltip>
              <TooltipTrigger
                aria-label={`About ${title}`}
                className="focus-visible:ring-ring/60 text-muted-foreground/50 hover:text-muted-foreground inline-flex cursor-help items-center rounded-sm outline-none focus-visible:ring-2"
              >
                <InfoIcon aria-hidden="true" className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent className="text-left leading-relaxed" side="top">
                {description}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ----------------------------- shared controls ---------------------------- */

interface SegmentedOption {
  readonly icon?: ReactElement;
  readonly label: string;
  readonly value: string;
}

/** Flat segmented control: a single hairline border with divider separators.
 * The active segment is tinted; nothing is raised or boxed. */
function SegmentedControl({
  ariaLabel,
  onSelect,
  options,
  value,
}: {
  ariaLabel: string;
  onSelect: (value: string) => void;
  options: readonly SegmentedOption[];
  value: string;
}): ReactElement {
  return (
    <fieldset
      aria-label={ariaLabel}
      className="border-border inline-flex h-9 items-stretch divide-x overflow-hidden rounded-lg border"
    >
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            aria-pressed={isActive}
            className={`flex min-w-0 items-center justify-center gap-1.5 px-3 text-xs font-medium whitespace-nowrap transition-colors ${
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            key={option.value}
            onClick={() => {
              onSelect(option.value);
            }}
            type="button"
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

/** Minimal switch: track + knob, no surrounding chrome. */
function SettingSwitch({
  ariaLabel,
  checked,
  disabled,
  onToggle,
}: {
  ariaLabel: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <button
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`focus-visible:ring-ring/40 relative h-5 w-9 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 ${
        checked ? "bg-primary" : "bg-input"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      disabled={disabled}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span
        className={`bg-background absolute top-0.5 left-0.5 rounded-full shadow-xs transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        } size-4`}
      />
    </button>
  );
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
        className="bg-input/20 placeholder:text-muted-foreground/60 text-foreground focus-visible:ring-ring/40 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
        onChange={(inputEvent) => props.onChange(inputEvent.target.value)}
        placeholder={props.placeholder}
        type={props.type ?? "text"}
        value={props.value}
      />
    </label>
  );
}

/* --------------------------- model provider row --------------------------- */

function providerLabel(provider: ProviderChoice | undefined): string {
  if (provider === undefined) {
    return "Server default";
  }
  if (provider === "openai") {
    return "OpenAI";
  }
  return "OpenAI-compatible";
}

function gpuStatusMessage(detection: VoiceGpuDetection | null): string {
  if (detection === null) {
    return "Looking for GPUs…";
  }
  if (!detection.webgpuAvailable) {
    return "WebGPU is unavailable in this browser; narration runs on CPU (WASM).";
  }
  if (detection.namesHidden) {
    return "Firefox hides WebGPU adapter names for privacy. The options above are the distinct adapters Firefox exposed, chosen by power hint. ONNX Runtime's WebGPU backend is not officially supported on Firefox, so narration may fall back to CPU (WASM); choose CPU only for reliable playback.";
  }
  if (detection.adapters.length === 0) {
    return "WebGPU is available but returned no adapter; narration runs on CPU (WASM).";
  }
  return "These are the GPUs WebGPU exposed to this page. Chrome on Windows shares one adapter with the whole browser; to force the discrete GPU, set Chrome to High performance under Windows Settings → System → Display → Graphics (or enable chrome://flags/#force-high-performance-gpu).";
}

function compareVoiceGrades(first: string, second: string): number {
  if (first === "") {
    return 1;
  }
  if (second === "") {
    return -1;
  }
  return first.localeCompare(second);
}

function ActiveModelStatus({
  activeHost,
  activeModel,
  activeProviderLabel,
  isUsingSavedProvider,
}: {
  activeHost: string | null;
  activeModel: string;
  activeProviderLabel: string;
  isUsingSavedProvider: boolean;
}): ReactElement {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Active model
      </p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <p className="truncate text-sm font-semibold tracking-tight">
            {activeModel}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {activeProviderLabel}
            {activeHost === null ? "" : ` · ${activeHost}`}
          </p>
        </div>
        {isUsingSavedProvider ? (
          <Badge>Custom</Badge>
        ) : (
          <Badge variant="outline">Default</Badge>
        )}
      </div>
    </div>
  );
}

function ProviderFormFields({
  form,
  setForm,
}: {
  form: ProviderFormState;
  setForm: (next: ProviderFormState) => void;
}): ReactElement {
  return (
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
            : "API key (required for custom endpoints)"
        }
        onChange={(value) => {
          setForm({ ...form, apiKey: value });
        }}
        placeholder="sk-..."
        type="password"
        value={form.apiKey}
      />
      {form.provider === "openai-compatible" ? (
        <p className="text-muted-foreground text-xs sm:col-span-2">
          Custom endpoints require your own API key. The server key is never
          sent to a host you choose.
        </p>
      ) : null}
    </div>
  );
}

function ProviderKeyStatus({
  clearRequested,
  hasSavedKey,
  provider,
  typedKey,
}: {
  clearRequested: boolean;
  hasSavedKey: boolean;
  provider: ProviderChoice;
  typedKey: string;
}): ReactElement | null {
  if (provider === "openai-compatible" && hasSavedKey) {
    return (
      <div className="space-y-1">
        {typedKey.trim() === "" ? (
          <p className="text-muted-foreground text-xs">Saved key in use</p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Custom endpoints require an API key. Use “Use default” to remove this
          provider and its saved key.
        </p>
      </div>
    );
  }
  if (clearRequested) {
    return (
      <p className="text-muted-foreground text-xs">
        The saved key will be removed when you save.
      </p>
    );
  }
  if (hasSavedKey && typedKey.trim() === "") {
    return <p className="text-muted-foreground text-xs">Saved key in use</p>;
  }
  return null;
}

function ProviderActions({
  canRemoveKey,
  hasSavedKey,
  isBusy,
  isUsingSavedProvider,
  onRemoveKey,
  onReset,
  onSave,
  saveDisabled,
}: {
  canRemoveKey: boolean;
  hasSavedKey: boolean;
  isBusy: boolean;
  isUsingSavedProvider: boolean;
  onRemoveKey: () => void;
  onReset: () => void;
  onSave: () => void;
  saveDisabled: boolean;
}): ReactElement {
  return (
    <div className="flex items-center justify-end gap-2">
      {hasSavedKey && canRemoveKey ? (
        <Button
          disabled={saveDisabled}
          onClick={onRemoveKey}
          size="sm"
          variant="ghost"
        >
          Remove saved key
        </Button>
      ) : null}
      {isUsingSavedProvider ? (
        <Button disabled={isBusy} onClick={onReset} size="sm" variant="outline">
          Use default
        </Button>
      ) : null}
      <Button disabled={saveDisabled} onClick={onSave} size="sm">
        Save provider
      </Button>
    </div>
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
  const [clearRequested, setClearRequested] = useState(false);

  function updateForm(next: ProviderFormState): void {
    if (next.apiKey !== form.apiKey || next.provider !== form.provider) {
      setClearRequested(false);
    }
    setForm(next);
  }

  // Initialize the form from the server settings once; deriving this from
  // the query data during render would reset user edits on every render.
  // The update is scheduled in a rAF so React Compiler does not see it as a
  // synchronous setState inside the effect.
  useEffect(() => {
    if (formInitialized || settingsQuery.data === undefined) {
      return;
    }
    const { data } = settingsQuery;
    const frame = requestAnimationFrame(() => {
      setFormInitialized(true);
      if (data === null) {
        return;
      }
      const { baseUrl, model, provider } = data;
      setForm({
        apiKey: "",
        baseUrl: baseUrl ?? "",
        model,
        provider,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [formInitialized, settingsQuery]);

  const setSettingsMutation = useMutation(
    trpc.modelSettings.set.mutationOptions()
  );
  const clearSettingsMutation = useMutation(
    trpc.modelSettings.clear.mutationOptions()
  );

  const isBusy =
    setSettingsMutation.isPending || clearSettingsMutation.isPending;
  const hasSavedKey = settingsQuery.data?.hasApiKey ?? false;

  function saveProvider({
    clearKey = false,
  }: {
    clearKey?: boolean;
  } = {}): void {
    const keyUpdate = resolveProviderKeyUpdate({
      clearRequested: clearKey || clearRequested,
      hasSavedKey,
      typedKey: form.apiKey,
    });
    setSettingsMutation.mutate(
      {
        apiKey: providerKeyUpdateToInput(keyUpdate),
        baseUrl: form.baseUrl.trim() === "" ? null : form.baseUrl.trim(),
        model: form.model.trim(),
        provider: form.provider,
      },
      {
        onError: (mutationError) => {
          toast.error(mutationError.message);
        },
        onSuccess: (saved) => {
          setClearRequested(false);
          setForm((current) => ({ ...current, apiKey: "" }));
          queryClient.setQueryData(trpc.modelSettings.get.queryKey(), saved);
          void queryClient.invalidateQueries({
            queryKey: trpc.modelSettings.get.queryKey(),
          });
          playInteractionCue("success");
          toast.success("Model provider saved");
        },
      }
    );
  }

  function removeSavedKey(): void {
    setClearRequested(true);
    saveProvider({ clearKey: true });
  }

  function resetToDefault(): void {
    clearSettingsMutation.mutate(undefined, {
      onError: (mutationError) => {
        toast.error(mutationError.message);
      },
      onSuccess: () => {
        setClearRequested(false);
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
    return <Skeleton className="h-9 w-full max-w-72" />;
  }

  if (settingsQuery.isError) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-3">
        <p className="text-muted-foreground text-xs">
          Could not load your saved provider settings.
        </p>
        <Button
          onClick={() => {
            void settingsQuery.refetch();
          }}
          size="sm"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    );
  }

  const { data: savedSettings } = settingsQuery;
  const isUsingSavedProvider =
    savedSettings !== null && savedSettings !== undefined;
  // A custom endpoint needs a key saved for that same provider; the server
  // rejects anything else. Blank still means "keep" when that key exists.
  const needsCustomKey = customProviderNeedsKey({
    hasApiKey: hasSavedKey,
    provider: form.provider,
    savedSettings,
    typedKey: form.apiKey,
  });
  const runtimeSettings = runtimeQuery.isError ? undefined : runtimeQuery.data;

  const activeModel = isUsingSavedProvider
    ? savedSettings.model
    : (runtimeSettings?.model ?? "—");
  const activeProviderLabel = providerLabel(
    isUsingSavedProvider ? savedSettings.provider : undefined
  );
  let activeHost: string | null = null;
  if (isUsingSavedProvider) {
    if (
      savedSettings.provider === "openai-compatible" &&
      savedSettings.baseUrl !== null
    ) {
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
      {/* Current state: model + origin, stated plainly - no banner. */}
      <ActiveModelStatus
        activeHost={activeHost}
        activeModel={activeModel}
        activeProviderLabel={activeProviderLabel}
        isUsingSavedProvider={isUsingSavedProvider}
      />

      <SegmentedControl
        ariaLabel="Provider"
        onSelect={(value) => {
          updateForm({ ...form, provider: value as ProviderChoice });
        }}
        options={[
          { label: "OpenAI", value: "openai" },
          { label: "OpenAI-compatible", value: "openai-compatible" },
        ]}
        value={form.provider}
      />

      <ProviderFormFields form={form} setForm={updateForm} />

      <ProviderKeyStatus
        clearRequested={clearRequested}
        hasSavedKey={hasSavedKey}
        provider={form.provider}
        typedKey={form.apiKey}
      />

      <ProviderActions
        canRemoveKey={canRemoveProviderKey(form.provider)}
        hasSavedKey={hasSavedKey}
        isBusy={isBusy}
        isUsingSavedProvider={isUsingSavedProvider}
        onRemoveKey={removeSavedKey}
        onReset={resetToDefault}
        onSave={() => {
          saveProvider();
        }}
        saveDisabled={isBusy || form.model.trim() === "" || needsCustomKey}
      />
    </div>
  );
}

/* ------------------------------ page - rows ------------------------------- */

function SettingsRoute(): ReactElement {
  const { session } = Route.useRouteContext();
  const { theme, setTheme } = useTheme();
  const [soundState, dispatchSound] = useReducer(soundToggleReducer, {
    kind: "uninitialized",
  });
  const [narrationPreferences, setNarrationPreferences] =
    useState<VoicePreferences>(readVoicePreferences);
  const [voiceCatalog, setVoiceCatalog] = useState<
    readonly VoiceCatalogEntry[]
  >([]);
  const [voiceCatalogState, setVoiceCatalogState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [gpuDetection, setGpuDetection] = useState<VoiceGpuDetection | null>(
    null
  );

  // Hydration guard + initial sound preference read; these are client-only
  // values so they must be set after mount. The initial reads are scheduled
  // in a rAF so React Compiler does not see them as synchronous setState.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      dispatchSound({ type: "hydrate", enabled: soundSettingEnabled() });
    });
    const unsubscribe = subscribeToVoicePreferences(() => {
      setNarrationPreferences(readVoicePreferences());
    });
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, []);

  // Voice catalog is loaded once after mount; the select stays disabled until
  // it resolves so it never shows an empty dropdown.
  useEffect(() => {
    let cancelled = false;
    async function loadVoiceCatalog(): Promise<void> {
      try {
        const catalog = await getVoiceCatalog();
        if (!cancelled) {
          setVoiceCatalog(catalog);
          setVoiceCatalogState("ready");
        }
      } catch {
        if (!cancelled) {
          setVoiceCatalogState("error");
        }
      }
    }
    void loadVoiceCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  // Adapter discovery only powers option labels; the preference is a WebGPU
  // power hint, not an adapter index (the web API has no such thing).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const detection = await detectVoiceGpus();
      if (!cancelled) {
        setGpuDetection(detection);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleSound(): Promise<void> {
    if (soundState.kind === "enabled") {
      disableInteractionSounds();
      dispatchSound({ type: "request-disable" });
      playInteractionCue("toggle", { emphasis: "subtle" });
      return;
    }
    dispatchSound({ type: "request-enable" });
    try {
      // Trust the browser's answer over the toggle state: without a
      // successful unlock nothing will sound.
      const unlocked = await enableInteractionSounds();
      if (unlocked) {
        dispatchSound({ type: "enable-succeeded" });
        playInteractionCue("toggle");
      } else {
        dispatchSound({ type: "enable-failed" });
        toast.error("Audio is unavailable in this browser");
      }
    } catch {
      // enableInteractionSounds already surfaces failures via its own
      // error handling; the toggle just needs to reset its busy state.
      dispatchSound({ type: "enable-failed" });
    }
  }

  const isNarrationEnabled = narrationPreferences.enabled;
  const gpuAdapters = gpuDetection?.adapters ?? [];
  const currentGpuIsListed =
    narrationPreferences.gpuPreference === "wasm" ||
    gpuAdapters.some(
      (adapter) => adapter.id === narrationPreferences.gpuPreference
    );

  return (
    <div className="mx-auto w-full max-w-3xl shrink-0 px-6 pt-8 pb-20">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your account, appearance, narration voice and model provider.
        </p>
      </header>

      <div className="divide-border mt-6 divide-y">
        {/* Profile */}
        <SettingsRow
          description="Your account details, used to greet you and attribute your work."
          title="Profile"
        >
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
              {(session?.user.name ?? "C").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {session?.user.name}
              </p>
              <p className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
                <AtSignIcon className="size-3 shrink-0" aria-hidden="true" />
                {session?.user.email}
              </p>
            </div>
          </div>
        </SettingsRow>

        {/* Appearance */}
        <SettingsRow
          description="Choose whether Curio follows your device theme or stays light or dark here."
          title="Appearance"
        >
          {soundState.kind === "uninitialized" ? (
            <Skeleton className="h-9 w-56" />
          ) : (
            <SegmentedControl
              ariaLabel="Theme"
              onSelect={(value) => {
                playInteractionCue("select", { emphasis: "subtle" });
                setTheme(value as "dark" | "light" | "system");
              }}
              options={THEME_OPTIONS.map((themeOption) => ({
                icon: themeOption.icon,
                label: themeOption.label,
                value: themeOption.theme,
              }))}
              // The control reflects the stored preference (the persisted
              // choice), not the resolved appearance - otherwise picking
              // System while the OS is dark would highlight two chips.
              value={theme ?? "system"}
            />
          )}
        </SettingsRow>

        {/* Interaction sounds */}
        <SettingsRow
          description="Play soft audio cues when you act across Curio. No audio plays until the browser allows it."
          title="Interaction sounds"
        >
          {soundState.kind === "uninitialized" ? (
            <Skeleton className="h-5 w-9" />
          ) : (
            <SettingSwitch
              ariaLabel="Interaction sounds"
              checked={soundState.kind === "enabled"}
              disabled={soundState.kind === "enabling"}
              onToggle={() => {
                void toggleSound();
              }}
            />
          )}
        </SettingsRow>

        {/* Lesson narration */}
        <SettingsRow
          description="Read guided lessons aloud. Pick the voice and the playback speed."
          title="Lesson narration"
        >
          {soundState.kind === "uninitialized" ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <SettingSwitch
                ariaLabel="Lesson narration"
                checked={isNarrationEnabled}
                onToggle={() => {
                  playInteractionCue("toggle", { emphasis: "subtle" });
                  saveVoicePreferences({
                    ...narrationPreferences,
                    enabled: !narrationPreferences.enabled,
                  });
                }}
              />
              <select
                aria-label="Narration voice"
                className="border-border bg-background focus-visible:ring-ring h-9 max-w-52 rounded-lg border px-2.5 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
                disabled={!isNarrationEnabled || voiceCatalogState !== "ready"}
                onChange={(changeEvent) => {
                  playInteractionCue("select", { emphasis: "subtle" });
                  saveVoicePreferences({
                    ...narrationPreferences,
                    voiceId: changeEvent.target.value,
                  });
                }}
                value={narrationPreferences.voiceId}
              >
                {voiceCatalogState === "loading" && (
                  <option value="">Loading voices…</option>
                )}
                {voiceCatalogState === "error" && (
                  <option value="">Voice catalog unavailable</option>
                )}
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
                    <optgroup
                      label={`${flag} ${languageCode}`}
                      key={languageCode}
                    >
                      {languageVoices
                        .toSorted((first, second) =>
                          compareVoiceGrades(first.grade, second.grade)
                        )
                        .map((entry) => (
                          <option key={entry.voiceId} value={entry.voiceId}>
                            {entry.displayName}
                            {entry.grade === "" ? "" : ` · ${entry.grade}`}
                          </option>
                        ))}
                    </optgroup>
                  );
                })}
              </select>
              <select
                aria-label="Narration speed"
                className="border-border bg-background focus-visible:ring-ring h-9 rounded-lg border px-2.5 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
                disabled={!isNarrationEnabled}
                onChange={(changeEvent) => {
                  playInteractionCue("select", { emphasis: "subtle" });
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
          )}
        </SettingsRow>

        {/* Narration GPU */}
        <SettingsRow
          description="Pick the GPU Kokoro should run on. WebGPU only exposes adapters by power hint, so this lists the actual GPU names the browser returns and pins the worker to the selected one. Changing it restarts the background worker; generated lines stay cached."
          title="Narration GPU"
        >
          <div className="space-y-2">
            <select
              aria-label="Narration GPU"
              className="border-border bg-background focus-visible:ring-ring h-9 w-full max-w-72 rounded-lg border px-2.5 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
              disabled={!isNarrationEnabled || gpuDetection === null}
              onChange={(changeEvent) => {
                playInteractionCue("select", { emphasis: "subtle" });
                saveVoicePreferences({
                  ...narrationPreferences,
                  gpuPreference: changeEvent.target.value as VoiceGpuPreference,
                });
              }}
              value={narrationPreferences.gpuPreference}
            >
              {gpuDetection === null ? (
                <option value="">Looking for GPUs…</option>
              ) : null}
              {gpuAdapters.map((adapter) => (
                <option key={adapter.id} value={adapter.id}>
                  {adapter.name}
                </option>
              ))}
              {currentGpuIsListed ? null : (
                <option value={narrationPreferences.gpuPreference}>
                  {voiceGpuFallbackLabel(narrationPreferences.gpuPreference)}
                </option>
              )}
              <option value="wasm">CPU only (WASM)</option>
            </select>
            <p className="text-muted-foreground text-xs">
              {gpuStatusMessage(gpuDetection)}
            </p>
          </div>
        </SettingsRow>

        {/* Model provider */}
        <SettingsRow
          description="The AI model behind the Director. Use OpenAI directly, or point at any OpenAI-compatible endpoint."
          title="Model provider"
        >
          <ModelProviderSection />
        </SettingsRow>
      </div>
    </div>
  );
}
