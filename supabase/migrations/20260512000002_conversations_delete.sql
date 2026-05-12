-- Bot OS schema delta: allow users to delete their own conversations.
--
-- The original chat migration (20260510000001) intentionally left DELETE
-- off conversations + messages because the spec at the time was
-- "append-only history". Operator feedback after first live use was that
-- the user needs a way to clear conversations they don't want anymore
-- (especially the experimental ones from before the assistant was tuned).
--
-- Scope: conversations only. messages remain insert-only at the policy
-- layer; they get wiped via the existing ON DELETE CASCADE foreign key
-- on messages.conversation_id when the parent conversation is deleted.
-- That keeps the "message rows can never be edited in place" invariant
-- intact while letting the user purge a whole thread.

begin;

create policy conversations_delete_own
  on public.conversations for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant delete on public.conversations to authenticated;

commit;
