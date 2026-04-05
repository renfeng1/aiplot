import { SiteHeader } from "@/components/site-header";
import { CreateWizard } from "@/components/create-wizard";
import { requireUserPage } from "@/lib/auth";
import { env, isBltcyConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ characterId?: string }>;
}) {
  const user = await requireUserPage();
  const query = await searchParams;

  return (
    <div className="pb-20">
      <SiteHeader />
      <main className="page-shell mt-6 sm:mt-10">
        <CreateWizard
          blobConfigured={Boolean(env.BLOB_READ_WRITE_TOKEN)}
          databaseConfigured={Boolean(env.DATABASE_URL)}
          aiConfigured={isBltcyConfigured}
          allowPublicCreation={user.role === "SUPER_ADMIN"}
          initialVisibility={user.role === "SUPER_ADMIN" ? "PUBLIC" : "PRIVATE"}
          initialCharacterId={query.characterId ?? null}
        />
      </main>
    </div>
  );
}
