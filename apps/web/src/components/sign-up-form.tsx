import { Button } from "@curio/ui/components/button";
import { Input } from "@curio/ui/components/input";
import { Label } from "@curio/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { playInteractionCue } from "@/utils/sound";

import Loader from "./loader";

export default function SignUpForm({
  onSwitchToSignIn,
}: {
  onSwitchToSignIn: () => void;
}) {
  const navigate = useNavigate({
    from: "/",
  });
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: value.name,
        },
        {
          onSuccess: () => {
            playInteractionCue("success", { emphasis: "subtle" });
            navigate({
              to: "/chat",
            });
            toast.success("Sign up successful");
          },
          onError: (error) => {
            playInteractionCue("error", { emphasis: "subtle" });
            toast.error(error.error.message || error.error.statusText);
          },
        }
      );
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-md flex-col justify-center p-6">
      <div className="mb-6 flex flex-col items-center gap-1.5 text-center">
        <span className="bg-primary/10 text-primary mb-1 flex size-10 items-center justify-center rounded-xl">
          <SparklesIcon aria-hidden="true" className="size-5" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="text-muted-foreground text-sm">
          Start learning anything, your way.
        </p>
      </div>

      <div className="bg-card rounded-xl border p-6 shadow-xs">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            form.handleSubmit();
          }}
        >
          <div>
            <form.Field name="name">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Name</Label>
                  <Input
                    aria-describedby={
                      field.state.meta.errors.length > 0
                        ? `${field.name}-error`
                        : undefined
                    }
                    aria-invalid={field.state.meta.errors.length > 0}
                    autoComplete="name"
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error, errorIndex) => (
                    <p
                      className="text-destructive text-sm"
                      id={`${field.name}-error`}
                      key={`${field.name}-error-${errorIndex}`}
                    >
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </form.Field>
          </div>

          <div>
            <form.Field name="email">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Email</Label>
                  <Input
                    aria-describedby={
                      field.state.meta.errors.length > 0
                        ? `${field.name}-error`
                        : undefined
                    }
                    aria-invalid={field.state.meta.errors.length > 0}
                    autoComplete="email"
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    type="email"
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error, errorIndex) => (
                    <p
                      className="text-destructive text-sm"
                      id={`${field.name}-error`}
                      key={`${field.name}-error-${errorIndex}`}
                    >
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </form.Field>
          </div>

          <div>
            <form.Field name="password">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Password</Label>
                  <Input
                    aria-describedby={
                      field.state.meta.errors.length > 0
                        ? `${field.name}-error`
                        : undefined
                    }
                    aria-invalid={field.state.meta.errors.length > 0}
                    autoComplete="new-password"
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    type="password"
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error, errorIndex) => (
                    <p
                      className="text-destructive text-sm"
                      id={`${field.name}-error`}
                      key={`${field.name}-error-${errorIndex}`}
                    >
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </form.Field>
          </div>

          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Button
                className="w-full"
                disabled={!canSubmit || isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Submitting..." : "Sign Up"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </div>

      <div className="mt-4 text-center">
        <Button
          variant="link"
          onClick={() => {
            playInteractionCue("tap", { emphasis: "subtle" });
            onSwitchToSignIn();
          }}
        >
          Already have an account? Sign In
        </Button>
      </div>
    </div>
  );
}
