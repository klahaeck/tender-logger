import { NextResponse } from "next/server";

import { privateRouteError } from "@/lib/auth/private-route-error";
import { getRepository, getRequestContext } from "@/lib/repository";

export async function GET() {
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    if (context.member.role !== "owner") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(await repository.getSpecialArrangements(context), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return privateRouteError(error);
  }
}
