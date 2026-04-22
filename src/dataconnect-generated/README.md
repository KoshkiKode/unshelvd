# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `catalog`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `React README`, you can find it at [`dataconnect-generated/react/README.md`](./react/README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*ListCatalogEntries*](#listcatalogentries)
  - [*SearchCatalogByTitle*](#searchcatalogbytitle)
  - [*SearchCatalog*](#searchcatalog)
  - [*ListWorks*](#listworks)
- [**Mutations**](#mutations)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `catalog`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `catalog` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## ListCatalogEntries
You can execute the `ListCatalogEntries` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listCatalogEntries(vars?: ListCatalogEntriesVariables, options?: ExecuteQueryOptions): QueryPromise<ListCatalogEntriesData, ListCatalogEntriesVariables>;

interface ListCatalogEntriesRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars?: ListCatalogEntriesVariables): QueryRef<ListCatalogEntriesData, ListCatalogEntriesVariables>;
}
export const listCatalogEntriesRef: ListCatalogEntriesRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listCatalogEntries(dc: DataConnect, vars?: ListCatalogEntriesVariables, options?: ExecuteQueryOptions): QueryPromise<ListCatalogEntriesData, ListCatalogEntriesVariables>;

interface ListCatalogEntriesRef {
  ...
  (dc: DataConnect, vars?: ListCatalogEntriesVariables): QueryRef<ListCatalogEntriesData, ListCatalogEntriesVariables>;
}
export const listCatalogEntriesRef: ListCatalogEntriesRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listCatalogEntriesRef:
```typescript
const name = listCatalogEntriesRef.operationName;
console.log(name);
```

### Variables
The `ListCatalogEntries` query has an optional argument of type `ListCatalogEntriesVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ListCatalogEntriesVariables {
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that executing the `ListCatalogEntries` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListCatalogEntriesData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ListCatalogEntriesData {
  bookCatalogs: ({
    id: number;
    title: string;
    author: string;
    language: string;
    publisher?: string | null;
    publicationYear?: number | null;
    genre?: string | null;
    coverUrl?: string | null;
    originalLanguage?: string | null;
    countryOfOrigin?: string | null;
    workId?: number | null;
  } & BookCatalog_Key)[];
}
```
### Using `ListCatalogEntries`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listCatalogEntries, ListCatalogEntriesVariables } from '@dataconnect/generated';

// The `ListCatalogEntries` query has an optional argument of type `ListCatalogEntriesVariables`:
const listCatalogEntriesVars: ListCatalogEntriesVariables = {
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `listCatalogEntries()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listCatalogEntries(listCatalogEntriesVars);
// Variables can be defined inline as well.
const { data } = await listCatalogEntries({ limit: ..., offset: ..., });
// Since all variables are optional for this query, you can omit the `ListCatalogEntriesVariables` argument.
const { data } = await listCatalogEntries();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listCatalogEntries(dataConnect, listCatalogEntriesVars);

console.log(data.bookCatalogs);

// Or, you can use the `Promise` API.
listCatalogEntries(listCatalogEntriesVars).then((response) => {
  const data = response.data;
  console.log(data.bookCatalogs);
});
```

### Using `ListCatalogEntries`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listCatalogEntriesRef, ListCatalogEntriesVariables } from '@dataconnect/generated';

// The `ListCatalogEntries` query has an optional argument of type `ListCatalogEntriesVariables`:
const listCatalogEntriesVars: ListCatalogEntriesVariables = {
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `listCatalogEntriesRef()` function to get a reference to the query.
const ref = listCatalogEntriesRef(listCatalogEntriesVars);
// Variables can be defined inline as well.
const ref = listCatalogEntriesRef({ limit: ..., offset: ..., });
// Since all variables are optional for this query, you can omit the `ListCatalogEntriesVariables` argument.
const ref = listCatalogEntriesRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listCatalogEntriesRef(dataConnect, listCatalogEntriesVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.bookCatalogs);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.bookCatalogs);
});
```

## SearchCatalogByTitle
You can execute the `SearchCatalogByTitle` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
searchCatalogByTitle(vars: SearchCatalogByTitleVariables, options?: ExecuteQueryOptions): QueryPromise<SearchCatalogByTitleData, SearchCatalogByTitleVariables>;

interface SearchCatalogByTitleRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: SearchCatalogByTitleVariables): QueryRef<SearchCatalogByTitleData, SearchCatalogByTitleVariables>;
}
export const searchCatalogByTitleRef: SearchCatalogByTitleRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
searchCatalogByTitle(dc: DataConnect, vars: SearchCatalogByTitleVariables, options?: ExecuteQueryOptions): QueryPromise<SearchCatalogByTitleData, SearchCatalogByTitleVariables>;

interface SearchCatalogByTitleRef {
  ...
  (dc: DataConnect, vars: SearchCatalogByTitleVariables): QueryRef<SearchCatalogByTitleData, SearchCatalogByTitleVariables>;
}
export const searchCatalogByTitleRef: SearchCatalogByTitleRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the searchCatalogByTitleRef:
```typescript
const name = searchCatalogByTitleRef.operationName;
console.log(name);
```

### Variables
The `SearchCatalogByTitle` query requires an argument of type `SearchCatalogByTitleVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface SearchCatalogByTitleVariables {
  title: string;
  limit?: number | null;
}
```
### Return Type
Recall that executing the `SearchCatalogByTitle` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `SearchCatalogByTitleData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface SearchCatalogByTitleData {
  bookCatalogs: ({
    id: number;
    title: string;
    author: string;
    language: string;
    publisher?: string | null;
    publicationYear?: number | null;
    genre?: string | null;
    coverUrl?: string | null;
    originalLanguage?: string | null;
    countryOfOrigin?: string | null;
    workId?: number | null;
  } & BookCatalog_Key)[];
}
```
### Using `SearchCatalogByTitle`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, searchCatalogByTitle, SearchCatalogByTitleVariables } from '@dataconnect/generated';

// The `SearchCatalogByTitle` query requires an argument of type `SearchCatalogByTitleVariables`:
const searchCatalogByTitleVars: SearchCatalogByTitleVariables = {
  title: ..., 
  limit: ..., // optional
};

// Call the `searchCatalogByTitle()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await searchCatalogByTitle(searchCatalogByTitleVars);
// Variables can be defined inline as well.
const { data } = await searchCatalogByTitle({ title: ..., limit: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await searchCatalogByTitle(dataConnect, searchCatalogByTitleVars);

console.log(data.bookCatalogs);

// Or, you can use the `Promise` API.
searchCatalogByTitle(searchCatalogByTitleVars).then((response) => {
  const data = response.data;
  console.log(data.bookCatalogs);
});
```

### Using `SearchCatalogByTitle`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, searchCatalogByTitleRef, SearchCatalogByTitleVariables } from '@dataconnect/generated';

// The `SearchCatalogByTitle` query requires an argument of type `SearchCatalogByTitleVariables`:
const searchCatalogByTitleVars: SearchCatalogByTitleVariables = {
  title: ..., 
  limit: ..., // optional
};

// Call the `searchCatalogByTitleRef()` function to get a reference to the query.
const ref = searchCatalogByTitleRef(searchCatalogByTitleVars);
// Variables can be defined inline as well.
const ref = searchCatalogByTitleRef({ title: ..., limit: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = searchCatalogByTitleRef(dataConnect, searchCatalogByTitleVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.bookCatalogs);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.bookCatalogs);
});
```

## SearchCatalog
You can execute the `SearchCatalog` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
searchCatalog(vars: SearchCatalogVariables, options?: ExecuteQueryOptions): QueryPromise<SearchCatalogData, SearchCatalogVariables>;

interface SearchCatalogRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: SearchCatalogVariables): QueryRef<SearchCatalogData, SearchCatalogVariables>;
}
export const searchCatalogRef: SearchCatalogRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
searchCatalog(dc: DataConnect, vars: SearchCatalogVariables, options?: ExecuteQueryOptions): QueryPromise<SearchCatalogData, SearchCatalogVariables>;

interface SearchCatalogRef {
  ...
  (dc: DataConnect, vars: SearchCatalogVariables): QueryRef<SearchCatalogData, SearchCatalogVariables>;
}
export const searchCatalogRef: SearchCatalogRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the searchCatalogRef:
```typescript
const name = searchCatalogRef.operationName;
console.log(name);
```

### Variables
The `SearchCatalog` query requires an argument of type `SearchCatalogVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface SearchCatalogVariables {
  query: string;
  limit?: number | null;
}
```
### Return Type
Recall that executing the `SearchCatalog` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `SearchCatalogData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface SearchCatalogData {
  bookCatalogs: ({
    id: number;
    title: string;
    author: string;
    language: string;
    publisher?: string | null;
    publicationYear?: number | null;
    genre?: string | null;
    coverUrl?: string | null;
    originalLanguage?: string | null;
    countryOfOrigin?: string | null;
    workId?: number | null;
  } & BookCatalog_Key)[];
}
```
### Using `SearchCatalog`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, searchCatalog, SearchCatalogVariables } from '@dataconnect/generated';

// The `SearchCatalog` query requires an argument of type `SearchCatalogVariables`:
const searchCatalogVars: SearchCatalogVariables = {
  query: ..., 
  limit: ..., // optional
};

// Call the `searchCatalog()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await searchCatalog(searchCatalogVars);
// Variables can be defined inline as well.
const { data } = await searchCatalog({ query: ..., limit: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await searchCatalog(dataConnect, searchCatalogVars);

console.log(data.bookCatalogs);

// Or, you can use the `Promise` API.
searchCatalog(searchCatalogVars).then((response) => {
  const data = response.data;
  console.log(data.bookCatalogs);
});
```

### Using `SearchCatalog`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, searchCatalogRef, SearchCatalogVariables } from '@dataconnect/generated';

// The `SearchCatalog` query requires an argument of type `SearchCatalogVariables`:
const searchCatalogVars: SearchCatalogVariables = {
  query: ..., 
  limit: ..., // optional
};

// Call the `searchCatalogRef()` function to get a reference to the query.
const ref = searchCatalogRef(searchCatalogVars);
// Variables can be defined inline as well.
const ref = searchCatalogRef({ query: ..., limit: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = searchCatalogRef(dataConnect, searchCatalogVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.bookCatalogs);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.bookCatalogs);
});
```

## ListWorks
You can execute the `ListWorks` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listWorks(vars?: ListWorksVariables, options?: ExecuteQueryOptions): QueryPromise<ListWorksData, ListWorksVariables>;

interface ListWorksRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars?: ListWorksVariables): QueryRef<ListWorksData, ListWorksVariables>;
}
export const listWorksRef: ListWorksRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listWorks(dc: DataConnect, vars?: ListWorksVariables, options?: ExecuteQueryOptions): QueryPromise<ListWorksData, ListWorksVariables>;

interface ListWorksRef {
  ...
  (dc: DataConnect, vars?: ListWorksVariables): QueryRef<ListWorksData, ListWorksVariables>;
}
export const listWorksRef: ListWorksRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listWorksRef:
```typescript
const name = listWorksRef.operationName;
console.log(name);
```

### Variables
The `ListWorks` query has an optional argument of type `ListWorksVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ListWorksVariables {
  limit?: number | null;
  offset?: number | null;
}
```
### Return Type
Recall that executing the `ListWorks` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListWorksData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ListWorksData {
  works: ({
    id: number;
    title: string;
    author: string;
    originalLanguage?: string | null;
    firstPublishedYear?: number | null;
    genre?: string | null;
    coverUrl?: string | null;
  } & Work_Key)[];
}
```
### Using `ListWorks`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listWorks, ListWorksVariables } from '@dataconnect/generated';

// The `ListWorks` query has an optional argument of type `ListWorksVariables`:
const listWorksVars: ListWorksVariables = {
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `listWorks()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listWorks(listWorksVars);
// Variables can be defined inline as well.
const { data } = await listWorks({ limit: ..., offset: ..., });
// Since all variables are optional for this query, you can omit the `ListWorksVariables` argument.
const { data } = await listWorks();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listWorks(dataConnect, listWorksVars);

console.log(data.works);

// Or, you can use the `Promise` API.
listWorks(listWorksVars).then((response) => {
  const data = response.data;
  console.log(data.works);
});
```

### Using `ListWorks`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listWorksRef, ListWorksVariables } from '@dataconnect/generated';

// The `ListWorks` query has an optional argument of type `ListWorksVariables`:
const listWorksVars: ListWorksVariables = {
  limit: ..., // optional
  offset: ..., // optional
};

// Call the `listWorksRef()` function to get a reference to the query.
const ref = listWorksRef(listWorksVars);
// Variables can be defined inline as well.
const ref = listWorksRef({ limit: ..., offset: ..., });
// Since all variables are optional for this query, you can omit the `ListWorksVariables` argument.
const ref = listWorksRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listWorksRef(dataConnect, listWorksVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.works);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.works);
});
```

# Mutations

No mutations were generated for the `catalog` connector.

If you want to learn more about how to use mutations in Data Connect, you can follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

