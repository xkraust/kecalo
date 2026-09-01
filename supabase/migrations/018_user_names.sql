-- Kecalo — jméno, příjmení a e-mail u uživatelů
--
-- Účet dosud identifikoval jediný údaj `username` (např. `admin`), takže
-- z tabulky uživatelů nešlo poznat, kdo je kdo, a účet nešel spojit
-- s konkrétním člověkem. Sloupec `display_name` sice existoval, ale nikde se
-- nezobrazoval a formulář ho neposílal — byl to mrtvý sloupec.
--
-- E-mail nově slouží jako přihlašovací údaj. Sloupec se PŘEJMENOVÁVÁ, ne
-- přidává: `username` už má hodnotu i `citext UNIQUE`, a citext je pro e-mail
-- správný typ (adresa se nesmí lišit velikostí písmen). Přidat `email` vedle
-- by znamenalo dva soupeřící identifikátory.

alter table users rename column username to email;

alter table users add column if not exists first_name text;
alter table users add column if not exists last_name  text;

-- Existující účty musí projít, jinak by NOT NULL níže selhal. Rozpad
-- `display_name` podle první mezery je jen nejlepší odhad — u účtu bez něj
-- (typicky seedovaný `admin`) padne jméno na e-mail a příjmení na pomlčku.
-- Správce si údaje opraví v /admin/users.
update users
set first_name = coalesce(
      nullif(split_part(coalesce(display_name, ''), ' ', 1), ''),
      email
    ),
    last_name = coalesce(
      nullif(
        case
          when position(' ' in coalesce(display_name, '')) > 0
          then substring(display_name from position(' ' in display_name) + 1)
          else ''
        end,
        ''
      ),
      '—'
    )
where first_name is null;

alter table users alter column first_name set not null;
alter table users alter column last_name  set not null;

alter table users add constraint users_first_name_len
  check (char_length(first_name) between 1 and 80);
alter table users add constraint users_last_name_len
  check (char_length(last_name) between 1 and 80);

-- Formát e-mailu se ZÁMĚRNĚ nekontroluje v DB: seedovaný účet `admin` není
-- adresa a CHECK by tuhle migraci shodil. Formát vynucuje API při zápisu,
-- takže každý nový nebo editovaný účet už adresu mít musí. Přechodný stav
-- (admin se do opravy přihlašuje jménem `admin`) je popsaný v CLAUDE.md.

alter table users drop column if exists display_name;
