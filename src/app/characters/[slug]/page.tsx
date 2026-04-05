import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, AudioLines, BookOpenText, Sparkles } from "lucide-react";

import { DeleteCharacterButton } from "@/components/delete-character-button";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth";
import { typeOptions } from "@/lib/constants";
import { ensureCharacterAccess } from "@/server/characters";

export const dynamic = "force-dynamic";

export default async function CharacterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const auth = await getAuthContext();
  const character = await ensureCharacterAccess({
    slug,
    localUserId: auth.localUserId,
  });

  if (!character?.currentVersion) {
    notFound();
  }

  const canManage =
    auth.isSignedIn &&
    (character.userId === auth.localUserId || auth.role === "SUPER_ADMIN");
  const typeLabel =
    typeOptions.find((item) => item.value === character.type)?.label ??
    character.type;
  const visibilityLabel = character.visibility === "PUBLIC" ? "公共角色" : "我的角色";
  const voice = character.voiceProfiles?.[0] ?? null;

  return (
    <div className="pb-20">
      <SiteHeader />
      <main className="page-shell mt-6 space-y-6 sm:mt-10">
        <section className="surface overflow-hidden px-5 py-8 sm:px-8 sm:py-10">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className="rounded-full px-3 py-1 text-xs tracking-[0.18em]"
                >
                  {typeLabel}
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded-full px-3 py-1 text-xs"
                >
                  {visibilityLabel}
                </Badge>
              </div>
              <div>
                <h1 className="font-heading text-4xl sm:text-5xl">
                  {character.title}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  {character.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {character.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild className="h-12 rounded-full px-6">
                  <Link
                    href={
                      (auth.isSignedIn
                        ? `/chat/${character.slug}`
                        : "/sign-in") as Route
                    }
                  >
                    {auth.isSignedIn ? "进入聊天" : "登录后聊天"}
                    <ArrowRight className="size-4.5" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-12 rounded-full px-6"
                >
                  <Link href={`/characters/${character.slug}/versions`}>查看版本</Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {[
                {
                  icon: Sparkles,
                  title: "人格层",
                  body: character.currentVersion.personaPrompt.slice(0, 140),
                },
                {
                  icon: BookOpenText,
                  title: "知识层",
                  body: character.currentVersion.memorySummary.slice(0, 140),
                },
                {
                  icon: AudioLines,
                  title: "语音风格",
                  body: voice?.styleInstructions ?? "暂未配置语音信息。",
                },
              ].map((item) => (
                <Card
                  key={item.title}
                  className="rounded-[1.5rem] border-white/50 bg-white/70 dark:border-white/10 dark:bg-white/5"
                >
                  <CardContent className="space-y-3 p-5">
                    <item.icon className="size-4.5 text-primary" />
                    <div className="text-sm font-semibold">{item.title}</div>
                    <div className="text-sm leading-6 text-muted-foreground">
                      {item.body}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-[1.75rem]">
            <CardContent className="space-y-4 p-5">
              <div className="text-xs tracking-[0.18em] text-muted-foreground">
                人格摘要
              </div>
              <pre className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                {character.currentVersion.personaPrompt}
              </pre>
            </CardContent>
          </Card>
          <Card className="rounded-[1.75rem]">
            <CardContent className="space-y-4 p-5">
              <div className="text-xs tracking-[0.18em] text-muted-foreground">
                知识摘要
              </div>
              <pre className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                {character.currentVersion.memorySummary}
              </pre>
            </CardContent>
          </Card>
        </section>

        <section className="surface px-5 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">{character.disclaimer}</div>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" className="rounded-full">
                  <Link href={`/characters/${character.slug}/edit`}>编辑 / 重蒸馏</Link>
                </Button>
                <DeleteCharacterButton
                  characterId={character.id}
                  characterTitle={character.title}
                  redirectTo="/characters"
                  label="删除角色"
                  className="rounded-full"
                />
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
