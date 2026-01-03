import {
  createEmptyUploadStats,
  aggregateUploadStats,
  formatUploadSummary,
  formatTableResult,
  UploadStats,
} from '../stats-formatter.utils';

describe('stats-formatter.utils', () => {
  describe('createEmptyUploadStats', () => {
    it('creates stats with all zeros', () => {
      const stats = createEmptyUploadStats();

      expect(stats).toEqual({
        totalRows: 0,
        uploaded: 0,
        updated: 0,
        skipped: 0,
        invalidSchema: 0,
        createErrors: 0,
        updateErrors: 0,
        otherErrors: 0,
      });
    });
  });

  describe('aggregateUploadStats', () => {
    it('aggregates table stats into total', () => {
      const total = createEmptyUploadStats();
      const table1: UploadStats = {
        totalRows: 100,
        uploaded: 50,
        updated: 30,
        skipped: 15,
        invalidSchema: 2,
        createErrors: 1,
        updateErrors: 1,
        otherErrors: 1,
      };
      const table2: UploadStats = {
        totalRows: 50,
        uploaded: 20,
        updated: 15,
        skipped: 10,
        invalidSchema: 3,
        createErrors: 1,
        updateErrors: 0,
        otherErrors: 1,
      };

      aggregateUploadStats(total, table1);
      aggregateUploadStats(total, table2);

      expect(total).toEqual({
        totalRows: 150,
        uploaded: 70,
        updated: 45,
        skipped: 25,
        invalidSchema: 5,
        createErrors: 2,
        updateErrors: 1,
        otherErrors: 2,
      });
    });
  });

  describe('formatUploadSummary', () => {
    it('formats summary with all stats', () => {
      const stats: UploadStats = {
        totalRows: 100,
        uploaded: 50,
        updated: 30,
        skipped: 15,
        invalidSchema: 2,
        createErrors: 1,
        updateErrors: 1,
        otherErrors: 1,
      };

      const lines = formatUploadSummary(stats);

      expect(lines).toContain('\n🎉 Upload Summary:');
      expect(lines).toContain('📊 Total rows processed: 100');
      expect(lines).toContain('⬆️  Uploaded (new): 50');
      expect(lines).toContain('🔄 Updated (changed): 30');
      expect(lines).toContain('⏭️  Skipped (identical): 15');
      expect(lines).toContain('❌ Invalid schema: 2');
      expect(lines).toContain('🚫 Create errors: 1');
      expect(lines).toContain('⚠️  Update errors: 1');
      expect(lines).toContain('💥 Other errors: 1');
      expect(lines).toContain('✅ Success rate: 80.0% (3 total errors)');
    });

    it('handles zero total rows', () => {
      const stats = createEmptyUploadStats();
      const lines = formatUploadSummary(stats);

      expect(lines).toContain('✅ Success rate: 0% (0 total errors)');
    });

    it('calculates 100% success rate when no errors', () => {
      const stats: UploadStats = {
        totalRows: 50,
        uploaded: 30,
        updated: 20,
        skipped: 0,
        invalidSchema: 0,
        createErrors: 0,
        updateErrors: 0,
        otherErrors: 0,
      };

      const lines = formatUploadSummary(stats);
      expect(lines).toContain('✅ Success rate: 100.0% (0 total errors)');
    });
  });

  describe('formatTableResult', () => {
    it('formats table result string', () => {
      const stats: UploadStats = {
        totalRows: 100,
        uploaded: 50,
        updated: 30,
        skipped: 15,
        invalidSchema: 2,
        createErrors: 1,
        updateErrors: 1,
        otherErrors: 1,
      };

      const result = formatTableResult('users', stats);

      expect(result).toBe(
        '✅ Table users: 50 uploaded, 30 updated, 15 skipped, 2 invalid schema, 1 create errors, 1 update errors, 1 other errors',
      );
    });
  });
});
