import { Api, OrderByDto } from 'src/__generated__/api';
import { ApiClient } from '../sync/row-sync.service';

type GeneratedApi = Api<unknown>['api'];

export function createApiClientAdapter(api: GeneratedApi): ApiClient {
  return {
    async rows(revisionId, tableId, options) {
      const result = await api.rows(revisionId, tableId, {
        first: options.first,
        after: options.after,
        orderBy: options.orderBy as OrderByDto[],
      });

      if (result.error) {
        return { error: result.error };
      }

      return {
        data: {
          edges: result.data.edges.map((edge) => ({
            node: { id: edge.node.id, data: edge.node.data },
          })),
          pageInfo: {
            hasNextPage: result.data.pageInfo.hasNextPage,
            endCursor: result.data.pageInfo.endCursor ?? '',
          },
        },
      };
    },

    async createRows(revisionId, tableId, data) {
      const result = await api.createRows(revisionId, tableId, {
        rows: data.rows,
        isRestore: data.isRestore,
      });

      if (result.error) {
        return { error: result.error };
      }

      return { data: result.data };
    },

    async updateRows(revisionId, tableId, data) {
      const result = await api.updateRows(revisionId, tableId, {
        rows: data.rows,
        isRestore: data.isRestore,
      });

      if (result.error) {
        return { error: result.error };
      }

      return { data: result.data };
    },
  };
}
