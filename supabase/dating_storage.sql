-- Bucket для фото анкет Знакомств. Публичный (readable по прямому
-- URL без авторизации) — так проще всего показывать чужие фото в
-- ленте кандидатов без городить signed URLs на каждый показ; путь
-- файла — случайный UUID, не угадываемый перебором. Запись — только
-- через /api/dating/photo (service_role, минуя RLS), так что явные
-- write-policy не нужны.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dating-photos',
  'dating-photos',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
