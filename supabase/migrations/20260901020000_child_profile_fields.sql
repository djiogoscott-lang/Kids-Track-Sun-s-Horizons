-- Real school lists carry more than a name.
--
-- The CSPU lists (and every similar list a secretary will hand over) have a
-- class, a date of birth, a phone and an e-mail per child. Until now the
-- children table held only names, so importing those files would silently
-- drop that information — or force it into `notes` as free text, which
-- cannot be searched, validated or displayed as a field.
--
-- All four are additive and nullable-by-default, so every existing row stays
-- valid and nothing that reads children today needs to change.
begin;

alter table public.children
  -- Date only, no time: a birth date has no timezone, and storing it as
  -- timestamptz would shift it across the Brussels/UTC boundary exactly the
  -- way attendance dates would have.
  add column if not exists birth_date date,
  -- "M1", "2C", "5A"… — the school's own class label, kept verbatim rather
  -- than parsed into level+section, because the format varies per school and
  -- guessing would corrupt it.
  add column if not exists school_class text not null default '' check (char_length(school_class) <= 40),
  -- Free text on purpose: real lists hold several numbers in one cell
  -- ("0495/ 13 21 94 // 0049 151 25 33 85 96 (M)"), and splitting them would
  -- lose the parent annotations.
  add column if not exists phone text not null default '' check (char_length(phone) <= 200),
  add column if not exists email text not null default '' check (char_length(email) <= 300);

commit;
