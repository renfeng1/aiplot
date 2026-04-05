import { HomeShell } from "@/components/home-shell";
import { getAuthContext } from "@/lib/auth";
import { listOwnedCharacters, listPublicCharacters } from "@/server/characters";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const auth = await getAuthContext();
  const [publicCharacters, ownedCharacters] = await Promise.all([
    listPublicCharacters({ take: 6 }),
    auth.localUserId
      ? listOwnedCharacters({
          localUserId: auth.localUserId,
          take: 6,
        })
      : Promise.resolve([]),
  ]);

  return (
    <HomeShell
      isSignedIn={auth.isSignedIn}
      publicCharacters={publicCharacters}
      ownedCharacters={ownedCharacters.map((character) => ({
        id: character.id,
        slug: character.slug,
        title: character.title,
        description: character.description,
        shortDescription: character.shortDescription,
        tags: character.tags,
        creationStatus: character.creationStatus,
        currentVersionId: character.currentVersionId,
        creationMessage: character.creationMessage,
        lastError: character.lastError,
      }))}
    />
  );
}
