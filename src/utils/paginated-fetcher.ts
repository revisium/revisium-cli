export type PageInfo = {
  hasNextPage: boolean;
  endCursor?: string | null;
};

export type PaginatedResponse<T> = {
  edges: Array<{ node: T }>;
  pageInfo: PageInfo;
  totalCount: number;
};

export type PaginationParams = {
  first: number;
  after?: string;
};

export type FetchPageFn<T> = (
  params: PaginationParams,
) => Promise<{ data: PaginatedResponse<T> }>;

export type FetchOptions = {
  pageSize?: number;
};

export async function fetchAllPages<T>(
  fetchPage: FetchPageFn<T>,
  options: FetchOptions = {},
): Promise<{ items: T[]; totalCount: number }> {
  const pageSize = options.pageSize ?? 100;
  const items: T[] = [];
  let hasMore = true;
  let after: string | undefined;
  let totalCount = 0;

  while (hasMore) {
    const result = await fetchPage({ first: pageSize, after });
    const { edges, pageInfo } = result.data;

    if (totalCount === 0) {
      totalCount = result.data.totalCount;
    }

    for (const edge of edges) {
      items.push(edge.node);
    }

    hasMore = pageInfo.hasNextPage;
    after = pageInfo.endCursor ?? undefined;
  }

  return { items, totalCount };
}

export type ProcessItemFn<T> = (item: T, index: number) => Promise<void>;

export type FetchAndProcessOptions = FetchOptions & {
  onFirstPage?: (totalCount: number) => void;
  onProgress?: (processed: number, total: number) => void;
};

export async function fetchAndProcessPages<T>(
  fetchPage: FetchPageFn<T>,
  processItem: ProcessItemFn<T>,
  options: FetchAndProcessOptions = {},
): Promise<{ processed: number; total: number }> {
  const pageSize = options.pageSize ?? 100;
  let hasMore = true;
  let after: string | undefined;
  let totalCount = 0;
  let processed = 0;
  let isFirstPage = true;

  while (hasMore) {
    const result = await fetchPage({ first: pageSize, after });
    const { edges, pageInfo } = result.data;

    if (isFirstPage) {
      totalCount = result.data.totalCount;
      options.onFirstPage?.(totalCount);
      isFirstPage = false;
    }

    for (const edge of edges) {
      await processItem(edge.node, processed);
      processed++;
      options.onProgress?.(processed, totalCount);
    }

    hasMore = pageInfo.hasNextPage;
    after = pageInfo.endCursor ?? undefined;
  }

  return { processed, total: totalCount };
}
