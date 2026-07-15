import { NextResponse } from "next/server";
import { getRepository, getRequestContext } from "@/lib/repository";

export async function GET() {
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    return NextResponse.json(await repository.getReports(context), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
