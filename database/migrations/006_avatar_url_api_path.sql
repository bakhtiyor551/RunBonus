UPDATE users
SET avatar_url = REPLACE(avatar_url, '/uploads/', '/api/uploads/')
WHERE avatar_url LIKE '/uploads/%';
