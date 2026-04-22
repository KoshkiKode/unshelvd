# Unshelv'd SQL Connect

This folder now contains the Firebase SQL Connect configuration for Unshelv'd.

Current deployed target:
- Service location: `us-central1`
- Cloud SQL instance: `unshelvd-instance`
- PostgreSQL database: `unshelvd`

- `schema/schema.gql` mirrors the current application database shape from `shared/schema.ts`.
- `connector/queries.gql` contains public catalog read operations, including `SearchCatalog` for title, author, or genre search.
- `schema.sql`, `seed-catalog.sql`, and `catalog.csv` are copied in here from `database/` so the SQL schema and catalog seed live alongside the SQL Connect service config.
- The simplest way to populate searchable SQL Connect catalog data is the direct PostgreSQL setup path: `npm run db:setup` for a local database, or `database/setup.sh` for a remote database. The seed script prefers `dataconnect/catalog.csv` when loading catalog entries.

The service uses `schemaValidation: "COMPATIBLE"` so Firebase SQL Connect can sit on top of the existing PostgreSQL schema without trying to rewrite constraints that are not expressible in GraphQL, such as `RESTRICT` delete behavior and partial indexes.

## Fastest Searchable Setup

Use one of these flows against the PostgreSQL instance that backs Firebase SQL Connect:

```bash
# local / already configured DATABASE_URL
npm run db:setup

# remote PostgreSQL / Cloud SQL style bootstrap
./database/setup.sh --host "HOST" --username "USER" --password "PASSWORD" --database "unshelvd"
```

After the seed completes, the catalog data searched by SQL Connect is available through `SearchCatalog`, `SearchCatalogByTitle`, `ListCatalogEntries`, and `ListWorks`.