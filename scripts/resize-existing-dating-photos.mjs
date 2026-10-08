#!/usr/bin/env node
// Одноразовый бэкфилл: пересжимает уже загруженные фото анкет
// Знакомств. До фикса в app/api/dating/photo фото загружались в
// Supabase Storage как есть (оригинал с телефона, до 5МБ, без
// ресайза) — именно поэтому карточки в свайпах грузились медленно.
// Новые загрузки теперь сжимаются на клиенте перед отправкой; этот
// скрипт приводит к тому же виду то, что уже лежит в сторадже.
//
// Для каждой анкеты с photo_url:
//   1. Скачивает текущее фото.
//   2. Сжимает (sharp): вписывает в 1280x1280, JPEG quality 82.
//   3. Если результат заметно меньше оригинала — заливает под новым
//      путём, обновляет dating_profiles.photo_url, удаляет старый
//      файл из стораджа. Если нет (уже маленькое/простое) — не трогает.
//
// Usage:
//   node scripts/resize-existing-dating-photos.mjs --dry-run   # только отчёт, ничего не меняет
//   node scripts/resize-existing-dating-photos.mjs             # реальный прогон

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import crypto from "crypto";

loadEnv({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 82;
// Пересжимаем, только если новый файл хотя бы на 10% меньше —
// иначе не трогаем (уже маленькое/простое фото, нет смысла churn'ить
// сторадж и плодить новый путь без выгоды).
const MIN_SAVINGS_RATIO = 0.9;

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY не заданы (нужен .env.local)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "dating-photos";

function storagePathFromPublicUrl(url) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

async function fetchWithRetry(url, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastError;
}

async function main() {
  const { data: rows, error } = await supabase
    .from("dating_profiles")
    .select("telegram_id, photo_url")
    .not("photo_url", "is", null);

  if (error) {
    console.error("Не удалось прочитать dating_profiles:", error);
    process.exit(1);
  }

  console.log(`Анкет с фото: ${rows.length}${DRY_RUN ? " (dry-run, без изменений)" : ""}\n`);

  let resized = 0;
  let skippedSmall = 0;
  let failed = 0;
  let savedBytes = 0;

  for (const row of rows) {
    const { telegram_id: telegramId, photo_url: photoUrl } = row;
    const oldPath = storagePathFromPublicUrl(photoUrl);

    if (!oldPath) {
      console.warn(`[${telegramId}] не похоже на путь из ${BUCKET}, пропуск: ${photoUrl}`);
      failed++;
      continue;
    }

    try {
      const original = await fetchWithRetry(photoUrl);

      const resizedBuffer = await sharp(original)
        .rotate() // учитывает EXIF-ориентацию перед ресайзом
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();

      if (resizedBuffer.length >= original.length * MIN_SAVINGS_RATIO) {
        console.log(
          `[${telegramId}] уже компактное (${(original.length / 1024).toFixed(0)}KB → ${(resizedBuffer.length / 1024).toFixed(0)}KB), пропуск`
        );
        skippedSmall++;
        continue;
      }

      const newPath = `${telegramId}/${crypto.randomUUID()}.jpg`;
      console.log(
        `[${telegramId}] ${(original.length / 1024).toFixed(0)}KB → ${(resizedBuffer.length / 1024).toFixed(0)}KB` +
          (DRY_RUN ? " (dry-run)" : ` → ${newPath}`)
      );

      if (!DRY_RUN) {
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(newPath, resizedBuffer, { contentType: "image/jpeg", upsert: false });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(newPath);

        const { error: updateError } = await supabase
          .from("dating_profiles")
          .update({ photo_url: publicUrlData.publicUrl })
          .eq("telegram_id", telegramId);

        if (updateError) throw updateError;

        const { error: removeError } = await supabase.storage.from(BUCKET).remove([oldPath]);
        if (removeError) {
          // Не критично: анкета уже указывает на новый файл, старый
          // просто останется висеть в сторадже как мусор — логируем,
          // не роняем прогон.
          console.warn(`[${telegramId}] не удалось удалить старый файл ${oldPath}:`, removeError.message);
        }
      }

      savedBytes += original.length - resizedBuffer.length;
      resized++;
    } catch (err) {
      console.error(`[${telegramId}] ошибка:`, err.message || err);
      failed++;
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  console.log("\n--- Готово ---");
  console.log(`Пересжато: ${resized}`);
  console.log(`Уже компактных (пропущено): ${skippedSmall}`);
  console.log(`Ошибок: ${failed}`);
  console.log(`Освобождено: ${(savedBytes / 1024 / 1024).toFixed(2)} MB${DRY_RUN ? " (оценка, dry-run)" : ""}`);
}

main();
