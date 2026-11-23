begin;

-- Additive: existing rows keep NULL grouping and remain single-photo posts.
alter table public.photos add column post_id uuid;
alter table public.photos add column post_position smallint;
alter table public.photos add constraint photo_post_position check (
  (post_id is null and post_position is null) or
  (post_id is not null and post_position is not null and post_position between 0 and 9)
);
create unique index photos_post_position on public.photos(post_id, post_position) where post_id is not null;

-- A guest cannot attach images to another guest's post, including hidden rows.
create function public.check_photo_post_owner() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.post_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.post_id::text, 0));
    if exists (select 1 from photos p where p.post_id = new.post_id and
      (p.event_id <> new.event_id or p.uploaded_by is distinct from new.uploaded_by)) then
      raise exception 'Photos in a post must belong to the same wedding and uploader';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.check_photo_post_owner() from public, anon, authenticated;
-- Ownership changes are host-only under existing RLS. Do not intercept the
-- auth.users ON DELETE SET NULL cascade, which must still remove an account.
create trigger check_photo_post_owner before insert or update of post_id, event_id on public.photos
for each row execute function public.check_photo_post_owner();

commit;
