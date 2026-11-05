-- Aggiunge colonna served_at alla tabella stops per persistere lo stato "servita"
-- Le tappe servite hanno un timestamp; il reset avviene alle 2:00 del giorno successivo
-- all'uscita (non dopo 2 ore)
ALTER TABLE stops ADD COLUMN IF NOT EXISTS served_at TIMESTAMPTZ;

-- Funzione per resettare le tappe servite del giorno precedente (da eseguire alle 2:00)
CREATE OR REPLACE FUNCTION reset_served_stops() RETURNS void AS $$
BEGIN
  UPDATE stops SET served_at = NULL WHERE served_at IS NOT NULL AND served_at < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;