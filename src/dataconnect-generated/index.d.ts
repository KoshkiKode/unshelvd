import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, ExecuteQueryOptions, DataConnectSettings } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;
export const dataConnectSettings: DataConnectSettings;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface AuditLog_Key {
  id: number;
  __typename?: 'AuditLog_Key';
}

export interface BlockRecord_Key {
  id: number;
  __typename?: 'BlockRecord_Key';
}

export interface BookCatalog_Key {
  id: number;
  __typename?: 'BookCatalog_Key';
}

export interface BookRequest_Key {
  id: number;
  __typename?: 'BookRequest_Key';
}

export interface Book_Key {
  id: number;
  __typename?: 'Book_Key';
}

export interface Conversation_Key {
  id: number;
  __typename?: 'Conversation_Key';
}

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

export interface ListCatalogEntriesVariables {
  limit?: number | null;
  offset?: number | null;
}

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

export interface ListWorksVariables {
  limit?: number | null;
  offset?: number | null;
}

export interface Message_Key {
  id: number;
  __typename?: 'Message_Key';
}

export interface Offer_Key {
  id: number;
  __typename?: 'Offer_Key';
}

export interface PlatformSetting_Key {
  settingKey: string;
  __typename?: 'PlatformSetting_Key';
}

export interface Report_Key {
  id: number;
  __typename?: 'Report_Key';
}

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

export interface SearchCatalogByTitleVariables {
  title: string;
  limit?: number | null;
}

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

export interface SearchCatalogVariables {
  query: string;
  limit?: number | null;
}

export interface Transaction_Key {
  id: number;
  __typename?: 'Transaction_Key';
}

export interface User_Key {
  id: number;
  __typename?: 'User_Key';
}

export interface Work_Key {
  id: number;
  __typename?: 'Work_Key';
}

interface ListCatalogEntriesRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars?: ListCatalogEntriesVariables): QueryRef<ListCatalogEntriesData, ListCatalogEntriesVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars?: ListCatalogEntriesVariables): QueryRef<ListCatalogEntriesData, ListCatalogEntriesVariables>;
  operationName: string;
}
export const listCatalogEntriesRef: ListCatalogEntriesRef;

export function listCatalogEntries(vars?: ListCatalogEntriesVariables, options?: ExecuteQueryOptions): QueryPromise<ListCatalogEntriesData, ListCatalogEntriesVariables>;
export function listCatalogEntries(dc: DataConnect, vars?: ListCatalogEntriesVariables, options?: ExecuteQueryOptions): QueryPromise<ListCatalogEntriesData, ListCatalogEntriesVariables>;

interface SearchCatalogByTitleRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: SearchCatalogByTitleVariables): QueryRef<SearchCatalogByTitleData, SearchCatalogByTitleVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: SearchCatalogByTitleVariables): QueryRef<SearchCatalogByTitleData, SearchCatalogByTitleVariables>;
  operationName: string;
}
export const searchCatalogByTitleRef: SearchCatalogByTitleRef;

export function searchCatalogByTitle(vars: SearchCatalogByTitleVariables, options?: ExecuteQueryOptions): QueryPromise<SearchCatalogByTitleData, SearchCatalogByTitleVariables>;
export function searchCatalogByTitle(dc: DataConnect, vars: SearchCatalogByTitleVariables, options?: ExecuteQueryOptions): QueryPromise<SearchCatalogByTitleData, SearchCatalogByTitleVariables>;

interface SearchCatalogRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: SearchCatalogVariables): QueryRef<SearchCatalogData, SearchCatalogVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: SearchCatalogVariables): QueryRef<SearchCatalogData, SearchCatalogVariables>;
  operationName: string;
}
export const searchCatalogRef: SearchCatalogRef;

export function searchCatalog(vars: SearchCatalogVariables, options?: ExecuteQueryOptions): QueryPromise<SearchCatalogData, SearchCatalogVariables>;
export function searchCatalog(dc: DataConnect, vars: SearchCatalogVariables, options?: ExecuteQueryOptions): QueryPromise<SearchCatalogData, SearchCatalogVariables>;

interface ListWorksRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars?: ListWorksVariables): QueryRef<ListWorksData, ListWorksVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars?: ListWorksVariables): QueryRef<ListWorksData, ListWorksVariables>;
  operationName: string;
}
export const listWorksRef: ListWorksRef;

export function listWorks(vars?: ListWorksVariables, options?: ExecuteQueryOptions): QueryPromise<ListWorksData, ListWorksVariables>;
export function listWorks(dc: DataConnect, vars?: ListWorksVariables, options?: ExecuteQueryOptions): QueryPromise<ListWorksData, ListWorksVariables>;

