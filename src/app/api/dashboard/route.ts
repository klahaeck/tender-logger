import { NextResponse } from "next/server";

import { privateRouteError } from "@/lib/auth/private-route-error";
import { isValidLocalDate, localDateInTimezone } from "@/lib/domain/dates";
import { getRepository, getRequestContext } from "@/lib/repository";

export async function GET(request: Request) {
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    const requested = new URL(request.url).searchParams.get("date");
    const today = localDateInTimezone(new Date(), context.workspace.timezone);
    if (requested && (!isValidLocalDate(requested) || requested > today)) {
      return NextResponse.json({ error: "Choose today or an earlier valid date." }, { status: 400 });
    }
    const date = requested ?? today;
    const data = await repository.getDashboard(context, date);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return privateRouteError(error);
  }
}
