-- Add a retained closed state for shops that merchants temporarily stop operating.
-- Apply to existing databases from the backend directory with:
--   Get-Content ..\docker\postgres\10_shop_closure.sql -Raw -Encoding utf8 | docker exec -i thaiplease_postgres psql -U thaiplease_user -d thaiplease_db -v ON_ERROR_STOP=1
ALTER TYPE shop_status ADD VALUE IF NOT EXISTS 'CLOSED';
