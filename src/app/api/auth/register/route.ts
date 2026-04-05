import { z } from "zod";

import { registerUser } from "@/server/auth-service";
import { jsonError, jsonOk } from "@/server/http";

const bodySchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(128),
  name: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const user = await registerUser(body);

    return jsonOk({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

