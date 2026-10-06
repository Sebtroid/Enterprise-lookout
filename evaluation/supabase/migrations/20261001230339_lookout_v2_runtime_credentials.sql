DO $$
DECLARE
  runtime_name text;
BEGIN
  FOREACH runtime_name IN ARRAY ARRAY[
    'lookout_v2_glm_api_key',
    'lookout_v2_google_client_id',
    'lookout_v2_google_client_secret'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = runtime_name) THEN
      PERFORM vault.create_secret(
        '',
        runtime_name,
        'Enterprise Lookout V2. Pendiente: completar desde Supabase Vault. Solo uso del servidor.'
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION lookout_v2.read_runtime_secret(secret_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT nullif(btrim(secret.decrypted_secret), '')
  FROM vault.decrypted_secrets AS secret
  WHERE secret.name = secret_name
    AND secret.name IN (
      'lookout_v2_glm_api_key',
      'lookout_v2_google_client_id',
      'lookout_v2_google_client_secret'
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION lookout_v2.read_runtime_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lookout_v2.read_runtime_secret(text) TO lookout_v2_app;
