import { Badge } from "@curio/ui/components/badge";
import { Button } from "@curio/ui/components/button";
import { Skeleton } from "@curio/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AtSignIcon,
  CableIcon,
  CpuIcon,
  LogOutIcon,
  MonitorIcon,
  MoonStarIcon,
  ServerIcon,
  SunIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactElement } from "react";
import { toast } from "sonner";

import { getRuntimeSettings } from "@/functions/get-runtime-settings";
import { authClient } from "@/lib/auth-client";
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

function SectionCard(props: {
  children: React.ReactNode;
  description: string;
  title: string;
}): ReactElement {
  return (
    <div className="bg-card rounded-xl border p-6">
      <div className="mb-5">
        <h2 className="text-base font-medium tracking-tight">{props.title}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {props.description}
        </p>
      </div>
      {props.children}
    </div>
  );
}

function SettingRow(props: {
  icon: LucideIcon;
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className="text-muted-foreground flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="flex items-center gap-2.5">
        <props.icon className="size-4" aria-hidden="true" />
        {props.label}
      </span>
      <span className="text-foreground font-medium">{props.value}</span>
    </div>
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
        className="bg-input/20 placeholder:text-muted-foreground/60 text-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onChange={(inputEvent) => props.onChange(inputEvent.target.value)}
        placeholder={props.placeholder}
        type={props.type ?? "text"}
        value={props.value}
      />
    </label>
  );
}

function ModelProviderSection(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(trpc.modelSettings.get.queryOptions());

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

  const runtimeQuery = useQuery({
    queryFn: () => getRuntimeSettings(),
    queryKey: ["runtime-settings"],
  });

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

  const savedSettingLabel =
    settingsQuery.data === undefined || settingsQuery.data === null
      ? "Server default"
      : `${settingsQuery.data.model}`;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        Active saved choice:{" "}
        <Badge variant={settingsQuery.data === null ? "outline" : "default"}>
          {savedSettingLabel}
        </Badge>
      </p>

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

      <div className="flex items-center justify-between gap-4 pt-1">
        <p className="text-muted-foreground text-xs">
          {serverDefaultHint(runtimeQuery.data)}
        </p>
        <div className="flex items-center gap-2">
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
    </div>
  );
}

function serverDefaultHint(settingsData: {
  readonly model: string;
  readonly protocol: "chat-completions" | "responses";
} | undefined): string {
  if (settingsData === undefined) {
    return "The server default provider is used.";
  }
  return `Server default: ${settingsData.model} (${settingsData.protocol}).`;
}

function DashboardRoute(): ReactElement {
  const { session } = Route.useRouteContext();
  const { theme, setTheme } = useTheme();
  const [isHydrated, setIsHydrated] = useState(false);
  const runtimeQuery = useQuery({
    queryFn: () => getRuntimeSettings(),
    queryKey: ["runtime-settings"],
  });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  async function signOut(): Promise<void> {
    await authClient.signOut();
    window.location.assign("/login");
  }

  return (
    <div className="mx-auto w-full max-w-3xl shrink-0 px-6 pt-8 pb-20">
      <div className="mb-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Profile, appearance and the runtime your Director runs on.
          </p>
        </header>
      </div>

      <div className="space-y-6">
        {/* Profile */}
        <SectionCard description="Your Curio account identity" title="Profile">
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-full text-sm font-semibold">
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
        </SectionCard>

        {/* Appearance */}
        <SectionCard description="How the interface looks on this device" title="Appearance">
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
        </SectionCard>

        {/* Model provider */}
        <SectionCard
          description="Choose which provider powers the Director - OpenAI (key via OPENAI_API_KEY or a personal key below) or any OpenAI-compatible endpoint"
          title="Model provider"
        >
          <ModelProviderSection />
        </SectionCard>

        {/* Runtime */}
        <SectionCard
          description="Read-only view of the server variables the app boots with"
          title="Environment"
        >
          {runtimeQuery.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : runtimeQuery.isError ? (
            <p className="text-destructive text-sm">
              Runtime settings could not load: {runtimeQuery.error.message}
            </p>
          ) : runtimeQuery.data === undefined ? null : (
            <div className="space-y-1.5">
              <SettingRow
                icon={ServerIcon}
                label="Provider host"
                value={runtimeQuery.data.providerHost}
              />
              <SettingRow
                icon={ZapIcon}
                label="Model"
                value={runtimeQuery.data.model}
              />
              <SettingRow
                icon={CableIcon}
                label="Protocol"
                value={runtimeQuery.data.protocol}
              />
              <SettingRow
                icon={CpuIcon}
                label="Artifact publishing"
                value={
                  runtimeQuery.data.artifactPublishing
                    ? "Connected"
                    : "Not configured"
                }
              />
            </div>
          )}
        </SectionCard>

        {/* Session */}
        <SectionCard
          description="End your Curio session on this device"
          title="Session"
        >
          <Button
            className="gap-2"
            onClick={() => {
              void signOut();
            }}
            variant="outline"
          >
            <LogOutIcon className="size-4" aria-hidden="true" />
            Sign out
          </Button>
        </SectionCard>
      </div>
    </div>
  );
}
