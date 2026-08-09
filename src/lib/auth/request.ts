import type { NextRequest } from "next/server";

import { isAllowedEmail } from "@/lib/auth/allowed-emails";
import { isDemoAccessEnabled } from "@/lib/auth/route-policy";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AllowedUser = {
  email: string;
  id: string;
};

export async function getAllowedUser({
  allowDemoUser = false,
  request,
}: {
  allowDemoUser?: boolean;
  request?: NextRequest;
} = {}): Promise<AllowedUser | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return getDemoAllowedUser({ allowDemoUser, request });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email || !isAllowedEmail(user.email)) {
    return getDemoAllowedUser({ allowDemoUser, request });
  }

  return {
    email: user.email,
    id: user.id,
  };
}

function getDemoAllowedUser({
  allowDemoUser,
}: {
  allowDemoUser: boolean;
  request?: NextRequest;
}): AllowedUser | null {
  const demoMode = isDemoAccessEnabled({
    appMode: process.env.NEXT_PUBLIC_APP_MODE,
    nodeEnv: process.env.NODE_ENV,
  });

  if (!allowDemoUser || !demoMode) return null;

  const email = process.env.APP_ALLOWED_EMAILS?.split(",")[0]?.trim().toLowerCase();
  if (!email || !isAllowedEmail(email)) return null;

  return {
    email,
    id: "demo-user",
  };
}
