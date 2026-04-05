import "server-only";

import slugify from "slugify";

import { getDb } from "@/db/prisma";
import { ApiError } from "@/server/http";
import type {
  CharacterVisibility,
  CreateCharacterInput,
  CreationStatus,
  DistilledCharacter,
  VoiceProfileInput,
} from "@/types";

export type CharacterDraftInput = Pick<
  CreateCharacterInput,
  | "description"
  | "type"
  | "visibility"
  | "tags"
  | "sourceIds"
  | "pastedText"
  | "tier"
  | "distillModelId"
  | "targetCharacterName"
  | "targetCharacterAliases"
  | "userRoleHint"
  | "sourceFormatHint"
>;

function normalizePersistedCharacterState<T extends {
  creationStatus: CreationStatus;
  currentVersionId: string | null;
  creationStage: string | null;
  creationProgress: number;
  creationMessage: string | null;
  lastError: string | null;
}>(character: T) {
  if (character.currentVersionId && character.creationStatus === "DRAFT") {
    return {
      ...character,
      creationStatus: "READY" as const,
      creationStage: character.creationStage ?? "ready",
      creationProgress:
        character.creationProgress > 0 ? character.creationProgress : 100,
      creationMessage: character.creationMessage ?? "角色已经可用。",
      lastError: null,
    };
  }

  return character;
}

export function buildCharacterDraftInput(
  input: CreateCharacterInput,
): CharacterDraftInput {
  return {
    description: input.description,
    type: input.type,
    visibility: input.visibility,
    tags: [...input.tags],
    sourceIds: [...input.sourceIds],
    pastedText: input.pastedText,
    tier: input.tier,
    distillModelId: input.distillModelId,
    targetCharacterName: input.targetCharacterName,
    targetCharacterAliases: [...input.targetCharacterAliases],
    userRoleHint: input.userRoleHint,
    sourceFormatHint: input.sourceFormatHint,
  };
}

export async function uniqueCharacterSlug(seed: string) {
  const db = getDb();
  const base =
    slugify(seed, { lower: true, strict: true, trim: true }) || "character";

  let slug = base;
  let suffix = 1;

  while (await db.character.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }

  return slug;
}

export async function createCharacterShell(options: {
  userId?: string | null;
  input: CreateCharacterInput;
  disclaimer: string;
}) {
  const db = getDb();
  const slug = await uniqueCharacterSlug(options.input.title);
  const draftInput = buildCharacterDraftInput(options.input);

  return db.character.create({
    data: {
      userId: options.userId ?? null,
      slug,
      title: options.input.title,
      description: options.input.description,
      shortDescription: options.input.description,
      type: options.input.type,
      visibility: options.input.visibility,
      tags: options.input.tags,
      disclaimer: options.disclaimer,
      creationStatus: "DRAFT",
      creationStage: "draft",
      creationProgress: 0,
      creationMessage: "角色草稿已创建。",
      draftInput,
      lastHeartbeatAt: new Date(),
    },
  });
}

export async function updateCharacterCreationState(options: {
  characterId: string;
  status?: CreationStatus;
  stage?: string | null;
  progress?: number | null;
  message?: string | null;
  lastError?: string | null;
  draftInput?: CharacterDraftInput | null;
  heartbeat?: boolean;
}) {
  const db = getDb();

  return db.character.update({
    where: { id: options.characterId },
    data: {
      creationStatus: options.status,
      creationStage: options.stage,
      creationProgress: options.progress ?? undefined,
      creationMessage: options.message,
      lastError: options.lastError,
      draftInput: options.draftInput ?? undefined,
      lastHeartbeatAt: options.heartbeat === false ? undefined : new Date(),
    },
  });
}

export async function markCharacterReady(options: {
  characterId: string;
  versionId?: string | null;
}) {
  const db = getDb();

  return db.character.update({
    where: { id: options.characterId },
    data: {
      currentVersionId: options.versionId ?? undefined,
      creationStatus: "READY",
      creationStage: "ready",
      creationProgress: 100,
      creationMessage: "角色已经准备完成。",
      lastError: null,
      lastHeartbeatAt: new Date(),
    },
  });
}

