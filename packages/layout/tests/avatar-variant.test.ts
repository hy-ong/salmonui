import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { Avatar } from '@salmonui/layout/avatar';

describe('Avatar variant', () => {
  it('writes data-variant only for solid', () => {
    assert.ok(!renderToString(h(Avatar, { name: 'Joyce' })).includes('data-variant'));
    assert.ok(!renderToString(h(Avatar, { name: 'Joyce', variant: 'soft' })).includes('data-variant'));
    assert.match(renderToString(h(Avatar, { name: 'Joyce', variant: 'solid', tone: 'primary' })), /data-tone="primary" data-variant="solid"/);
  });
});
