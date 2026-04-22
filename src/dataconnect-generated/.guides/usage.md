# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.




### React
For each operation, there is a wrapper hook that can be used to call the operation.

Here are all of the hooks that get generated:
```ts
import { useListCatalogEntries, useSearchCatalogByTitle, useSearchCatalog, useListWorks } from '@dataconnect/generated/react';
// The types of these hooks are available in react/index.d.ts

const { data, isPending, isSuccess, isError, error } = useListCatalogEntries(listCatalogEntriesVars);

const { data, isPending, isSuccess, isError, error } = useSearchCatalogByTitle(searchCatalogByTitleVars);

const { data, isPending, isSuccess, isError, error } = useSearchCatalog(searchCatalogVars);

const { data, isPending, isSuccess, isError, error } = useListWorks(listWorksVars);

```

Here's an example from a different generated SDK:

```ts
import { useListAllMovies } from '@dataconnect/generated/react';

function MyComponent() {
  const { isLoading, data, error } = useListAllMovies();
  if(isLoading) {
    return <div>Loading...</div>
  }
  if(error) {
    return <div> An Error Occurred: {error} </div>
  }
}

// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyComponent from './my-component';

function App() {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>
    <MyComponent />
  </QueryClientProvider>
}
```



## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { listCatalogEntries, searchCatalogByTitle, searchCatalog, listWorks } from '@dataconnect/generated';


// Operation ListCatalogEntries:  For variables, look at type ListCatalogEntriesVars in ../index.d.ts
const { data } = await ListCatalogEntries(dataConnect, listCatalogEntriesVars);

// Operation SearchCatalogByTitle:  For variables, look at type SearchCatalogByTitleVars in ../index.d.ts
const { data } = await SearchCatalogByTitle(dataConnect, searchCatalogByTitleVars);

// Operation SearchCatalog:  For variables, look at type SearchCatalogVars in ../index.d.ts
const { data } = await SearchCatalog(dataConnect, searchCatalogVars);

// Operation ListWorks:  For variables, look at type ListWorksVars in ../index.d.ts
const { data } = await ListWorks(dataConnect, listWorksVars);


```