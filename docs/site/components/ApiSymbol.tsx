// One exported symbol of the API reference: a
// server component with no client JavaScript. The signature is a highlighted
// code block, JSDoc renders through the markdown pipeline, members (and a
// component's props) render as a table with optional / inherited markers.
import type { ApiKind, ApiMember, ApiSymbol as ApiSymbolData, ApiTag } from '../lib/api-reference';
import { renderCodeBlock, renderMarkdown } from '../lib/markdown';

/** JSDoc markdown to HTML; `{@link Name}` / `{@link Name text}` become inline code. */
function jsdocHtml(markdown: string, sourceDir: string): string {
  if (markdown.trim() === '') return '';
  const text = markdown.replace(/\{@link(?:code|plain)?\s+([^\s}|]+)(?:[\s|]+([^}]*))?\}/g, (_, target: string, label?: string) =>
    label && label.trim() !== '' ? `${label.trim()} (\`${target}\`)` : `\`${target}\``,
  );
  return renderMarkdown(text, { sourceDir }).html;
}

/**
 * Signatures longer than this render as plain code, not highlighted.
 * A long one is a member list (an
 * interface's, which the members table repeats, or a locale object's),
 * and its highlight tokens, repeated in the inlined RSC payload, took
 * `react/scheduler/SchedulerProps` (125 members, a 9.3 KB signature,
 * 84 KB highlighted) over the page budget.
 */
export const HIGHLIGHT_SIGNATURE_LIMIT = 4_000;

export function KindBadge({ kind }: { kind: ApiKind }) {
  return <span className={`api-kind api-kind--${kind}`}>{kind}</span>;
}

function TagList({ tags, sourceDir }: { tags: readonly ApiTag[]; sourceDir: string }) {
  const shown = tags.filter((tag) => tag.name !== 'deprecated');
  if (shown.length === 0) return null;
  return (
    <dl className="api-tags">
      {shown.map((tag, index) => {
        const isExample = tag.name === 'example' && !tag.text.includes('```');
        const html = isExample ? renderCodeBlock(tag.text.trim(), 'tsx') : jsdocHtml(tag.text, sourceDir);
        return (
          <div key={`${index}-${tag.name}`} className="api-tags__item">
            <dt>@{tag.name}</dt>
            <dd dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        );
      })}
    </dl>
  );
}

function Deprecated({ tags, sourceDir }: { tags: readonly ApiTag[]; sourceDir: string }) {
  const tag = tags.find((candidate) => candidate.name === 'deprecated');
  if (!tag) return null;
  return (
    <div className="api-deprecated">
      <strong>Deprecated.</strong> <span dangerouslySetInnerHTML={{ __html: jsdocHtml(tag.text, sourceDir) }} />
    </div>
  );
}

function MembersTable({ members, caption, sourceDir }: { members: readonly ApiMember[]; caption: string; sourceDir: string }) {
  return (
    <div className="api-members__scroll">
      <table className="api-members">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Signature</th>
            <th scope="col">Description</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member, index) => (
            <tr key={`${index}-${member.name}`} data-inherited={member.inherited ? '' : undefined}>
              <th scope="row">
                <code>{member.name}</code>
                {member.optional ? <span className="api-flag">optional</span> : null}
                {member.inherited ? (
                  <span className="api-flag api-flag--inherited" title="Declared on a base type">
                    inherited
                  </span>
                ) : null}
              </th>
              <td>
                <code className="api-members__signature">{member.signature}</code>
              </td>
              <td>
                <Deprecated tags={member.tags} sourceDir={sourceDir} />
                <div className="api-prose" dangerouslySetInnerHTML={{ __html: jsdocHtml(member.docs, sourceDir) }} />
                <TagList tags={member.tags} sourceDir={sourceDir} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The body of a symbol page: deprecation
 * notice, signature, JSDoc, tags, a component's props and the members. The
 * page renders the name and kind badge as its h1.
 */
export function ApiSymbol({
  symbol,
  props,
  sourceDir,
}: {
  symbol: ApiSymbolData;
  /** A component's props type from the same entry (whose members are listed as props) and its page. */
  props?: { symbol: ApiSymbolData; href: string } | undefined;
  /** Repository-relative source directory used to resolve relative JSDoc links. */
  sourceDir: string;
}) {
  const members = symbol.members ?? [];
  const inherited = members.filter((member) => member.inherited).length;
  return (
    <section className="api-symbol">
      <Deprecated tags={symbol.tags} sourceDir={sourceDir} />
      <div className="api-symbol__signature" dangerouslySetInnerHTML={{ __html: renderCodeBlock(symbol.signature, symbol.signature.length <= HIGHLIGHT_SIGNATURE_LIMIT ? 'ts' : undefined) }} />
      <div className="api-prose" dangerouslySetInnerHTML={{ __html: jsdocHtml(symbol.docs, sourceDir) }} />
      <TagList tags={symbol.tags} sourceDir={sourceDir} />
      {props ? (
        <>
          <p className="api-symbol__props">
            Props: <a href={props.href}>
              <code>{props.symbol.name}</code>
            </a>
          </p>
          <MembersTable
            members={props.symbol.members ?? []}
            caption={`${symbol.name} props (${props.symbol.members?.length ?? 0})`}
            sourceDir={sourceDir}
          />
        </>
      ) : null}
      {members.length > 0 ? (
        <MembersTable
          members={members}
          caption={`${symbol.name} members (${members.length}${inherited > 0 ? `, ${inherited} inherited` : ''})`}
          sourceDir={sourceDir}
        />
      ) : null}
    </section>
  );
}
