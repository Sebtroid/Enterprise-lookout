import { NextRequest, NextResponse } from "next/server";

import { getSafeAuthRedirectPath } from "@/lib/auth/route-policy";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = getSafeAuthRedirectPath(
    request.nextUrl.searchParams.get("next"),
  );
  const supabase = await getSupabaseServerClient();

  if (!code || !supabase) {
    return NextResponse.redirect(
      new URL("/login?error=invalid_auth_callback", request.url),
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=auth_exchange_failed", request.url),
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}
