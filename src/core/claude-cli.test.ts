import { strict as assert } from 'assert';
import { describe, it, beforeEach } from 'mocha';
import { resolveClaudeBinary, _resetCache } from './claude-cli';

describe('claude-cli', () => {
  describe('resolveClaudeBinary', () => {
    beforeEach(() => _resetCache());

    it('returns a binary path or "claude" fallback', async () => {
      const result = await resolveClaudeBinary();
      assert.equal(typeof result.bin, 'string');
      assert.equal(typeof result.path, 'string');
      assert.ok(result.bin.length > 0);
    });

    it('caches the result on repeated calls', async () => {
      const first = await resolveClaudeBinary();
      const second = await resolveClaudeBinary();
      assert.strictEqual(first, second); // same object reference (cached)
    });

    it('re-resolves after cache reset', async () => {
      const first = await resolveClaudeBinary();
      _resetCache();
      const second = await resolveClaudeBinary();
      assert.notStrictEqual(first, second);
    });
  });
});
