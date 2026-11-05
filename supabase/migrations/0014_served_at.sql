-- Aggiunge colonna served_at alla tabella stops per persistere lo stato "servita"
-- Le tappe servite hanno un timestamp; il reset avviene a mezzanotte+2h del giorno successivo
ALTER TABLE stops ADD COLUMN IF NOT EXISTS served_at TIMESTAMPTZ;

-- Funzione per resettare le tappe servite del giorno precedente
CREATE OR REPLACE FUNCTION reset_served_stops() RETURNS void AS $$
BEGIN
  UPDATE stops SET served_at = NULL WHERE served_at IS NOT NULL AND served_at < NOW() - INTERVAL '2 hours';
END;
$$ LANGUAGE plpgsql;