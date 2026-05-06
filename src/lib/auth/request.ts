import { isAllowedEmail } from "@/lib/auth/allowed-emails";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AllowedUser = {
  email: string;
  id: string;
};

export async function getAllowedUser({
  allowDemoUser = false,
}: {
  allowDemoUser?: boolean;
} = {}): Promise<AllowedUser | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return getDemoAllowedUser(allowDemoUser);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email || !isAllowedEmail(user.email)) {
    return getDemoAllowedUser(allowDemoUser);
  }

  return {
    email: user.email,
    id: user.id,
  };
}

function getDemoAllowedUser(allowDemoUser: boolean): AllowedUser | null {
  const demoMode = process.env.NEXT_PUBLIC_APP_MODE !== "production";
  if (!allowDemoUser || !demoMode) return null;

  const email = process.env.APP_ALLOWED_EMAILS?.split(",")[0]?.trim().toLowerCase();
  if (!email || !isAllowedEmail(email)) return null;

  return {
    email,
    id: "demo-user",
  };
}
