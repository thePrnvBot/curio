import type { Session } from "@curio/auth";
import type { Database } from "@curio/db";

export type Context = {
  session: Session | null;
  db: Database;
};
