import { NextRequest } from 'next/server';
import { signIn } from '@/server/sign-in';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  return signIn(request);
}
