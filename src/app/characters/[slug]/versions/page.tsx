import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { notFound, redirect } from "next/navigation";

import { RollbackButton } from "@/components/rollback-button";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUserPage } from "@/lib/auth";
import { getDb } from "@/db/prisma";
import { ensureCharacterAccess } from "@/server/characters";

export const dynamic = "force-dynamic";

export default async function CharacterVersionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUserPage();
  const character = await ensureCharacterAccess({
    slug,
    userId: user.id,
  });

  if (!character) {
    notFound();
  }

  const canManage =
    character.userId === user.id || user.role === "SUPER_ADMIN";

  if (!canManage) {
    redirect(`/characters/${slug}`);
  }

  const versions = await getDb().characterVersion.findMany({
    where: { characterId: character.id },
    orderBy: { versionNumber: "desc" },
  });

  return (
    <div className="pb-20">
      <SiteHeader />
      <main className="page-shell mt-6 space-y-4 sm:mt-10">
        <div className="surface px-5 py-6">
          <div className="text-xs tracking-[0.18em] text-muted-foreground">
            版本记录
          </div>
          <h1 className="mt-2 font-heading text-4xl">
            {character.title} 的版本时间线
          </h1>
        </div>

        <div className="space-y-4">
          {versions.map((version) => (
            <Card key={version.id} className="rounded-[1.75rem]">
              <CardContent className="grid gap-5 p-5 lg:grid-cols-[0.22fr_0.78fr]">
                <div className="space-y-2">
                  <div className="text-xs tracking-[0.18em] text-muted-foreground">
                    版本 {version.versionNumber}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatDistanceToNow(version.createdAt, {
                      addSuffix: true,
                      locale: zhCN,
                    })}
                  </div>
                  {character.currentVersionId === version.id ? (
                    <div className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
                      当前版本
                    </div>
                  ) : (
                    <RollbackButton
                      characterId={character.id}
                      versionId={version.id}
                    />
                  )}
                </div>
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {version.sourceSummary}
                  </div>
                  <div className="rounded-3xl bg-secondary/55 p-4">
                    <div className="text-xs tracking-[0.18em] text-muted-foreground">
                      人格提示词
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {version.personaPrompt}
                    </pre>
                  </div>
                  <div className="rounded-3xl bg-secondary/55 p-4">
                    <div className="text-xs tracking-[0.18em] text-muted-foreground">
                      记忆摘要
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {version.memorySummary}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
