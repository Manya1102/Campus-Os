# Campus OS database migrations (Supabase/PostgreSQL)

These incremental migration files use PostgreSQL syntax for Supabase. They do not contain `USE campus_os` or `CREATE DATABASE`; Supabase SQL Editor already targets the selected project database.

## Choose one setup path

- **New, empty Supabase project:** run `database/supabase_schema.sql` once. It already includes the changes from these incremental migrations. Do not run the incremental files afterward.
- **Existing PostgreSQL database with the original Campus OS base tables:** run these files once each in filename order. They upgrade existing data without dropping tables.

Do not run the old MySQL SQL from an earlier copy of these files. These migrations assume the original base tables exist and that MySQL types were already translated to PostgreSQL types. They do not import data from a MySQL server; data migration is separate.
