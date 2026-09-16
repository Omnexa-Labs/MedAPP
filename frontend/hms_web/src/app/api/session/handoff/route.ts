import { NextRequest } from "next/server";
import { handoff } from "@/server/handoff";
export const runtime = "nodejs";
export const POST = (request: NextRequest) => handoff(request);
