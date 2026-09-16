import { NextRequest } from 'next/server';
import { handoff } from '@/server/handoff';
export const runtime = 'nodejs';
export function POST(request: NextRequest) {
  return handoff(request);
}
