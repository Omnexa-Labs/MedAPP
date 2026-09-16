import { signIn } from "@/server/sign-in";
import { NextRequest } from "next/server";
export const runtime = "nodejs";
export const POST = (request: NextRequest) => signIn(request);
