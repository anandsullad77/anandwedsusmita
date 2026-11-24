import { handleHostPasswordReset } from './handler.ts';

Deno.serve((request: Request) => handleHostPasswordReset(request, {
  supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
}));
