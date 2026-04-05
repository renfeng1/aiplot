import type { Route } from "next";
import Link from "next/link";

import { DeleteCharacterButton } from "@/components/delete-character-button";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAuthContext } from "@/lib/auth";
import { listOwnedCharacters, listPublicCharacters } from "@/server/characters";

export const dynamic = "force-dynamic";

function myCharacterHref(character: {
  id: string;
  slug: string;
  currentVersionId: string | null;
}): Route {
  return character.currentVersionId
    ? (`/characters/${character.slug}` as Route)
    : (`/create?characterId=${character.id}` as Route);
}

function statusLabel(status: "DRAFT" | "DISTILLING" | "FAILED" | "READY") {
  switch (status) {
    case "READY":
      return "已完成";
    case "FAILED":
      return "失败";
    case "DISTILLING":
      return "创建中";
    default:
      return "草稿";
  }
}

export default async function CharactersPage() {
  const auth = await getAuthContext();
  const [publicCharacters, ownedCharacters] = await Promise.all([
    listPublicCharacters(),
    auth.localUserId
      ? listOwnedCharacters({ localUserId: auth.localUserId })
      : Promise.resolve([]),
  ]);

  return (
    <div className="pb-20">
      <SiteHeader />
      <main className="page-shell mt-6 space-y-6 sm:mt-10">
        <section className="surface px-5 py-6 sm:px-6">
          <Badge
            variant="outline"
            className="rounded-full px-3 py-1 text-xs tracking-[0.18em]"
          >
            角色中心
          </Badge>
          <h1 className="mt-3 font-heading text-4xl sm:text-5xl">
            公共角色与我的角色
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            公共角色由管理员正式发布。我的角色页面会持续展示创建中、失败和已完成状态。
          </p>
        </section>

        <Tabs defaultValue="public" className="space-y-4">
          <TabsList className="rounded-full">
            <TabsTrigger value="public">公共角色</TabsTrigger>
            <TabsTrigger value="mine">我的角色</TabsTrigger>
          </TabsList>

          <TabsContent value="public" className="space-y-4">
            {publicCharacters.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {publicCharacters.map((character) => (
                  <Card key={character.id} className="rounded-[1.75rem]">
                    <CardContent className="space-y-4 p-5">
                      <div className="text-lg font-semibold">{character.title}</div>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {character.shortDescription ?? character.description}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {character.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <Button asChild className="w-full rounded-full">
                        <Link href={`/characters/${character.slug}`}>查看角色</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="surface px-5 py-6 text-sm leading-7 text-muted-foreground">
                当前还没有公共角色，等待管理员创建。
              </div>
            )}
          </TabsContent>

          <TabsContent value="mine" className="space-y-4">
            {auth.isSignedIn ? (
              ownedCharacters.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {ownedCharacters.map((character) => (
                    <Card key={character.id} className="rounded-[1.75rem]">
                      <CardContent className="space-y-4 p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-lg font-semibold">{character.title}</div>
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                            {statusLabel(character.creationStatus)}
                          </span>
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {character.shortDescription ?? character.description}
                        </p>
                        <div className="text-sm text-muted-foreground">
                          {character.creationStatus === "FAILED"
                            ? character.lastError || "创建失败，可继续处理"
                            : character.creationStatus === "DISTILLING"
                              ? character.creationMessage || "正在后台创建中"
                              : character.creationMessage || "角色已完成"}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {character.tags.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button asChild className="flex-1 rounded-full">
                            <Link href={myCharacterHref(character)}>
                              {character.currentVersionId ? "查看角色" : "继续处理"}
                            </Link>
                          </Button>
                          <DeleteCharacterButton
                            characterId={character.id}
                            characterTitle={character.title}
                            variant="outline"
                            className="rounded-full"
                            label="删除"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="surface px-5 py-6 text-sm leading-7 text-muted-foreground">
                  你还没有私有角色。创建后，聊天记录和长期记忆会持续保留。
                </div>
              )
            ) : (
              <div className="surface px-5 py-6 text-sm leading-7 text-muted-foreground">
                登录后可查看和管理你自己的私有角色。
                <div className="mt-4">
                  <Button asChild className="rounded-full">
                    <a href="/sign-in">去登录</a>
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
