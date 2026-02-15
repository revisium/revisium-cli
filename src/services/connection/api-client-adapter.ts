import { RevisionScope } from '@revisium/client';
import { ApiClient } from '../sync/row-sync.service';

export function createApiClientAdapter(
  revisionScope: RevisionScope,
): ApiClient {
  return {
    async rows(tableId, options) {
      try {
        const data = await revisionScope.getRows(tableId, {
          first: options.first,
          after: options.after,
          orderBy: options.orderBy,
        });

        return {
          data: {
            edges: data.edges.map((e) => ({
              node: { id: e.node.id, data: e.node.data },
            })),
            pageInfo: {
              hasNextPage: data.pageInfo.hasNextPage,
              endCursor: data.pageInfo.endCursor ?? '',
            },
          },
        };
      } catch (error) {
        return { error };
      }
    },

    async createRows(tableId, data) {
      try {
        await revisionScope.createRows(tableId, data.rows, {
          isRestore: data.isRestore,
        });
        return { data: true };
      } catch (error) {
        return { error };
      }
    },

    async updateRows(tableId, data) {
      try {
        await revisionScope.updateRows(tableId, data.rows, {
          isRestore: data.isRestore,
        });
        return { data: true };
      } catch (error) {
        return { error };
      }
    },
  };
}
