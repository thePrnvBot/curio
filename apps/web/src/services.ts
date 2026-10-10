import { createAuth } from "@curio/auth";
import { createDb } from "@curio/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
