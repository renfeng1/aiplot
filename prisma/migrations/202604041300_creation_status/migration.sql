CREATE TYPE "CreationStatus" AS ENUM ('DRAFT', 'DISTILLING', 'FAILED', 'READY');

ALTER TABLE "Character"
ADD COLUMN "creationStatus" "CreationStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "creationStage" TEXT,
ADD COLUMN "creationProgress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "creationMessage" TEXT,
ADD COLUMN "lastError" TEXT,
ADD COLUMN "draftInput" JSONB,
ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);

UPDATE "Character"
SET
  "creationStatus" = CASE
    WHEN "currentVersionId" IS NOT NULL THEN 'READY'::"CreationStatus"
    ELSE 'FAILED'::"CreationStatus"
  END,
  "creationStage" = CASE
    WHEN "currentVersionId" IS NOT NULL THEN 'ready'
    ELSE 'failed'
  END,
  "creationProgress" = 100,
  "creationMessage" = CASE
    WHEN "currentVersionId" IS NOT NULL THEN '角色已经准备好了'
    ELSE '角色上次创建未完成'
  END,
  "lastError" = CASE
    WHEN "currentVersionId" IS NOT NULL THEN NULL
    ELSE COALESCE("lastError", '角色上次创建未完成')
  END,
  "lastHeartbeatAt" = COALESCE("updatedAt", NOW())
WHERE "deletedAt" IS NULL;
