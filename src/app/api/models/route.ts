import { getGroupedModelCatalog } from "@/server/models";

export async function GET() {
  return Response.json(await getGroupedModelCatalog());
}
