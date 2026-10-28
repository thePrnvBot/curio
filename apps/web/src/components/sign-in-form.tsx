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

export default function SignInForm({
  onSwitchToSignUp,
}: {
  onSwitchToSignUp: () => void;
}) {
  const navigate = useNavigate({
    from: "/",
  });
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            playInteractionCue("success", { emphasis: "subtle" });
            navigate({
              to: "/dashboard",
            });
            toast.success("Sign in successful");
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
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground text-sm">
          Sign in to keep learning.
        </p>
      </div>

      <div className="bg-card shadow-xs rounded-xl border p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
        <div>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-destructive text-sm">
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
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-destructive text-sm">
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
              type="submit"
              className="w-full"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Sign In"}
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
            onSwitchToSignUp();
          }}
        >
          Need an account? Sign Up
        </Button>
      </div>
    </div>
  );
}
