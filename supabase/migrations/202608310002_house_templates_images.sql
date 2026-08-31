-- Le bucket house-templates ne recevait que des PDF (le modèle de certificat).
-- Il accueille désormais l'image signature + cachet de chaque maison, sinon
-- l'upload est refusé par le storage avec « mime type image/png is not supported ».
-- pdf-lib ne sait embarquer que du PNG et du JPEG : on n'ouvre pas plus large.
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg']
where id = 'house-templates';
