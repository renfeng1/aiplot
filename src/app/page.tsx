import { HomeShell } from "@/components/home-shell";
import type { AuthContext } from "@/lib/auth";
import { getAuthContext } from "@/lib/auth";
import { listOwnedCharacters, listPublicCharacters } from "@/server/characters";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let auth: AuthContext = {
    localUserId: null,
    username: null,
    role: null,
    isSignedIn: false,
    isActive: false,
    email: null,
    name: null,
    imageUrl: null,
  };
  let publicCharacters: Awaited<ReturnType<typeof listPublicCharacters>> = [];
  let ownedCharacters: Awaited<ReturnType<typeof listOwnedCharacters>> = [];
  let serviceWarning: string | null = null;

  try {
    auth = await getAuthContext();
    [publicCharacters, ownedCharacters] = await Promise.all([
      listPublicCharacters({ take: 6 }),
      auth.localUserId
        ? listOwnedCharacters({
            localUserId: auth.localUserId,
            take: 6,
          })
        : Promise.resolve([]),
    ]);
  } catch (error) {
    console.error("Failed to load homepage data.", error);
    serviceWarning =
      "角色数据服务暂时不可用，首页已切换到降级模式。请稍后刷新，或先访问不依赖角色列表的页面。";
  }

  return (
    <HomeShell
      isSignedIn={auth.isSignedIn}
      publicCharacters={publicCharacters}
      serviceWarning={serviceWarning}
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
