import { Button } from "@curio/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@curio/ui/components/dropdown-menu";
import { Skeleton } from "@curio/ui/components/skeleton";
import { Link, useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { playInteractionCue } from "@/utils/sound";

export default function UserMenu() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="h-7 w-24 rounded-full" />;
  }

  if (!session) {
    return (
      <Link to="/login">
        <Button variant="outline" className="rounded-full">
          Sign In
        </Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            // min-w-32 mirrors the dropdown's own min-w-32 floor: the popup
            // sizes to the trigger anchor, so pinning the pill at the same
            // floor keeps pill and menu exactly the same width.
            className="hover:-translate-y-0.5 min-w-32 max-w-40 truncate rounded-full hover:shadow-sm"
            variant="outline"
          />
        }
      >
        {session.user.name}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card">
        <DropdownMenuGroup>
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>{session.user.email}</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              playInteractionCue("close", { emphasis: "subtle" });
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    navigate({
                      to: "/",
                    });
                  },
                },
              });
            }}
          >
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
