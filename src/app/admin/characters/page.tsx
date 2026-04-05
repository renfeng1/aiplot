import Link from "next/link";

import { DeleteCharacterButton } from "@/components/delete-character-button";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/auth";
import { listAdminPublicCharacters } from "@/server/characters";

export const dynamic = "force-dynamic";

export default async function AdminCharactersPage() {
  await requireAdminPage();
  const characters = await listAdminPublicCharacters();

  return (
    <div className="pb-20">
      <SiteHeader />
      <main className="page-shell mt-6 space-y-6 sm:mt-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-heading text-4xl">公共角色管理</h1>
          <Button asChild className="rounded-full">
            <Link href="/create?visibility=PUBLIC">创建公共角色</Link>
          </Button>
        </div>
        <div className="space-y-4">
          {characters.map((character) => (
            <Card key={character.id} className="rounded-[1.75rem]">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <div className="text-lg font-semibold">{character.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {character.shortDescription ?? character.description}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="outline" className="rounded-full">
                    <Link href={`/characters/${character.slug}`}>查看</Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-full">
                    <Link href={`/characters/${character.slug}/edit`}>编辑</Link>
                  </Button>
                  <DeleteCharacterButton
                    characterId={character.id}
                    characterTitle={character.title}
                    redirectTo="/admin/characters"
                    variant="destructive"
                    className="rounded-full"
                    label="删除"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
