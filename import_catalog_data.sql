-- Create a temporary table to load the CSV data
CREATE TEMP TABLE temp_catalog (
    unshelvd_work_id VARCHAR(20),
    unshelvd_edition_id VARCHAR(30),
    work_title TEXT,
    work_author TEXT,
    title TEXT,
    author TEXT,
    isbn13 VARCHAR(13),
    isbn10 VARCHAR(10),
    language VARCHAR(50),
    publisher TEXT,
    publication_year TEXT,
    genre TEXT,
    cover_url TEXT,
    original_language VARCHAR(50),
    country_of_origin VARCHAR(100),
    source VARCHAR(50)
);

-- Copy the CSV data (run this from the unshelvd directory)
\COPY temp_catalog FROM './database/catalog.csv' WITH CSV HEADER;

-- Insert unique works into the works table
INSERT INTO works (
    unshelvd_id, title, author, original_language, 
    first_published_year, genre, cover_url, source
)
SELECT DISTINCT 
    unshelvd_work_id,
    work_title,
    work_author,
    NULLIF(original_language, ''),
    CASE 
        WHEN publication_year ~ '^\d+$' THEN publication_year::INTEGER 
        ELSE NULL 
    END,
    NULLIF(genre, ''),
    NULLIF(cover_url, ''),
    NULLIF(source, '')
FROM temp_catalog
ON CONFLICT (unshelvd_id) DO UPDATE SET
    updated_at = now();

-- Insert all editions into the book_catalog table
INSERT INTO book_catalog (
    unshelvd_id, title, author, isbn_13, isbn_10, 
    language, publisher, publication_year, genre, 
    cover_url, source, original_language, country_of_origin,
    work_id
)
SELECT 
    tc.unshelvd_edition_id,
    tc.title,
    tc.author,
    NULLIF(tc.isbn13, ''),
    NULLIF(tc.isbn10, ''),
    NULLIF(tc.language, ''),
    NULLIF(tc.publisher, ''),
    CASE 
        WHEN tc.publication_year ~ '^\d+$' THEN tc.publication_year::INTEGER 
        ELSE NULL 
    END,
    NULLIF(tc.genre, ''),
    NULLIF(tc.cover_url, ''),
    NULLIF(tc.source, ''),
    NULLIF(tc.original_language, ''),
    NULLIF(tc.country_of_origin, ''),
    w.id
FROM temp_catalog tc
JOIN works w ON w.unshelvd_id = tc.unshelvd_work_id
ON CONFLICT (unshelvd_id) DO UPDATE SET
    updated_at = now();

-- Show import statistics
SELECT 'Works imported:' as info, COUNT(*) as count FROM works WHERE unshelvd_id IS NOT NULL
UNION ALL
SELECT 'Editions imported:' as info, COUNT(*) as count FROM book_catalog WHERE unshelvd_id IS NOT NULL;

-- Show sample data
SELECT 'Sample works:' as type, unshelvd_id, title, author, original_language 
FROM works WHERE unshelvd_id IS NOT NULL LIMIT 5;

SELECT 'Sample editions:' as type, unshelvd_id, title, author, language, publication_year 
FROM book_catalog WHERE unshelvd_id IS NOT NULL LIMIT 5;

-- Show some interesting statistics
SELECT 
    'Languages:' as stat_type,
    language,
    COUNT(*) as count
FROM book_catalog 
WHERE language IS NOT NULL 
GROUP BY language 
ORDER BY count DESC 
LIMIT 10;

SELECT 
    'Publication years:' as stat_type,
    publication_year::text as year,
    COUNT(*) as count
FROM book_catalog 
WHERE publication_year IS NOT NULL 
GROUP BY publication_year 
ORDER BY publication_year DESC 
LIMIT 10;
