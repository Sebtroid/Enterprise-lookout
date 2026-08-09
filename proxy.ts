import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAllowedEmail } from "@/lib/auth/allowed-emails";
import {
  classifyRequestPath,
  isDemoAccessEnabled,
  isLegacyApiPath,
} from "@/lib/auth/route-policy";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessMode = classifyRequestPath(pathname);
  const demoMode = isDemoAccessEnabled({
    appMode: process.env.NEXT_PUBLIC_APP_MODE,
    nodeEnv: process.env.NODE_ENV,
  });
  const publicSupabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasSupabaseConfig =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(publicSupabaseKey);

  if (
    process.env.NODE_ENV === "production" &&
    isLegacyApiPath(pathname) &&
    process.env.ENABLE_LEGACY_API !== "true"
  ) {
    return NextResponse.json(
      { ok: false, error: "legacy_endpoint_retired" },
      { status: 410 },
    );
  }

  if (
    accessMode === "public" ||
    accessMode === "service" ||
    accessMode === "signed_callback" ||
    demoMode
  ) {
    return NextResponse.next();
  }

  if (!hasSupabaseConfig) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: "Authentication unavailable" },
        { status: 503 },
      );
    }
    return NextResponse.redirect(new URL("/login?error=auth_unavailable", request.url));
  }

  const response = NextResponse.next({
    request,
  });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publicSupabaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !isAllowedEmail(user.email)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