export async function createCharacterVersion(options: {
  characterId: string;
  versionNumber: number;
  input: Pick<CreateCharacterInput, "title" | "description">;
  distilled: DistilledCharacter;
  personaPrompt: string;
  memorySummary: string;
  welcomeMessage: string;
  sourceSummary: string;
  modelUsed?: string;
  tierUsed?: string;
  voiceProfile?: VoiceProfileInput | null;
}) {
  const db = getDb();

  const version = await db.characterVersion.create({
    data: {
      characterId: options.characterId,
      versionNumber: options.versionNumber,
      titleSnapshot: options.input.title,
      descriptionSnapshot: options.input.description,
      personaPrompt: options.personaPrompt,
      memorySummary: options.memorySummary,
      welcomeMessage: options.welcomeMessage,
      sourceSummary: options.sourceSummary,
      characterProfile: options.distilled,
      voiceProfileJson: options.voiceProfile ?? undefined,
      modelUsed: options.modelUsed,
      tierUsed: options.tierUsed,
      confidence: options.distilled.confidence,
      completeness: options.distilled.completeness,
    },
  });

  await db.character.update({
    where: { id: options.characterId },
    data: { currentVersionId: version.id },
  });

  if (options.voiceProfile) {
    await db.voiceProfile.create({
      data: {
        characterId: options.characterId,
        characterVersionId: version.id,
        name: options.input.title,
        provider: options.voiceProfile.provider,
        model: options.voiceProfile.model,
        voiceId: options.voiceProfile.voiceId,
        preset: options.voiceProfile.preset,
        styleInstructions: options.voiceProfile.styleInstructions,
        speed: options.voiceProfile.speed,
        stability: options.voiceProfile.stability,
        similarity: options.voiceProfile.similarity,
        expressiveLevel: options.voiceProfile.expressiveLevel,
        language: options.voiceProfile.language,
        speakingRegister: options.voiceProfile.speakingRegister,
        pauseStyle: options.voiceProfile.pauseStyle,
        emotionBaseline: options.voiceProfile.emotionBaseline,
        energy: options.voiceProfile.energy,
        pitchHint: options.voiceProfile.pitchHint,
        styleExamples: options.voiceProfile.styleExamples,
      },
    });
  }

  return version;
}

export async function getOwnedCharacterById(options: {
  id: string;
  userId?: string | null;
  localUserId?: string | null;
}) {
  const userId = options.userId ?? options.localUserId;
  if (!userId) {
    return null;
  }

  const db = getDb();
  const character = await db.character.findFirst({
    where: {
      id: options.id,
      deletedAt: null,
      userId,
    },
    include: {
      currentVersion: true,
      sourceFiles: true,
      voiceProfiles: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return character ? normalizePersistedCharacterState(character) : null;
}

export async function requireOwnedCharacter(options: {
  id: string;
  userId?: string | null;
  localUserId?: string | null;
}) {
  const character = await getOwnedCharacterById(options);
  if (!character) {
    throw new ApiError("角色不存在或无权访问。", 404, "CHARACTER_NOT_FOUND");
  }

  return character;
}

export async function softDeleteOwnedCharacter(options: {
  id: string;
  userId?: string | null;
  localUserId?: string | null;
}) {
  const character = await requireOwnedCharacter(options);
  const db = getDb();

  await db.character.update({
    where: { id: character.id },
    data: {
      deletedAt: new Date(),
    },
  });

  return character;
}

export async function softDeleteCharacterByActor(options: {
  id: string;
  actorUserId: string;
  actorRole: "SUPER_ADMIN" | "USER";
}) {
  const db = getDb();
  const character = await db.character.findUnique({
    where: { id: options.id },
  });

  if (!character || character.deletedAt) {
    throw new ApiError("角色不存在或已删除。", 404, "CHARACTER_NOT_FOUND");
  }

  const canDelete =
    character.userId === options.actorUserId ||
    (options.actorRole === "SUPER_ADMIN" && character.visibility === "PUBLIC");

  if (!canDelete) {
    throw new ApiError("无权删除该角色。", 403, "FORBIDDEN");
  }

  await db.character.update({
    where: { id: character.id },
    data: {
      deletedAt: new Date(),
    },
  });

  return character;
}

export async function listOwnedCharacters(options: {
  userId?: string | null;
  localUserId?: string | null;
  take?: number;
}) {
  const userId = options.userId ?? options.localUserId;
  if (!userId) {
    return [];
  }

  const db = getDb();
  const characters = await db.character.findMany({
    where: {
      deletedAt: null,
      userId,
    },
    include: {
      currentVersion: true,
    },
    orderBy: { updatedAt: "desc" },
    take: options.take,
  });

  return characters.map((character) =>
    normalizePersistedCharacterState(character),
  );
}

export async function listPublicCharacters(options?: { take?: number }) {
  const db = getDb();
  const characters = await db.character.findMany({
    where: {
      deletedAt: null,
      visibility: "PUBLIC",
      creationStatus: "READY",
      currentVersionId: { not: null },
    },
    include: {
      currentVersion: true,
      voiceProfiles: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: options?.take,
  });

  return characters;
}

export async function listAdminPublicCharacters() {
  const db = getDb();
  return db.character.findMany({
    where: {
      deletedAt: null,
      visibility: "PUBLIC",
    },
    include: {
      currentVersion: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function ensureCharacterAccess(options: {
  slug: string;
  userId?: string | null;
  localUserId?: string | null;
}) {
  const userId = options.userId ?? options.localUserId;
  const db = getDb();
  const character = await db.character.findUnique({
    where: { slug: options.slug },
    include: {
      currentVersion: true,
      voiceProfiles: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      sourceFiles: true,
    },
  });

  if (!character || character.deletedAt) {
    return null;
  }

  if (
    character.visibility === ("PRIVATE" satisfies CharacterVisibility) &&
    character.userId !== userId
  ) {
    return null;
  }

  return character;
}

export async function requireCharacterAccess(options: {
  slug: string;
  userId?: string | null;
  localUserId?: string | null;
}) {
  const character = await ensureCharacterAccess(options);
  if (!character) {
    throw new ApiError("角色不存在或无权访问。", 404, "CHARACTER_NOT_FOUND");
  }

  return character;
}
