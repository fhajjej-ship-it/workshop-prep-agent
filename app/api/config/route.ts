import { getUiConfig } from '@/lib/ui-live-test';
import { json } from '@/lib/http';
import { bootstrapManagementCookie } from '@/lib/workshop-management';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export function GET(request: Request) { return bootstrapManagementCookie(json(getUiConfig()), request); }
