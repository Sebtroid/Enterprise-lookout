import type { NextRequest } from "next/server";

import { isAllowedEmail } from "@/lib/auth/allowed-emails";
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
  request,
}: {
  allowDemoUser: boolean;
  request?: NextRequest;
}): AllowedUser | null {
  const demoMode = process.env.NEXT_PUBLIC_APP_MODE !== "production";
  const sameOriginDashboardRequest = request
    ? isSameOriginDashboardRequest(request)
    : false;

  if (!allowDemoUser || (!demoMode && !sameOriginDashboardRequest)) return null;

  const email = process.env.APP_ALLOWED_EMAILS?.split(",")[0]?.trim().toLowerCase();
  if (!email || !isAllowedEmail(email)) return null;

  return {
    email,
    id: "demo-user",
  };
}

function isSameOriginDashboardRequest(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return false;

  try {
    const appHost = new URL(appUrl).host;
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const originHost = origin ? new URL(origin).host : null;
    const refererHost = referer ? new URL(referer).host : null;

    return originHost === appHost || refererHost === appHost;
  } catch {
    return false;
  }
}
