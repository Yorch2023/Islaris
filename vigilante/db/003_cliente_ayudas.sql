-- =============================================================================
--  Ayudas recibidas por el cliente según la BDNS (concesiones y minimis) y datos
--  registrales obtenidos al autocompletar por NIF.
-- =============================================================================

BEGIN;
SET search_path = vigilante, public;

ALTER TABLE cliente
    ADD COLUMN ayudas_recibidas      jsonb,         -- { concesiones: [...], minimis: [...], resumen_minimis: {...} }
    ADD COLUMN ayudas_consultadas_at timestamptz,
    ADD COLUMN datos_registro        jsonb;         -- domicilio, fuentes y avisos del autocompletado

COMMIT;
