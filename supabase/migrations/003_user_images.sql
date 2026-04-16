-- 003_user_images.sql
--
-- Per-user image library. Every image the user picks from the inline
-- search bar is upserted here so it can be reused across canvases and
-- devices. The `image_id` is the upstream source's id (Openverse uuid)
-- so re-picking the same image is idempotent.

CREATE TABLE IF NOT EXISTS public.user_images (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_id    text NOT NULL,
  url         text NOT NULL,
  thumbnail   text NOT NULL,
  title       text DEFAULT '',
  width       int  DEFAULT 0,
  height      int  DEFAULT 0,
  creator     text,
  license     text,
  source      text,
  query       text DEFAULT '',
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, image_id)
);

CREATE INDEX IF NOT EXISTS user_images_user_added_idx
  ON public.user_images (user_id, added_at DESC);

-- RLS: each user sees / writes only their own rows.
ALTER TABLE public.user_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_images_select_own" ON public.user_images;
CREATE POLICY "user_images_select_own"
  ON public.user_images FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_images_insert_own" ON public.user_images;
CREATE POLICY "user_images_insert_own"
  ON public.user_images FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_images_update_own" ON public.user_images;
CREATE POLICY "user_images_update_own"
  ON public.user_images FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_images_delete_own" ON public.user_images;
CREATE POLICY "user_images_delete_own"
  ON public.user_images FOR DELETE
  USING (auth.uid() = user_id);
