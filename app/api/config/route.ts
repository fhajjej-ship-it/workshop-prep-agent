import { getUiConfig } from '@/lib/ui-live-test';
import { json } from '@/lib/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export function GET() { return json(getUiConfig()); }
