import "server-only";

import {
  buildCharacterDraftInput,
  markCharacterReady,
  updateCharacterCreationState,
} from "@/server/characters";
import { distillCharacter } from "@/server/distillation";
import { ApiError } from "@/server/http";
import type { CreateCharacterInput } from "@/types";

export type CreationProgressEvent = {
  stage: string;
  progress: number;
  message: string;
  slug: string;
  characterId: string;
  currentVersionId?: string | null;
  lastError?: string | null;
};

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "角色蒸馏失败。";
}

export function isCreationStale(lastHeartbeatAt?: Date | null) {
  if (!lastHeartbeatAt) {
    return true;
  }

  return Date.now() - lastHeartbeatAt.getTime() > 30_000;
}

export async function runCharacterCreation(options: {
  characterId: string;
  slug: string;
  userId?: string | null;
  input: CreateCharacterInput;
  onEvent?: (event: CreationProgressEvent) => void | Promise<void>;
}) {
  const draftInput = buildCharacterDraftInput(options.input);

  const emit = async (event: Omit<CreationProgressEvent, "slug" | "characterId">) => {
    const payload: CreationProgressEvent = {
      ...event,
      slug: options.slug,
      characterId: options.characterId,
    };

    await options.onEvent?.(payload);
  };

  await updateCharacterCreationState({
    characterId: options.characterId,
    status: "DISTILLING",
    stage: "uploading",
    progress: 5,
    message: "角色草稿已创建，开始蒸馏…",
    lastError: null,
    draftInput,
  });

  await emit({
    stage: "uploading",
    progress: 5,
    message: "角色草稿已创建，开始蒸馏…",
  });

  try {
    const result = await distillCharacter({
      characterId: options.characterId,
      userId: options.userId,
      input: options.input,
      onStage: async (event) => {
        await updateCharacterCreationState({
          characterId: options.characterId,
          status: event.stage === "ready" ? "READY" : "DISTILLING",
          stage: event.stage,
          progress: event.progress,
          message: event.message,
          lastError: null,
          draftInput,
        });

        await emit(event);
      },
    });

    await markCharacterReady({
      characterId: options.characterId,
      versionId: result.version.id,
    });

    await emit({
      stage: "ready",
      progress: 100,
      message: "角色已经蒸馏完成，可以开始对话。",
      currentVersionId: result.version.id,
    });

    return {
      ok: true as const,
      result,
    };
  } catch (error) {
    const lastError = errorMessage(error);

    await updateCharacterCreationState({
      characterId: options.characterId,
      status: "FAILED",
      stage: "failed",
      progress: 100,
      message: lastError,
      lastError,
      draftInput,
    });

    await emit({
      stage: "failed",
      progress: 100,
      message: lastError,
      lastError,
    });

    return {
      ok: false as const,
      error,
      message: lastError,
    };
  }
}
