import { ListCatalogEntriesData, ListCatalogEntriesVariables, SearchCatalogByTitleData, SearchCatalogByTitleVariables, SearchCatalogData, SearchCatalogVariables, ListWorksData, ListWorksVariables } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useListCatalogEntries(vars?: ListCatalogEntriesVariables, options?: useDataConnectQueryOptions<ListCatalogEntriesData>): UseDataConnectQueryResult<ListCatalogEntriesData, ListCatalogEntriesVariables>;
export function useListCatalogEntries(dc: DataConnect, vars?: ListCatalogEntriesVariables, options?: useDataConnectQueryOptions<ListCatalogEntriesData>): UseDataConnectQueryResult<ListCatalogEntriesData, ListCatalogEntriesVariables>;

export function useSearchCatalogByTitle(vars: SearchCatalogByTitleVariables, options?: useDataConnectQueryOptions<SearchCatalogByTitleData>): UseDataConnectQueryResult<SearchCatalogByTitleData, SearchCatalogByTitleVariables>;
export function useSearchCatalogByTitle(dc: DataConnect, vars: SearchCatalogByTitleVariables, options?: useDataConnectQueryOptions<SearchCatalogByTitleData>): UseDataConnectQueryResult<SearchCatalogByTitleData, SearchCatalogByTitleVariables>;

export function useSearchCatalog(vars: SearchCatalogVariables, options?: useDataConnectQueryOptions<SearchCatalogData>): UseDataConnectQueryResult<SearchCatalogData, SearchCatalogVariables>;
export function useSearchCatalog(dc: DataConnect, vars: SearchCatalogVariables, options?: useDataConnectQueryOptions<SearchCatalogData>): UseDataConnectQueryResult<SearchCatalogData, SearchCatalogVariables>;

export function useListWorks(vars?: ListWorksVariables, options?: useDataConnectQueryOptions<ListWorksData>): UseDataConnectQueryResult<ListWorksData, ListWorksVariables>;
export function useListWorks(dc: DataConnect, vars?: ListWorksVariables, options?: useDataConnectQueryOptions<ListWorksData>): UseDataConnectQueryResult<ListWorksData, ListWorksVariables>;
