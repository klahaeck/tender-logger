import "server-only";

import { clerkConfigured, getIdentity } from "@/lib/auth/identity";
import { mongoConfigured } from "@/lib/db/mongodb";
import type { ParentingRepository, RequestContext } from "./repository";
import { MemoryParentingRepository } from "./memory-repository";

let repository: ParentingRepository | undefined;

export async function getRepository(): Promise<ParentingRepository> {
  if (repository) return repository;
  if (mongoConfigured()) {
    const { MongoParentingRepository } = await import("./mongo-repository");
    repository = new MongoParentingRepository();
    return repository;
  }
  if (clerkConfigured()) throw new Error("MONGODB_REQUIRED");
  repository = new MemoryParentingRepository();
  return repository;
}

export async function getRequestContext(): Promise<RequestContext> {
  const identity = await getIdentity();
  const repo = await getRepository();
  return repo.resolveContext(identity);
}

export function resetRepositoryForTests(): void {
  repository = undefined;
}
