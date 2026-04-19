import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { resolveClaudeBinary } from './claude-cli';

describe('claude-cli', () => {
  describe('resolveClaudeBinary', () => {
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
  });
});
