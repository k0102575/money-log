/// <reference types="node" />
import { AsyncLocalStorage } from "node:async_hooks";
import type { Session } from "./auth.server";

export const requestSessions = new AsyncLocalStorage<
  Map<string, Promise<Session | null>>
>();
