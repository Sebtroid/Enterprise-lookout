import { isAllowedEmail } from "@/lib/auth/allowed-emails";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AllowedUser = {
  email: string;
  id: string;
};

export async function getAllowedUser(): Promise<AllowedUser | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email || !isAllowedEmail(user.email)) {
    return null;
  }

  return {
    email: user.email,
    id: user.id,
  };
}
