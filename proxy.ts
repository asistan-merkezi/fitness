import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next 16: `middleware.ts` yerine `proxy.ts`. Oturum çerezini yeniler ve oturumsuz
// /panel isteklerini /giris'e yönlendirir. Bu KABA korumadır; gerçek güvenlik
// sayfa/action içindeki doğrulama ve RLS'tedir (skill: auth-flow).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
