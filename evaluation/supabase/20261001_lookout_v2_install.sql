INSERT INTO lookout_v2.install (id, uuid, version, "updatedAt")
VALUES ('install', gen_random_uuid()::text, '1.15.3', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
