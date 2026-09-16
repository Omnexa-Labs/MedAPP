import { NextRequest } from "next/server";
import { signIn } from "@/server/sign-in";
export const runtime = "nodejs";
export const POST = (request: NextRequest) => signIn(request, true);
