import { BACKUP_TABLES, isBackupData } from '../src/db/backupRepository';

describe('isBackupData (restore guard)', () => {
  it('accepts a well-formed Healthy backup envelope', () => {
    expect(
      isBackupData({ app: 'healthy', schema: 1, exportedAt: 1, tables: {} }),
    ).toBe(true);
  });

  it('rejects arbitrary or foreign JSON so a bad file cannot wipe local data', () => {
    expect(isBackupData(null)).toBe(false);
    expect(isBackupData('healthy')).toBe(false);
    expect(isBackupData({ tables: {} })).toBe(false); // no app marker
    expect(isBackupData({ app: 'other', exportedAt: 1, tables: {} })).toBe(
      false,
    );
    expect(isBackupData({ app: 'healthy', exportedAt: 1 })).toBe(false); // no tables
    expect(
      isBackupData({ app: 'healthy', exportedAt: '1', tables: {} }),
    ).toBe(false); // exportedAt not a number
  });

  it('backs up user data but never the rebuildable health cache', () => {
    expect(BACKUP_TABLES).toContain('goals');
    expect(BACKUP_TABLES).toContain('common_foods');
    expect(BACKUP_TABLES).not.toContain('health_cache');
  });
});
