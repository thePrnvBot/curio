import { MAX_CUSTOM_INSTRUCTIONS_LENGTH } from "@curio/api/domain/learning-preferences";
import { Badge } from "@curio/ui/components/badge";
import { Button } from "@curio/ui/components/button";
import { Input } from "@curio/ui/components/input";
import { Skeleton } from "@curio/ui/components/skeleton";
import { Textarea } from "@curio/ui/components/textarea";
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

import { PageContainer, PageHeader } from "@/components/page-layout";
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
    <div className="grid gap-3 py-7 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-12">
      <div>
        <div className="flex items-center gap-1.5">
          <h2 className="text-foreground text-[13px] font-medium">{title}</h2>
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
      className="border-border bg-background inline-flex h-8 items-stretch divide-x overflow-hidden rounded-lg border"
    >
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            aria-pressed={isActive}
            className={`flex min-w-0 items-center justify-center gap-1.5 px-3 text-xs font-medium whitespace-nowrap transition-colors duration-150 ${
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
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
        checked ? "bg-brand" : "bg-input"
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

const selectClass =
  "border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/25 dark:bg-white/[0.03] h-8 rounded-md border px-2.5 text-[13px] transition-[border-color,box-shadow] duration-150 outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";

function ProviderField(props: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "password" | "text" | "url";
  value: string;
}): ReactElement {
  return (
    <label className="block">
      <span className="text-muted-foreground mb-1.5 block text-[11px] font-medium tracking-[0.06em] uppercase">
        {props.label}
      </span>
      <Input
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

function gpuStatusMessage(detection: VoiceGpuDetection | null): string | null {
  if (detection === null) {
    return "Looking for graphics cards…";
  }
  if (!detection.webgpuAvailable) {
    return "This browser can't use a graphics card for narration, so Curio will use the CPU instead. Lessons still play, but audio may take longer to start.";
  }
  if (detection.namesHidden) {
    return null;
  }
  if (detection.adapters.length === 0) {
    return "No graphics card was found for narration, so Curio will use the CPU. Lessons still play, but audio may take longer to start.";
  }
  return "These are the graphics cards this browser can use for narration. On Windows, Chrome uses a single card for the whole browser; to prefer your faster card, set Chrome to High performance under Windows Settings → System → Display → Graphics.";
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
      <p className="section-label">Active model</p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <p className="truncate text-[13.5px] font-medium tracking-[-0.01em]">
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
            ? "API key (optional — uses Curio's shared key)"
            : "API key (required for custom services)"
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
          Custom services need your own API key. Curio’s shared key is never
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
          <p className="text-muted-foreground text-xs">Using your saved key</p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Custom services need an API key. Choose “Use default” to remove this
          provider and its saved key.
        </p>
      </div>
    );
  }
  if (clearRequested) {
    return (
      <p className="text-muted-foreground text-xs">
        Your saved key will be removed when you save.
      </p>
    );
  }
  if (hasSavedKey && typedKey.trim() === "") {
    return <p className="text-muted-foreground text-xs">Using your saved key</p>;
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
      <div className="border-border flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-3">
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

/* --------------------------- learning preferences -------------------------- */

function LearningPreferencesSection(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const preferencesQuery = useQuery(
    trpc.learningPreferences.get.queryOptions()
  );
  const [instructions, setInstructions] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Initialize once from the server value; deriving the textarea from query
  // data during render would overwrite edits on every refetch.
  useEffect(() => {
    if (initialized || preferencesQuery.data === undefined) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      setInitialized(true);
      setInstructions(preferencesQuery.data?.customInstructions ?? "");
    });
    return () => cancelAnimationFrame(frame);
  }, [initialized, preferencesQuery.data]);

  const setMutation = useMutation(
    trpc.learningPreferences.set.mutationOptions()
  );

  if (preferencesQuery.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (preferencesQuery.isError) {
    return (
      <div className="border-border flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-3">
        <p className="text-muted-foreground text-xs">
          Could not load your learning preferences.
        </p>
        <Button
          onClick={() => {
            void preferencesQuery.refetch();
          }}
          size="sm"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    );
  }

  const savedInstructions = preferencesQuery.data?.customInstructions ?? "";
  const isDirty = instructions.trim() !== savedInstructions.trim();
  const isTooLong = instructions.length > MAX_CUSTOM_INSTRUCTIONS_LENGTH;

  function savePreferences(): void {
    setMutation.mutate(
      { customInstructions: instructions },
      {
        onError: (mutationError) => {
          toast.error(mutationError.message);
        },
        onSuccess: (saved) => {
          queryClient.setQueryData(
            trpc.learningPreferences.get.queryKey(),
            saved
          );
          setInstructions(saved.customInstructions);
          playInteractionCue("success");
          toast.success("Learning preferences saved");
        },
      }
    );
  }

  return (
    <div className="space-y-3">
      <Textarea
        aria-label="Learning preferences for the Director"
        className="min-h-28"
        maxLength={MAX_CUSTOM_INSTRUCTIONS_LENGTH}
        onChange={(changeEvent) => {
          setInstructions(changeEvent.target.value);
        }}
        placeholder="e.g. Explain with analogies and concrete examples. Keep lessons under 10 minutes. Quiz me every few lessons. Avoid jargon until I ask for it."
        rows={5}
        value={instructions}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {`${instructions.length}/${MAX_CUSTOM_INSTRUCTIONS_LENGTH} · Applied to every Director chat.`}
        </p>
        <Button
          disabled={!isDirty || isTooLong || setMutation.isPending}
          onClick={savePreferences}
          size="sm"
        >
          Save preferences
        </Button>
      </div>
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
  const gpuStatus = gpuStatusMessage(gpuDetection);
  const currentGpuIsListed =
    narrationPreferences.gpuPreference === "wasm" ||
    gpuAdapters.some(
      (adapter) => adapter.id === narrationPreferences.gpuPreference
    );

  return (
    <div className="-mt-14 min-h-0 flex-1 overflow-y-auto overscroll-none">
      <PageContainer className="pt-20" width="narrow">
        <PageHeader
          description="Your profile, appearance, narration, and the model that powers the Director."
          title="Settings"
        />

        <div className="divide-border divide-y">
        {/* Profile */}
        <SettingsRow
          description="Your account details. Curio uses them to greet you and credit your work."
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
          description="Follow your device's theme, or keep Curio light or dark."
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
          description="Soft sounds as you click, select, and save. Browsers only allow audio after a click, so turning this on is all that's needed."
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

        {/* Learning preferences */}
        <SettingsRow
          description="Tell the Director how you learn best. These notes shape every lesson: pace, depth, tone, examples, and study strategies."
          title="Learning preferences"
        >
          <LearningPreferencesSection />
        </SettingsRow>

        {/* Lesson narration */}
        <SettingsRow
          description="Have guided lessons read aloud in the voice and at the speed you choose."
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
                className={`${selectClass} max-w-52`}
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
                className={selectClass}
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
          description="Choose the graphics card (GPU) that creates narration audio. A faster card gets lessons speaking sooner; the CPU option works everywhere but is slower. Changes apply right away, and audio you've already generated is kept."
          title="Narration GPU"
        >
          <div className="space-y-2">
            <select
              aria-label="Narration GPU"
              className={`${selectClass} w-full max-w-72`}
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
                <option value="">Looking for graphics cards…</option>
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
              <option value="wasm">CPU only (slower)</option>
            </select>
            {gpuStatus === null ? null : (
              <p className="text-muted-foreground text-xs">{gpuStatus}</p>
            )}
          </div>
        </SettingsRow>

        {/* Model provider */}
        <SettingsRow
          description="The AI model that powers the Director. Use OpenAI, or connect any service that supports the same API."
          title="Model provider"
        >
          <ModelProviderSection />
        </SettingsRow>
        </div>
      </PageContainer>
    </div>
  );
}
