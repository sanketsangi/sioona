/**
 * Next request after a weekly upload often hits a different instance.
 * Its `/tmp` still has Sample. When Neon already has this export's chats,
 * replace that local store so Insights, Eval, Taxonomy, and the sidebar
 * render the upload.
 */

import { getPilotSettings } from "./backend-client";
import { tryHydrateStoreFromNeon } from "./hydrate-conversations";
import type { StoreData } from "./types";
import {
  isLivePartnerKeepSet,
  listUploadedChatFiles,
  vaultFileIsLoaded,
  vaultFileMatchesKeepSet,
} from "./vault-file";
import { isVaultShowcaseFile } from "./vault-showcase";

function stampedLiveKeepSet(store: StoreData): boolean {
  const name = store.pilot?.lastUploadedFileName?.trim() ?? "";
  if (!isLivePartnerKeepSet(name) || store.conversations.length === 0) {
    return false;
  }
  return store.conversations.some((conversation) =>
    vaultFileMatchesKeepSet(conversation.sourceFile, name),
  );
}

export async function adoptNeonKeepSetWhenLocalMisses(
  store: StoreData,
  requestedFile: string | null,
  options?: { freshOnly?: boolean },
): Promise<StoreData> {
  if (requestedFile && isVaultShowcaseFile(requestedFile)) return store;

  const localName = store.pilot?.lastUploadedFileName;
  const catalog = listUploadedChatFiles(store.conversations, localName);
  const stamped = stampedLiveKeepSet(store);
  if (
    stamped &&
    (!requestedFile ||
      vaultFileIsLoaded(requestedFile, localName, catalog, store.conversations.length))
  ) {
    return store;
  }
  if (
    requestedFile &&
    !isLivePartnerKeepSet(requestedFile) &&
    vaultFileIsLoaded(
      requestedFile,
      localName,
      catalog,
      store.conversations.length,
    )
  ) {
    return store;
  }

  let remoteName = "";
  try {
    const remote = await getPilotSettings(store.tenant.id);
    remoteName = remote?.last_uploaded_file_name?.trim() ?? "";
  } catch {
    return store;
  }
  if (!isLivePartnerKeepSet(remoteName)) return store;
  if (requestedFile && !vaultFileMatchesKeepSet(requestedFile, remoteName)) {
    return store;
  }
  if (stamped && vaultFileMatchesKeepSet(localName, remoteName)) return store;

  const hydrated = await tryHydrateStoreFromNeon({
    syncPredictions: false,
    ...(options?.freshOnly ? { freshOnly: true } : {}),
  });
  if (!hydrated || hydrated.conversations.length === 0) return store;
  const hydratedName = hydrated.pilot?.lastUploadedFileName?.trim() ?? "";
  if (!vaultFileMatchesKeepSet(hydratedName, remoteName)) return store;
  if (!stampedLiveKeepSet(hydrated)) return store;
  return hydrated;
}
