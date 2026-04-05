import { notFound, redirect } from "next/navigation";

import { DeleteCharacterButton } from "@/components/delete-character-button";
import { CharacterEditForm } from "@/components/character-edit-form";
import { SiteHeader } from "@/components/site-header";
import { requireUserPage } from "@/lib/auth";
import { ensureCharacterAccess } from "@/server/characters";

export const dynamic = "force-dynamic";

export default async function CharacterEditPage({
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

  const profile =
    character.currentVersion?.characterProfile as
      | {
          targetCharacterName?: string;
          targetCharacterAliases?: string[];
          userRoleHint?: string;
        }
      | undefined;

  return (
    <div className="pb-20">
      <SiteHeader />
      <main className="page-shell mt-6 space-y-4 sm:mt-10">
        <div className="flex justify-end">
          <DeleteCharacterButton
            characterId={character.id}
            characterTitle={character.title}
            redirectTo="/characters"
            className="rounded-full"
          />
        </div>
        <CharacterEditForm
          characterId={character.id}
          slug={character.slug}
          description={character.description}
          tags={character.tags}
          targetCharacterName={profile?.targetCharacterName ?? character.title}
          targetCharacterAliases={profile?.targetCharacterAliases ?? []}
          userRoleHint={profile?.userRoleHint ?? "普通对话对象"}
        />
      </main>
    </div>
  );
}

