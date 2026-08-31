import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

// multipart/form-data, не JSON — валидация auth та же (initData /
// supabaseAccessToken), просто читаем их из полей формы вместо тела
// запроса.
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();

    const initData = form.get("initData");
    const supabaseAccessToken = form.get("supabaseAccessToken");
    const file = form.get("file");

    const validation = await validateRequestAuth({
      initData: typeof initData === "string" ? initData : undefined,
      supabaseAccessToken:
        typeof supabaseAccessToken === "string" ? supabaseAccessToken : undefined,
    });

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, reason: "missing-file" },
        { status: 400 }
      );
    }

    const extension = ALLOWED_TYPES[file.type];

    if (!extension) {
      return NextResponse.json(
        { ok: false, reason: "invalid-type" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { ok: false, reason: "too-large" },
        { status: 400 }
      );
    }

    const path = `${validation.telegramId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("dating-photos")
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("dating photo upload error:", uploadError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("dating-photos")
      .getPublicUrl(path);

    return NextResponse.json({ ok: true, photoUrl: publicUrlData.publicUrl });
  } catch (error) {
    console.error("DATING PHOTO ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
