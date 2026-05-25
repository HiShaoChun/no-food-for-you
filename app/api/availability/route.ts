import { NextResponse } from "next/server";
import { getAvailability } from "@/lib/llm/availability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return NextResponse.json({ availability: getAvailability() });
}
