import { materials } from '@/lib/materials';
import { json } from '@/lib/http';
export function GET() { return json({ materials }); }
