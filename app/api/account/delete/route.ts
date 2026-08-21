import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

// Apple Guideline 5.1.1(v): apps that support account creation must
// also support account deletion from within the app. Only reachable
// from the standalone iOS (Capacitor) build's Settings screen — the
// Telegram Mini App has no Supabase Auth account to delete at all, so
// this intentionally does NOT go through the shared
// validateRequestAuth()/initData path used by every other route.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const accessToken = body?.supabaseAccessToken;

    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json(
        { error: "Missing supabaseAccessToken" },
        { status: 401 }
      );
    }

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      );
    }

    const authUserId = userData.user.id;

    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      "delete_own_account",
      { p_auth_user_id: authUserId }
    );

    if (rpcError || !rpcData?.ok) {
      console.error("delete_own_account error:", rpcError || rpcData);
      return NextResponse.json(
        { error: "Failed to delete account data" },
        { status: 500 }
      );
    }

    const { error: deleteAuthError } =
      await supabaseAdmin.auth.admin.deleteUser(authUserId);

    if (deleteAuthError) {
      console.error("auth.admin.deleteUser error:", deleteAuthError);
      return NextResponse.json(
        { error: "Failed to delete auth account" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("ACCOUNT DELETE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
