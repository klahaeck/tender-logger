import { NextResponse } from "next/server";

import { localDateInTimezone } from "@/lib/domain/dates";
import { getRepository, getRequestContext } from "@/lib/repository";

export async function GET(request: Request) {
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const requested = new URL(request.url).searchParams.get("date");
    const date = requested ?? localDateInTimezone(new Date(), context.workspace.timezone);
    const data = await repository.getDashboard(context, date);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
